import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, fail, send, trustedRequest } from "./http.mjs";
import { serveStatic } from "./static.mjs";
import { findCodex, openCodexKit } from "./codex-handoff.mjs";
import { createGenerationHandler } from "./routes/generate.mjs";
import { createCodexHandler } from "./routes/codex.mjs";
import { createDownloadHandler } from "./routes/downloads.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Local-only server. Dependencies are injected so tests need no credentials or desktop app. */
export function createPoofServer({
  publicDir = path.join(ROOT, "public"),
  fetchImpl = globalThis.fetch,
  model = process.env.POOF_IMAGE_MODEL || "gpt-image-2.5-sunburst",
  timeoutMs = 300000,
  codexFinder = findCodex,
  codexOpener = openCodexKit,
  handoffRoot = path.join(ROOT, "exports", "codex"),
} = {}) {
  const generate = createGenerationHandler({ fetchImpl, model, timeoutMs });
  const codex = createCodexHandler({ codexFinder, codexOpener, handoffRoot });
  const downloads = createDownloadHandler();
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    try {
      trustedRequest(req);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/health") {
        if (req.method !== "GET") fail(405, "Use GET for health checks.");
        send(res, 200, { ok: true });
        return;
      }
      if (url.pathname === "/api/generate") return await generate(req, res);
      if (url.pathname === "/api/codex") return await codex(req, res);
      if (await downloads.handle(req, res, url)) return;
      if (url.pathname.startsWith("/api/")) fail(404, "Not found.");
      await serveStatic(req, res, url, publicDir);
    } catch (error) {
      send(res, error.status || 502, {
        error:
          error instanceof HttpError
            ? error.message
            : "Something went wrong. Please try again.",
      });
    }
  });
  server.on("close", () => downloads.close());
  return server;
}
