# Contributing

Poof uses plain JavaScript and Node.js 22 or later. You do not need a framework toolchain, an API key or Xcode to work on the local editor and run its tests.

## Development loop

1. Clone the repository and create a branch for a focused change.
2. Run `npm start`. Open the localhost URL and use the Pogo example or a synthetic image.
3. Make the change in the module that owns the behavior; use the map below.
4. Run `npm run check`. Exercise changed user flows in a browser.
5. Review `git diff --cached`, then describe the problem, resulting behavior and validation in your pull request.

The app serves source files directly. Reload after browser-code changes; restart the server after changing `src/server/` or `server.mjs`. Save any artwork you need before reloading because session data is not persisted.

## Where to make a change

| Change | Start here |
| --- | --- |
| Main flow, controls or session state | `public/index.html`, `public/js/app.js` |
| Peek geometry, recipe values or rendering | `public/js/studio/render.js` |
| Plush controls and material direction | `public/js/plush/playground.js` |
| Platform sizes, catalog entries or manifests | `public/js/exports/package.js` and `tests/package.test.mjs` |
| Package review and download UI | `public/js/exports/ui.js` |
| Provider requests and cancellation | `src/server/routes/generate.mjs` |
| Local Codex launch | `src/server/routes/codex.mjs`, `src/server/codex-handoff.mjs` |
| Skill behavior | `skills/poof-icon/SKILL.md`, then `npm run sync:kit` |
| Interface styles | `public/css/` |

Read [architecture](docs/ARCHITECTURE.md) for boundaries and [testing](docs/TESTING.md) for checks. Keep pure rendering and export rules separate from DOM event wiring. Avoid adding a dependency or abstraction unless it solves a concrete problem that is difficult to address with the current stack.

## Generated files and checks

`public/js/generated/kit-content.js` is generated from the skill and third-party notices. Commit it with the canonical change. `npm run check` detects stale content without rewriting files, checks JavaScript syntax, local imports, page assets and documentation links, then runs the test suite. CI runs the same command on Node 22 and 24.

Add a regression test for a behavior change when a test can catch a realistic failure. API tests must use injected responses, not a real key. Desktop tests must use the injected launcher rather than opening an app. A stylesheet or copy change usually needs browser review rather than a test that asserts exact wording.

Use two-space indentation, LF line endings and a final newline; `.editorconfig` supplies these defaults. Follow the surrounding module’s style. Keep public docs focused on the product and its contributors.

## Before publishing

Keep keys, uploads, exported kits, personal paths, chat transcripts and private notes out of commits and issue attachments. Use synthetic fixtures or the licensed demo. Git ignores common local outputs, but reviewing the staged diff is still necessary. Use GitHub’s no-reply commit address if you want to keep your email private.

Preserve the MIT and third-party notices. Pogo artwork has [separate terms](public/assets/NOTICE.txt); it is a demonstration, not an asset pack for another product’s identity. See [security](SECURITY.md) for sensitive reports.
