import { fail, readJSON, send } from "../http.mjs";
import { validatePNG } from "../image.mjs";
import { normalize } from "../../../public/js/studio/render.js";

export function createCodexHandler({ codexFinder, codexOpener, handoffRoot }) {
  let openingCodex = false;
  return async function codex(req, res) {
    if (req.method === "GET") {
      send(res, 200, { available: Boolean(await codexFinder()) });
      return;
    }
    if (req.method !== "POST") fail(405, "Use POST to open a kit.");
    if (openingCodex) fail(429, "A kit is already opening.");
    openingCodex = true;
    try {
      const body = await readJSON(req);
      validatePNG(body?.source);
      if (typeof body.prompt !== "string" || body.prompt.length > 6000)
        fail(400, "Use a prompt under 6000 characters.");
      const raw = body.recipe;
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        !["fur", "clay"].includes(raw.material) ||
        !["fur", "mascot"].includes(raw.mode) ||
        typeof raw.artDirection !== "string" ||
        raw.artDirection.length > 2000
      )
        fail(400, "Choose a supported style.");
      const executable = await codexFinder();
      if (!executable)
        fail(
          409,
          "Automatic opening needs the Codex desktop app and CLI on macOS. Download the kit and open its folder in Codex instead.",
        );
      const recipe = {
        ...normalize(raw),
        version: 1,
        mode: raw.mode,
        material: raw.material,
        artDirection: raw.artDirection,
      };
      const folder = await codexOpener(
        { source: body.source, recipe, prompt: body.prompt },
        { root: handoffRoot, executable },
      );
      send(res, 200, { folder });
    } finally {
      openingCodex = false;
    }
  };
}
