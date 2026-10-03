const MAX_BODY = 15 * 1024 * 1024;
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};

export async function readJSON(req) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json")
    fail(415, "Send JSON image data.");
  if (Number(req.headers["content-length"]) > MAX_BODY)
    fail(413, "Upload is too large.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) fail(413, "Upload is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    fail(400, "The request contains invalid JSON.");
  }
}
export function send(res, status, body) {
  if (!res.destroyed && !res.writableEnded) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  }
}
export function trustedRequest(req) {
  const port = req.socket.localPort;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (!hosts.includes(req.headers.host)) fail(403, "Open Poof on localhost.");
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
    fail(403, "This request must come from Poof on localhost.");
  if (req.headers["sec-fetch-site"] === "cross-site")
    fail(403, "Cross-site requests are not allowed.");
}
