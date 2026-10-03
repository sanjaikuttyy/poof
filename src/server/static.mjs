import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fail } from "./http.mjs";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".md": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

export async function serveStatic(req, res, url, publicDir) {
  if (!["GET", "HEAD"].includes(req.method)) fail(405, "Method not allowed.");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    fail(400, "Invalid path.");
  }
  if (
    pathname.includes("\0") ||
    pathname.split("/").some((part) => part.startsWith("."))
  )
    fail(404, "Not found.");
  if (pathname === "/studio" || pathname === "/studio/") {
    res.writeHead(302, { Location: "/#studio" });
    res.end();
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const root = await realpath(publicDir);
  let target;
  try {
    target = await realpath(path.resolve(root, `.${pathname}`));
  } catch {
    fail(404, "Not found.");
  }
  if (!target.startsWith(root + path.sep) || !(await stat(target)).isFile())
    fail(404, "Not found.");
  const content = await readFile(target);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(target)] || "application/octet-stream",
    "Content-Length": content.length,
    "Cache-Control": "no-cache",
  });
  res.end(req.method === "HEAD" ? undefined : content);
}
