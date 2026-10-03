import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { codexKitFiles } from "../../public/js/integrations/codex-kit.js";

const execute = promisify(execFile);
export async function findCodex() {
  // `codex app` may offer an installer when no desktop app exists. Never do that here.
  if (process.platform !== "darwin") return null;
  const apps = ["/Applications/ChatGPT.app", "/Applications/Codex.app"];
  let installed = false;
  for (const app of apps) {
    try {
      await access(app);
      installed = true;
    } catch {}
  }
  if (!installed) return null;
  const candidates = [
    ...(process.env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((p) => path.join(p, "codex")),
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
  ];
  for (const file of candidates) {
    try {
      await access(file, constants.X_OK);
      return file;
    } catch {}
  }
  return null;
}
export async function openCodexKit(
  options,
  { root, executable, launch = execute },
) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(path.join(root, "poof-"));
  for (const [name, data] of Object.entries(codexKitFiles(options))) {
    const target = path.join(folder, name);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(
      target,
      typeof data === "string" ? data : Buffer.from(await data.arrayBuffer()),
      { mode: 0o600 },
    );
  }
  await launch(executable, ["app", folder], {
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return folder;
}
