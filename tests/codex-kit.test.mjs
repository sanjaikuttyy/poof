import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCodexKit } from "../public/js/integrations/codex-kit.js";
import { skill, license } from "../public/js/generated/kit-content.js";
import { readZip } from "../scripts/verify-package.mjs";
const source =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
test("Codex kit remains usable with the server offline and preserves the selected direction", async () => {
  const before = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error("Network unavailable");
  };
  try {
    const recipe = {
      material: "clay",
      layout: "right",
      artDirection: "Crisp light",
    };
    const blob = await buildCodexKit({
      source,
      recipe,
      prompt: "Keep my face.",
    });
    const files = readZip(await blob.arrayBuffer());
    assert.equal(files.size, 5);
    assert.deepEqual(JSON.parse(files.get("recipe.json")), recipe);
    assert.equal(files.get("PROMPT.md").toString(), "Keep my face.");
    assert.deepEqual(
      files.get("input.png"),
      Buffer.from(source.split(",")[1], "base64"),
    );
  } finally {
    globalThis.fetch = before;
  }
});
test("bundled kit instructions stay synchronized with canonical files", async () => {
  assert.equal(
    skill,
    await readFile(
      new URL("../skills/poof-icon/SKILL.md", import.meta.url),
      "utf8",
    ),
    "Run npm run sync:kit",
  );
  assert.equal(
    license,
    await readFile(
      new URL("../THIRD_PARTY_NOTICES.md", import.meta.url),
      "utf8",
    ),
    "Run npm run sync:kit",
  );
});

test("kit exposes a project-scoped skill without global installation", async () => {
  const files = readZip(
    await (
      await buildCodexKit({ source, recipe: {}, prompt: "Use $poof-icon" })
    ).arrayBuffer(),
  );
  assert.equal(
    files.get(".agents/skills/poof-icon/SKILL.md").toString(),
    skill,
  );
  assert.ok(!files.has("AGENTS.md"));
});
