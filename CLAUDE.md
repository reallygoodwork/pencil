# Pencil Agent

Circle UI on a phone or iPad (Apple Pencil or finger), leave a note, and Claude Code edits the project on the Mac. Annotations use the Agentation Annotation Format Schema (AFS) v1.1. The aim is an open-source tool other teams adopt, with a hosted product later (`docs/product/hosted-plan.md`).

## Layout

| Path | What |
|---|---|
| `server.js` | The whole server, zero dependencies: AFS store, HTTP API, SSE events, headless worker (`claude -p` or `codex exec`), relay mode with a local agent API, optional MCP stdio mode, whisper.cpp transcription |
| `overlay.js` | Browser overlay: drawing, sketch reading, element capture into AFS, the note pill (text, voice with a Web Audio dither), markers on the page, the notes tray, close/reopen/delete with undo, snapshots, before/after compare |
| `bin/pencil.js` | Relay client for a Claude Code session: `wait` (long poll, zero tokens while idle), `resolve`, `reply`, `dismiss`, `get` |
| `templates/pencil-relay.md` | The `/pencil-relay` command, installed with `npm run install-relay` |
| `vendor/perfect-freehand.mjs` | Vendored stroke library (MIT). Don't edit. |
| `vendor/qrcode-generator.js` | Vendored QR encoder (MIT), used only by `scripts/demo.js --lan`. Don't edit. |
| `docs/` | User docs: `tailscale.md`, `frameworks.md`, `reference.md`. `docs/product/` holds the hosted-product plan. |
| `examples/demo-app/` | Fictional "Fieldnote" site used for demos and recordings |
| `scripts/demo.js` | `npm run demo`: serves a scratch copy of the demo app with the overlay injected, and starts the server |
| `scripts/record-demo.py` | Re-records the landing-page videos and stills (Playwright and ffmpeg) |
| `site/` | Static landing page (`index.html` plus `media/`). Deploy as-is. |
| `test/` | `node:test` suite plus `fixtures/fake-claude.sh`, a stand-in for `claude -p` |

## Commands

```bash
npm test                  # full suite, about 5s, no dependencies
npm run demo              # http://localhost:5173 with real Claude Code editing a scratch copy
npm run demo -- --fake    # same, with the scripted fake agent (no tokens)
npm run demo -- --relay   # opens Claude Code in this terminal to take the notes; add --lan for the QR code
npm run site              # landing page at http://localhost:8080
npm start                 # real use: needs pencil.env (copy pencil.env.example)
npm run relay             # listen only; a Claude Code session claims notes via bin/pencil.js
```

## Invariants: don't break these

- **Zero runtime dependencies.** `server.js` and `overlay.js` use only Node built-ins and browser APIs. Dev tooling may use others, but nothing ships with them.
- **Security model** (see `docs/reference.md#security`):
  - The server binds `127.0.0.1` by default.
  - Every request must name an allowed `Host` (loopback, the `PUBLIC_URL`/`APP_ORIGIN` hosts, `ALLOWED_HOSTS`), or it gets `421`. This blocks DNS rebinding.
  - Every non-public route checks the token (constant-time) **and** an exact `APP_ORIGIN` (comma-separated list allowed). Public routes are only `/health`, `/overlay.js` and `/vendor/*`.
  - `/agent/*` (relay) only answers the Mac itself: no `Origin`, a loopback `Host`, no `X-Forwarded-For`/`Forwarded`/`Tailscale-User-Login`, plus the token.
  - The server never prints the token at startup. Only `npm run tag` and `npm run bookmarklet` do, on request.
  - The token goes in a header, never in a URL. The overlay streams SSE with `fetch`, not `EventSource`, for this reason.
  - Subprocesses are spawned with argument arrays, never a shell. Every subprocess has a timeout.
  - The headless agent gets `--allowedTools Read,Edit,Write,Glob,Grep` only. `AGENT=codex` runs `codex exec --sandbox workspace-write` (commands in the project, no network); that's documented as the wider option.
  - The browser can't set `status: resolved`, can't post `role: agent`, and can't pick fields outside AFS (`normalizeAnnotation` rebuilds every field).
  - Prompts label page content as data. Only `comment` and human thread messages are instructions.
