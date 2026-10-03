import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPoofServer, buildPrompt, validatePNG } from "../server.mjs";

const base64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const png = `data:image/png;base64,${base64}`;
const payload = {
  image: png,
  key: "sk-test-not-a-real-key",
  mode: "fur",
  material: "fur",
};
async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "poof-test-"));
  await writeFile(path.join(dir, "index.html"), "<h1>Poof</h1>");
  const server = createPoofServer({ publicDir: dir, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body = payload, headers = {}) =>
    fetch(`${url}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { server, url, post, dir };
}
test("edits preserve identity, use one transparent PNG request, and return the image", async (t) => {
  let called = 0;
  const { post } = await setup(t, {
    fetchImpl: async (url, options) => {
      called++;
      assert.equal(url, "https://api.openai.com/v1/images/edits");
      assert.equal(options.headers.Authorization, `Bearer ${payload.key}`);
      assert.equal(options.body.get("model"), "gpt-image-2.5-sunburst");
      assert.equal(options.body.get("n"), "1");
      assert.equal(options.body.get("size"), "1024x1024");
      assert.equal(options.body.get("background"), "transparent");
      assert.equal(options.body.get("output_format"), "png");
      assert.match(
        options.body.get("prompt"),
        /Preserve its exact recognizable silhouette/,
      );
      assert.deepEqual(
        Buffer.from(await options.body.get("image[]").arrayBuffer()),
        Buffer.from(base64, "base64"),
      );
      return Response.json({ data: [{ b64_json: base64 }] });
    },
  });
  const response = await post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { image: png });
  assert.equal(called, 1);
});
test("untrusted origins and host headers cannot use the local key proxy", async (t) => {
  const { post, url } = await setup(t, {
    fetchImpl: () => assert.fail("must not call OpenAI"),
  });
  assert.equal(
    (await post(payload, { origin: "https://evil.example" })).status,
    403,
  );
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { headers: { host: "evil.example:8770" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal(
    (await post(payload, { "sec-fetch-site": "cross-site" })).status,
    403,
  );
});
test("rejects malformed, oversized-dimension images and unsupported settings before calling OpenAI", async (t) => {
  const { post } = await setup(t, {
    fetchImpl: () => assert.fail("must not call OpenAI"),
  });
  for (const changes of [
    { image: "data:image/png;base64,a===" },
    { key: "" },
    { mode: "unknown" },
    { material: "metal" },
    { prompt: "x".repeat(2001) },
  ])
    assert.equal((await post({ ...payload, ...changes })).status, 400);
  const bytes = Buffer.from(base64, "base64");
  bytes.writeUInt32BE(65535, 16);
  assert.equal(
    (
      await post({
        ...payload,
        image: `data:image/png;base64,${bytes.toString("base64")}`,
      })
    ).status,
    400,
  );
  assert.throws(() => validatePNG(png.slice(0, -16)));
});
test("upstream errors never echo secrets and are not retried", async (t) => {
  let calls = 0;
  const { post } = await setup(t, {
    fetchImpl: async () => {
      calls++;
      return Response.json(
        { error: { message: payload.key } },
        { status: 401 },
      );
    },
  });
  const response = await post();
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes(payload.key));
  assert.equal(calls, 1);
});
test("timeout cancels upstream request", async (t) => {
  let aborted = false;
  const { post } = await setup(t, {
    timeoutMs: 20,
    fetchImpl: (_, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        }),
      ),
  });
  const response = await post();
  assert.equal(response.status, 504);
  assert.equal(aborted, true);
});
test("client disconnect cancels upstream request", async (t) => {
  let start, finish;
  const started = new Promise((resolve) => (start = resolve)),
    aborted = new Promise((resolve) => (finish = resolve));
  const { url } = await setup(t, {
    fetchImpl: (_, { signal }) =>
      new Promise((resolve, reject) => {
        start();
        signal.addEventListener("abort", () => {
          finish();
          reject(new Error("aborted"));
        });
      }),
  });
  const req = http.request(`${url}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  req.on("error", () => {});
  req.end(JSON.stringify(payload));
  await started;
  req.destroy();
  await aborted;
});
test("only one generation can run at a time", async (t) => {
  let finish, start;
  const started = new Promise((resolve) => (start = resolve));
  const { post } = await setup(t, {
    fetchImpl: async () => {
      start();
      await new Promise((resolve) => (finish = resolve));
      return Response.json({ data: [{ b64_json: base64 }] });
    },
  });
  const first = post();
  await started;
  assert.equal((await post()).status, 429);
  finish();
  assert.equal((await first).status, 200);
});
test("static serving excludes symlinks outside public and sets browser protections", async (t) => {
  const { url, dir } = await setup(t);
  await symlink(import.meta.filename, path.join(dir, "private.mjs"));
  assert.equal((await fetch(`${url}/private.mjs`)).status, 404);
  assert.equal((await fetch(`${url}/.env`)).status, 404);
  assert.equal((await fetch(`${url}/api/unknown`)).status, 404);
  const page = await fetch(`${url}/studio`);
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(await page.text(), "<h1>Poof</h1>");
});
test("mascot is an explicit redesign and clay excludes fur", () => {
  assert.match(
    buildPrompt({ mode: "mascot", material: "clay" }),
    /intentional mascot redesign/,
  );
  assert.match(buildPrompt({ material: "clay" }), /No fur/);
});

