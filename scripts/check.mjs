import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = path.join(root, "public");
const failures = [];
async function files(dir) {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const name = path.join(dir, entry.name);
      return entry.isDirectory() ? files(name) : [name];
    }),
  );
  return nested.flat();
}
async function exists(from, target) {
  try {
    if (!(await stat(target)).isFile()) throw Error("not a file");
  } catch {
    failures.push(`${from}: missing ${path.relative(root, target)}`);
  }
}
const sourceFiles = [
  "server.mjs",
  ...(
    await Promise.all(["src", "public", "scripts", "tests"].map(files))
  ).flat(),
];
for (const file of sourceFiles.filter((name) =>
  /\.(?:m?js|css|html)$/.test(name),
)) {
  const absolute = path.join(root, file),
    text = await readFile(absolute, "utf8");
  if (/\.m?js$/.test(file)) {
    try {
      execFileSync(process.execPath, ["--check", absolute], { stdio: "pipe" });
    } catch (error) {
      failures.push(
        `${file}: ${error.stderr?.toString() || "invalid JavaScript"}`,
      );
    }
    for (const match of text.matchAll(
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g,
    ))
      await exists(file, path.resolve(path.dirname(absolute), match[1]));
  }
  if (file.endsWith(".html") || file.endsWith(".css")) {
    const refs = file.endsWith(".html")
      ? /(?:src|href)=["']([^"']+)["']/g
      : /url\(["']?([^)'"\s]+)["']?\)/g;
    for (const [, ref] of text.matchAll(refs)) {
      if (/^(?:#|[a-z]+:|\/\/)/i.test(ref)) continue;
      const target = ref.split(/[?#]/)[0];
      await exists(
        file,
        target.startsWith("/")
          ? path.join(publicRoot, target)
          : path.resolve(path.dirname(absolute), target),
      );
    }
  }
}
const docs = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ...(await files("docs")),
].filter((name) => name.endsWith(".md"));
for (const file of docs) {
  const text = await readFile(path.join(root, file), "utf8");
  for (const [, ref] of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^(?:#|[a-z]+:|\/\/)/i.test(ref)) continue;
    await exists(
      file,
      path.resolve(
        root,
        path.dirname(file),
        decodeURIComponent(ref.split("#")[0]),
      ),
    );
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "JavaScript syntax, local imports, page assets and documentation links pass.",
  );