- **AFS v1.1 compliance.** Required fields are `id, comment, elementPath, timestamp, x, y, element`. Status enum: `pending | acknowledged | resolved | dismissed`. Pencil-only data goes under the `pencil` extension key.
- **No Agentation code.** Their packages are PolyForm Shield licensed. Implement from the public spec (agentation.com/schema, /api) only.
- **Sketch reading.** The overlay turns strokes into gestures (`interpret()` → `classify()` → `resolve()`). Every note sends a wireframe-and-ink PNG with its size and pin point; for a plain circle the brief marks it optional and it is never sent inline. Only non-circle marks get the gesture lines and the sketch guide. PNGs are validated by magic bytes, capped at 512 KB, and stored 0600 in a 0700 temp folder that only `--add-dir` exposes.
- **Snapshots.** Each note carries the marked element's HTML (capped at 64 KB, saved 0600 next to the sketches) and SHA-256 hashes of it and of the page, so the agent fixes the version the user saw.
- **Routing.** A note claimed by a relay session goes back to that session when the user replies, while the session is active (15 minutes). Claims happen in one process, so two sessions never take the same note.
- **Keep briefs lean.** `brief()` is what Claude sees in every mode, about 60–110 tokens per annotation including the image and snapshot lines. Don't add the full JSON, computed styles or the bounding box. `pencil_get` exists for the rare case that needs them.
- **Dev only.** Framework integrations must never inject the overlay into production builds.

## Conventions

- **Docs move with behaviour.** A change to config, commands, the API or security updates `README.md` and the right file in `docs/`. Copy changes that affect the pitch also update `site/index.html`.
- **Writing style:** direct, short sentences, no hype.
- **Tests:** a new route, tool or security rule gets a test in `test/server.test.js`. Use `fake-claude.sh`; never call the real `claude` in tests.
- **Overlay UI** is injected into other people's apps: scope all CSS under `#pa-*` and `.pa-*`, and mark every node with `data-pa`.

## Status

- **Done (v0.7):**
  - Headless, relay and MCP modes, AFS v1.1, SSE, batching, the bookmarklet, whisper.cpp voice with a live dither.
  - Sketch intent: arrows (move), boxes (add), X and strike-through (remove), underline (emphasise), plus a sketch image for handwriting.
  - Notes UI: markers, the tray, close/reopen/delete with undo, the answer shown on the done marker, before/after drag.
  - Pin points, snapshots, the Host allowlist, the local-only agent API, session routing.
  - MIT license (Drew Minns, Really Good Work Inc.). Docs, the landing page, the demo app, and a recorder.
- **Not yet:**
  - Annotations are in memory only: a restart clears them.
  - Only one server per port.
  - Untested on real devices: a real Pencil, the Next.js snippet, and the relay with a live Claude Code session.
  - Sketch recognition is heuristic and only tested with synthetic strokes. Tune `classify()` thresholds against real Pencil input.
  - Before/after renders with inlined computed styles: web fonts and images don't carry over.
- **Next:** see `docs/product/hosted-plan.md` (QR pairing, end-to-end encryption) and its "Decide first" list.

## Links

- Hosted-product whiteboard: https://claude.ai/artifact/4VqF13Pk84k4YcaHCJXR3a
- Landing page design canvas: https://claude.ai/artifact/XxzXwaDRQZxjGMd2yV7dKs (`site/` is the static export)
- Site: https://pencil.reallygood.work (Vercel serves `site/`; see `vercel.json`)
- Repo: https://github.com/reallygoodwork/pencil
- AFS spec: https://agentation.com/schema
