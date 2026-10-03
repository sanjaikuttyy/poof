import { randomUUID } from "node:crypto";
import { fail, readJSON, send } from "../http.mjs";

export function createDownloadHandler() {
  const downloads = new Map();
  const timer = setInterval(() => {
    for (const [id, item] of downloads)
      if (item.expires < Date.now()) downloads.delete(id);
  }, 30000);
  timer.unref();
  return {
    close() {
      clearInterval(timer);
      downloads.clear();
    },
    async handle(req, res, url) {
      if (url.pathname === "/api/downloads" && req.method === "POST") {
        const body = await readJSON(req);
        if (
          !body ||
          !["poof-codex-kit.zip", "poof-app-icons.zip"].includes(
            body.filename,
          ) ||
          typeof body.data !== "string" ||
          body.data.length > 14 * 1024 * 1024 ||
          body.data.length % 4 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)
        )
          fail(400, "Invalid archive.");
        const bytes = Buffer.from(body.data, "base64");
        if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50)
          fail(400, "Invalid ZIP archive.");
        for (const [id, item] of downloads)
          if (item.expires < Date.now()) downloads.delete(id);
        // Bounded memory, no disk writes. Old links can be regenerated from the page.
        while (downloads.size >= 3)
          downloads.delete(downloads.keys().next().value);
        const id = randomUUID();
        downloads.set(id, {
          bytes,
          filename: body.filename,
          expires: Date.now() + 10 * 60 * 1000,
        });
        send(res, 200, { url: `/api/downloads/${id}` });
        return true;
      }
      if (url.pathname.startsWith("/api/downloads/") && req.method === "GET") {
        const id = url.pathname.slice("/api/downloads/".length),
          item = downloads.get(id);
        if (!item || item.expires < Date.now()) {
          downloads.delete(id);
          fail(404, "Download expired. Prepare your kit again.");
        }
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${item.filename}"`,
          "Content-Length": item.bytes.length,
          "Cache-Control": "no-store",
        });
        res.end(item.bytes);
        return true;
      }
      return false;
    },
  };
}
