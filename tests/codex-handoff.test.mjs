import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openCodexKit } from "../src/server/codex-handoff.mjs";

test("desktop launch receives an isolated folder with a discoverable skill and preserves literal prompts", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "poof-handoff-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "Use $poof-icon; $(touch unwanted) `literal`";
  const source = "data:image/png;base64,aGVsbG8=";
  let launched;
  const folder = await openCodexKit(
    { source, recipe: { layout: "left" }, prompt },
    {
      root,
      executable: "/codex",
      launch: async (...args) => {
        launched = args;
      },
    },
  );
  assert.deepEqual(launched.slice(0, 2), ["/codex", ["app", folder]]);
  assert.equal(await readFile(path.join(folder, "PROMPT.md"), "utf8"), prompt);
  assert.equal(await readFile(path.join(folder, "input.png"), "utf8"), "hello");
  assert.match(
    await readFile(
      path.join(folder, ".agents/skills/poof-icon/SKILL.md"),
      "utf8",
    ),
    /name: poof-icon/,
  );
  assert.equal((await readdir(root)).length, 1);
});
