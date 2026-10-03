import { dataURL } from "../studio/render.js";
// HTTP attachments work in browsers that restrict blob/data downloads.
// Standalone/offline use keeps the locally generated archive available.
export async function downloadLink(blob, filename) {
  const local = await dataURL(blob);
  try {
    const response = await fetch("/api/downloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, data: local.split(",")[1] }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (response.ok && /^\/api\/downloads\/[a-f0-9-]+$/.test(result.url))
      return result.url;
  } catch {}
  return local;
}
