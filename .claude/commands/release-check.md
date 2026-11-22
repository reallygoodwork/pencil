---
description: Check the repo is safe and consistent before publishing a release
---

Run a release check for Pencil Agent and report a short pass/fail list with fixes.

1. Run `npm test`. Every test must pass.
2. Confirm `server.js` and `overlay.js` only `require`/`import` Node built-ins or `vendor/`.
3. Search the repo for anything that looks like a real token, a `.ts.net` hostname that isn't a placeholder, or personal paths. None may ship.
4. Check the security invariants in CLAUDE.md still hold in the code (bind host, token + origin checks, argument-array spawns, `--allowedTools`, `normalizeAnnotation`).
5. Check that README.md, the docs and site/index.html agree with the code on commands, env vars, MCP tool names and the version in package.json.
6. List any remaining placeholders: `[LICENSE]`, `[ADD WAITLIST LINK]`.

Fix what's clearly wrong. Ask before anything that changes behaviour.
