#!/usr/bin/env node
import {
  mkdtemp,
  readFile,
  mkdir,
  writeFile,
  stat,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { readZip, verifyPackage } from "./verify-package.mjs";

// Compile only verified image catalogs; never build or execute code from an archive.
let workspace;
try {
  if (process.platform !== "darwin")
    throw Error("Apple validation requires macOS and Xcode.");
  if (process.argv.length !== 3)
    throw Error("Usage: npm run verify:apple -- /path/to/app-icons.zip");
  const bytes = await readFile(process.argv[2]);
  const report = verifyPackage(bytes),
    files = readZip(bytes);
  const targets = report.targets.filter((t) => t === "ios" || t === "macos");
  if (!targets.length) throw Error("This package contains no Apple catalogs.");
  const version = execFileSync("xcodebuild", ["-version"], {
    encoding: "utf8",
  }).trim();
  execFileSync("xcrun", ["--find", "actool"], { stdio: "pipe" });
  console.log(version);
  workspace = await mkdtemp(join(tmpdir(), "poof-apple-check-"));
  for (const target of targets) {
    const root = join(workspace, target),
      catalog = join(root, "Assets.xcassets"),
      output = join(root, "compiled");
    await mkdir(catalog, { recursive: true });
    await mkdir(output);
    await writeFile(
      join(catalog, "Contents.json"),
      JSON.stringify({ info: { author: "xcode", version: 1 } }),
    );
    const prefix = `${target}/AppIcon.appiconset/`;
    const allowed = new Set([
      "Contents.json",
      ...JSON.parse(
        files.get(prefix + "Contents.json").toString("utf8"),
      ).images.map((image) => image.filename),
    ]);
    for (const [name, data] of files) {
      if (!name.startsWith(prefix)) continue;
      const relative = name.slice(prefix.length);
      // Copy only the planned PNGs and Contents.json. Never copy nested bundles or scripts.
      if (relative.includes("/") || !allowed.has(relative)) continue;
      const destination = join(catalog, "AppIcon.appiconset", relative);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, data);
    }
    const args = [
      catalog,
      "--compile",
      output,
      "--platform",
      target === "ios" ? "iphoneos" : "macosx",
      "--minimum-deployment-target",
      target === "ios" ? "15.0" : "12.0",
      "--target-device",
      target === "ios" ? "iphone" : "mac",
    ];
    if (target === "ios") args.push("--target-device", "ipad");
    args.push(
      "--app-icon",
      "AppIcon",
      "--output-partial-info-plist",
      join(root, "partial.plist"),
      "--output-format",
      "human-readable-text",
      "--warnings",
      "--errors",
      "--notices",
    );
    console.log(
      execFileSync("xcrun", ["actool", ...args], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 120000,
      }).trim(),
    );
    const expected = [
      "Assets.car",
      ...(target === "macos" ? ["AppIcon.icns"] : []),
    ];
    for (const file of expected)
      if (!(await stat(join(output, file))).size)
        throw Error(`${target}: ${file} is empty.`);
    console.log(
      `PASS: ${target} native asset catalog compiled (${expected.join(", ")}).`,
    );
  }
  console.log(
    "Asset catalogs passed native compilation. This does not sign an app, test a device or submit to a store.",
  );
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (error.stderr) console.error(String(error.stderr));
  process.exitCode = 1;
} finally {
  if (workspace) await rm(workspace, { recursive: true, force: true });
}
