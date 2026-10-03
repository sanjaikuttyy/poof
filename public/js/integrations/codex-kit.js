import { skill, license } from "../generated/kit-content.js";
import { toBlob } from "../studio/render.js";
import { zip } from "../exports/zip.js";
export function codexKitFiles({ source, recipe, prompt }) {
  if (!source) throw Error("Upload an image before preparing a Codex kit.");
  return {
    "input.png": toBlob(source),
    "recipe.json": JSON.stringify(recipe, null, 2),
    "PROMPT.md": prompt,
    ".agents/skills/poof-icon/SKILL.md": skill,
    "THIRD_PARTY_NOTICES.txt": license,
  };
}
export async function buildCodexKit(options) {
  return zip(codexKitFiles(options));
}
