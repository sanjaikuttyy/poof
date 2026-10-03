# Testing

## Before a pull request

```sh
npm run check
```

This runs JavaScript syntax and local-reference checks, verifies generated kit content, then executes the Node tests. It does not modify files, launch a desktop app or make paid API requests. GitHub Actions runs it on Node 22 and 24.

For a faster test-only iteration, use `npm test`. To focus on one behavior:

```sh
node --test tests/server.test.mjs
```

| Test file | Behavior covered |
| --- | --- |
| `server.test.mjs` | Request validation, Host/Origin checks, API errors, cancellation, concurrency, static confinement, attachment downloads and Codex routes |
| `render.test.mjs` | Recipe normalization, mirrored peeks, motion, small exports, local image conversion and ZIP encoding |
| `package.test.mjs` | Platform slots, safe framing, monochrome validation, manifests and ICO construction |
| `verify-package.test.mjs` | Independent package validation and rejection of corrupt or inconsistent archives |
| `codex-kit.test.mjs` | Offline kit construction, preserved recipe and discoverable skill |
| `codex-handoff.test.mjs` | Isolated local files and literal arguments passed to an injected launcher |

Mocked tests establish request behavior, not provider access or image quality. A live generation check requires an authorized account and incurs provider usage. Do not add a real key to a fixture or CI configuration.

## Browser review

For changes to module paths, HTML, CSS or UI behavior, start the actual server and check:

1. The page loads its fonts, styles, demo images and JavaScript without missing assets or console errors.
2. A source image can be uploaded and customized without a key. Left/right peeks, size and background update the preview; the 16px preview remains useful.
3. A Codex kit contains the chosen recipe and source. Verify a file actually saves, not only that a download link appears.
4. An app package builds, shows its platform previews and saves to disk.
5. Relevant errors are understandable: missing key, unavailable server, expired download or missing desktop app.
6. Motion can be paused and reduced-motion preferences are respected.

Use temporary test tabs when a user already has artwork open. Reloading a working tab loses its in-memory session. Do not run a live generation or open additional Codex chats as part of routine automated tests.

## Verify a downloaded package

```sh
npm run verify -- /path/to/app-icons.zip
```

The verifier reads the archive without extracting files. It checks ZIP/PNG integrity, decoded pixels, expected dimensions, Apple catalog slots and opacity, Android resource definitions, web references and ICO payloads. Invalid packages exit nonzero. The report also lists artwork/framing details that require human review.

On macOS with Xcode configured:

```sh
npm run verify:apple -- /path/to/app-icons.zip
```

This validates the ZIP first, copies only catalog images and metadata into a temporary directory, then runs Apple’s asset compiler. It checks the compiled outputs and removes its temporary files. It does not accept licenses, change a project, sign an app or execute archive contents.

These checks target Poof’s version-1 raster package format. They do not build an Android app, test a signed Apple app on a device, assess generated artwork or guarantee store acceptance. Complete those checks in the consuming project; see the [platform guide](PLATFORM-GUIDE.md).
