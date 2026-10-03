# Security and data handling

Poof is intended to run on your own computer. The server listens on loopback, checks request Host/Origin, confines static files to `public/`, limits JSON uploads and allows one active image generation. It does not provide authentication, multi-user isolation or production hosting controls. Do not expose it through a public tunnel or bind it to a public interface without designing those controls first.

## Where data goes

| Data | Storage and destination |
| --- | --- |
| Uploaded/generated artwork | Browser tab memory; sent to OpenAI only when you request API generation |
| OpenAI API key | Tab memory; sent to the local server for generation and used in the upstream Authorization header; not written to files, browser storage or cookies |
| Art direction | Included in the requested image edit or the explicitly prepared Codex kit |
| Downloaded ZIP | Saved by your browser; may be staged in local server memory to support HTTP attachment downloads |
| Open-in-Codex kit | Written under the ignored `exports/codex/` directory after an explicit click; retained until you delete it |

The download cache holds at most three archives. Links expire after ten minutes; an expiry sweep clears old entries every thirty seconds. Restarting the server clears the cache. ZIP staging and kit preparation do not send artwork to an external service.

Codex generation uses that application’s tools and account; its own data policies apply when you send the request there. The kit builder includes only the five documented handoff files; it does not include the API key. The skill, prompt and recipe are intentionally readable before use.

No analytics, telemetry, remote fonts or CDN scripts are included. Uploaded images are decoded and normalized before generation. Upstream error bodies are not returned to the browser because they may contain request data.

## Report a vulnerability

Do not put credentials, private artwork or an exploit containing personal data in a public issue. If GitHub shows **Report a vulnerability** on this repository’s Security page, use that private channel. Otherwise open an issue asking the maintainer for a private reporting channel without disclosing the vulnerability itself. Ordinary bugs can use public issues with sanitized reproduction steps.

If a key was exposed, revoke it with the provider. Removing a file or rewriting Git history does not revoke a credential or erase copies already downloaded by others.