test("local health check identifies a running Poof server without a key or upstream call", async (t) => {
  const { url } = await setup(t, {
    fetchImpl: () => {
      throw Error("Health must not call OpenAI");
    },
  });
  const r = await fetch(url + "/api/health");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const denied = await fetch(url + "/api/health", {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(denied.status, 403);
});

test("attachment downloads preserve exact bytes and reject cross-origin staging", async (t) => {
  const { zip } = await import("../public/js/exports/zip.js");
  const bytes = Buffer.from(
    await (await zip({ "PROMPT.md": "Example" })).arrayBuffer(),
  );
  const { url } = await setup(t);
  const stage = (body, headers = {}) =>
    fetch(url + "/api/downloads", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const body = {
    filename: "poof-codex-kit.zip",
    data: bytes.toString("base64"),
  };
  assert.equal(
    (await stage(body, { origin: "https://evil.example" })).status,
    403,
  );
  assert.equal((await stage({ ...body, filename: "../secret" })).status, 400);
  assert.equal(
    (
      await stage({
        ...body,
        data: Buffer.from("not a zip").toString("base64"),
      })
    ).status,
    400,
  );
  const response = await stage(body),
    link = (await response.json()).url;
  const saved = await fetch(url + link);
  assert.equal(
    saved.headers.get("content-disposition"),
    'attachment; filename="poof-codex-kit.zip"',
  );
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()), bytes);
  for (let n = 0; n < 3; n++) await stage(body);
  assert.equal((await fetch(url + link)).status, 404);
});

test("Codex handoff includes only artwork and allowed settings, never credentials or arbitrary paths", async (t) => {
  let called = 0;
  const { url } = await setup(t, {
    codexFinder: async () => "/fake/codex",
    codexOpener: async (body, options) => {
      called++;
      assert.equal(body.source, png);
      assert.equal(body.recipe.layout, "right");
      assert.equal(body.recipe.key, undefined);
      assert.equal(body.key, undefined);
      assert.ok(options.root.endsWith("/exports/codex"));
      return "/kit";
    },
  });
  const body = {
    source: png,
    recipe: {
      material: "clay",
      mode: "fur",
      layout: "right",
      artDirection: "Soft",
      key: "excluded",
    },
    prompt: "Use $poof-icon",
    key: "excluded",
    root: "/not-allowed",
  };
  const sendKit = (headers = {}) =>
    fetch(url + "/api/codex", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await sendKit({ origin: "https://evil.example" })).status, 403);
  assert.equal((await sendKit()).status, 200);
  assert.equal(called, 1);
});

test("missing Codex returns a download fallback without launching or installing", async (t) => {
  const { url } = await setup(t, {
    codexFinder: async () => null,
    codexOpener: () => assert.fail("must not launch"),
  });
  const response = await fetch(url + "/api/codex", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: png,
      recipe: { mode: "fur", material: "fur", artDirection: "" },
      prompt: "Use kit",
    }),
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Download the kit/);
});
