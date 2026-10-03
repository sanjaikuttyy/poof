# Architecture

Poof is a browser application served by a small Node.js server. It uses native ES modules, Canvas and SVG. There is no bundler, framework, database or dependency installation. Keeping the browser modules in `public/` makes that setup possible: the browser runs the checked-in source directly.

## Repository map

```text
server.mjs                    CLI entry point; preserves server factory exports
src/server/
  app.mjs                     Server assembly, headers and route dispatch
  http.mjs                    Request trust, body limits and error responses
  image.mjs                   PNG input validation
  prompt.mjs                  Image-generation direction
  static.mjs                  Public-file serving and path confinement
  codex-handoff.mjs           Local kit files and desktop launch
  routes/
    generate.mjs              Image API request, cancellation and concurrency
    codex.mjs                 Validated local Codex handoff
    downloads.mjs             Bounded, temporary ZIP attachment staging
public/
  index.html                  Page structure
  css/                        Base, fonts, plush and export styles
  assets/                     Demo artwork, favicon, local fonts and licenses
  js/
    app.js                    Session state, routing and UI event wiring
    studio/render.js          Recipe normalization, layouts and SVG/PNG rendering
    plush/playground.js       Material and lighting controls
    exports/                  Platform packages, ZIP encoding and export UI
    integrations/             Codex kit assembly and server-status checks
    generated/kit-content.js  Generated skill and license strings
skills/poof-icon/SKILL.md      Canonical reusable icon-transformation skill
scripts/                      Maintenance and package-verification commands
tests/                       Node tests with synthetic or mocked inputs
docs/                        User and contributor documentation
```

`tests/` and `docs/` are root directories. Tests stay in one flat directory while the suite is small; their names follow the behavior under test.

## Boundaries

**The browser owns artwork and composition.** `app.js` holds the current source, result, recipe and session looks. It coordinates the feature modules; platform sizing rules belong in `exports/package.js`, and composition geometry belongs in `studio/render.js`. UI modules may use the DOM. Pure exports from the renderer, ZIP writer and kit assembler can also be imported by Node tests and the server; keep browser globals out of their module-level initialization.

**The server owns external and native operations.** It sends image-edit requests to the configured provider, stages downloadable ZIP attachments, and writes/opens a Codex kit only on an explicit request. Every request passes Host/Origin checks before routing. Static serving is confined to `public/`; `src/`, tests, local kits and project files are not served.

**Scripts are commands, not request handlers.** `verify-package.mjs` also exposes parser/verification functions for tests and the Apple verifier. The desktop handoff belongs in `src/server/` because it runs as part of the application.

**Generated content has one source.** Edit `skills/poof-icon/SKILL.md` or `THIRD_PARTY_NOTICES.md`, then run `npm run sync:kit`. Commit the resulting `public/js/generated/kit-content.js`. Do not edit it directly. The embedded text lets a loaded page prepare a kit even when the server is unavailable.

## Data flows

1. **Original artwork:** upload → browser decodes and normalizes PNG → local composition → local platform rendering → ZIP. No AI request occurs.
2. **AI style:** source + chosen direction + in-memory key → `POST /api/generate` → OpenAI image edits → one PNG → local composition. Generation is limited to one active request per server. Cancellation and timeout abort the upstream request without retrying it.
3. **Codex:** source + recipe + prompt → `POST /api/codex` → a new ignored local folder containing `.agents/skills/poof-icon/SKILL.md` → desktop launch. The user submits the request in Codex and imports the resulting PNG into Poof.
4. **Download:** the browser builds the ZIP → optional local attachment staging → ordinary HTTP download. If staging is unavailable, the browser offers the locally generated data URL. Some embedded browsers restrict that fallback.

The kit contains the source, recipe, prompt, skill and attribution. It does not contain the API key or conversation history. Rendering and package construction never call the image API.

## HTTP surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Confirm the local server is running |
| `POST /api/generate` | Generate one image from validated PNG input |
| `GET /api/codex` | Check whether automatic desktop opening is available |
| `POST /api/codex` | Save and open a validated kit |
| `POST /api/downloads` | Stage an allowed ZIP attachment in memory |
| `GET /api/downloads/:id` | Retrieve an unexpired staged attachment |

These are internal local-app endpoints, not a versioned public API. `createPoofServer()` accepts injected transports and desktop helpers so tests do not need real credentials or launch apps. Each server instance owns its locks and staged downloads; closing it clears download state and the expiry timer.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8770` | Local listening port; integer from 1 to 65535 |
| `POOF_IMAGE_MODEL` | `gpt-image-2.5-sunburst` | Model sent to the image-edit endpoint |

The listener binds to `127.0.0.1`. No `.env` loader is included; set variables in the launching environment. `npm start` resolves application directories relative to the source files, not the caller’s working directory.

For commands and validation expectations, see [contributing](../CONTRIBUTING.md) and [testing](TESTING.md).
