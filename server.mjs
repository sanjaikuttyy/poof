import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPoofServer } from "./src/server/app.mjs";

// Preserve the existing programmatic entry point as well as npm start.
export { createPoofServer };
export { buildPrompt } from "./src/server/prompt.mjs";
export { validatePNG } from "./src/server/image.mjs";

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 8770);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  createPoofServer().listen(port, "127.0.0.1", () =>
    console.log(`Poof is ready: http://127.0.0.1:${port}`),
  );
}
