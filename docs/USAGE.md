# Using Poof

Start with `npm start` and open the URL printed in the terminal. Leave that terminal running. The bundled Pogo example is pre-made artwork, so exploring it does not generate an image or spend credits.

## Use artwork you already have

1. Upload a PNG, JPG or WebP, up to 10 MB. Use a transparent source when you want the character to sit directly on a new background.
2. Choose **Customize this image** to edit the upload immediately, or **Use original** to compare layouts without AI.
3. Select **Center**, **Left peek**, **Right peek** or **Bottom peek** above the preview.
4. Adjust character size, background, gradient and occasion in the side panel. Check the 64px, 32px and 16px previews.
5. Choose **Get app package**, select the platforms you need, then build, review and download the ZIP.

Opaque uploads keep their existing background. Layout controls do not remove it. Scaling a low-resolution source does not recover detail; review the export warnings before using larger assets.

## Explore plush or clay

Choose **Keep my identity** to retain the source’s shape, colors and facial features. Choose **Imagine a mascot** only when you want a redesign inspired by the source.

Plush offers velvet, teddy and shag direction. Clay requests a smooth material. Lighting and optional art direction guide the next render; selecting them does not change the current artwork or spend credits.

With the API route, enter your own OpenAI key and start generation. Your API account needs billing and access to the configured model. One request creates one character image; Poof renders its layouts locally. Compare the result with the source before exporting. AI can change details even when asked to preserve them.

Cancel aborts the local request. It does not guarantee that a provider has stopped processing or billing a request it already received. Poof does not automatically retry generation.

## Continue in Codex

Choose **Use my Codex instead**. Review the prompt if you want to inspect the requested transformation.

On macOS with the desktop app and CLI installed, **Open in Codex** creates a folder under `exports/codex/` and launches that folder. Paste the copied request into a new chat and send it. The folder contains:

```text
input.png
recipe.json
PROMPT.md
.agents/skills/poof-icon/SKILL.md
THIRD_PARTY_NOTICES.txt
```

This skill is scoped to the kit. Poof does not install a global skill or start generation simply by opening the app. Codex needs an available image-generation tool.

For manual handoff, choose **Prepare Codex kit**, save the ZIP, unzip it and open the extracted folder in Codex. Use `PROMPT.md`. Bring the generated `result.png` back through **Import result** in Poof. Remove local kit folders when you no longer need them.

## Save your work

The current session is held in tab memory. Reloading clears its images, generated looks and key. Download artwork you want to keep before refreshing.

**Save recipe** stores composition settings as JSON; it does not embed your artwork or API key. Upload/import the artwork before loading its recipe. An app package includes its source artwork and recipe. Native icon PNGs remain static; use SVG export for web motion.

## Common problems

| Symptom | What to check |
| --- | --- |
| “Failed to fetch” or server offline | Keep `npm start` running. Use the printed localhost URL, not an HTML file opened directly from disk. Loaded local controls can still work after the server stops. |
| ZIP link expired after waiting | Reopen the export or kit flow and prepare the download again. Links expire after ten minutes; preparing several packages can also replace an older staged download. |
| ZIP does not save in an embedded browser | Run the local server so HTTP attachment downloads are available. If needed, open the same localhost URL in a regular browser. |
| Codex will not open automatically | Automatic opening currently supports macOS with the installed app and CLI. Use the ZIP handoff on other setups. |
| API key rejected, access denied or rate limited | Check the key, model access, organization requirements and API billing in your provider account. Poof supplies no shared credits. |
| Character disappears in a small icon | Reduce the crop or enlarge the character, then inspect the 16px preview. Fine fur and seasonal details may not survive at that size. |
| Android themed icon loses the face | Automatic monochrome uses the alpha silhouette. Supply a custom transparent monochrome PNG when internal features matter. |
| Adaptive or maskable icon differs from the chosen peek | Those assets deliberately use the complete character in a safe frame; ordinary icons retain the selected composition. |
| Another process uses port 8770 | Start with another `PORT`, then use that URL. |

On macOS/Linux: `PORT=8771 npm start`. In PowerShell: set `$env:PORT=8771`, then run `npm start`.

Before release, follow the [platform guide](PLATFORM-GUIDE.md) and run the [package verification commands](TESTING.md). Export validation does not guarantee store acceptance.
