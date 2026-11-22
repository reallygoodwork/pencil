# Pencil Agent

Circle UI on a phone or iPad (Apple Pencil or finger), leave a note, and Claude Code edits the project on the Mac. Annotations use the Agentation Annotation Format Schema (AFS) v1.1. The aim is an open-source tool other teams adopt, with a hosted product later (`docs/product/hosted-plan.md`).

## Layout

| Path | What |
|---|---|
| `server.js` | The whole server, zero dependencies: AFS store, HTTP API, SSE events, headless worker (`claude -p`), optional MCP stdio mode, whisper.cpp transcription |
| `overlay.js` | Browser overlay: drawing, element capture into AFS, compose card, pins, live updates, hold-to-talk |
| `vendor/perfect-freehand.mjs` | Vendored stroke library (MIT). Don't edit. |
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
npm run site              # landing page at http://localhost:8080
npm start                 # real use: needs pencil.env (copy pencil.env.example)
```

## Invariants: don't break these

- **Zero runtime dependencies.** `server.js` and `overlay.js` use only Node built-ins and browser APIs. Dev tooling may use others, but nothing ships with them.
- **Security model** (see `docs/reference.md#security`):
  - The server binds `127.0.0.1` by default.
  - Every non-public route checks the token (constant-time) **and** the exact `APP_ORIGIN`. Public routes are only `/health`, `/overlay.js` and `/vendor/*`.
  - The token goes in a header, never in a URL. The overlay streams SSE with `fetch`, not `EventSource`, for this reason.
  - Subprocesses are spawned with argument arrays, never a shell. Every subprocess has a timeout.
  - The headless agent gets `--allowedTools Read,Edit,Write,Glob,Grep` only.
  - The browser can't set `status: resolved`, can't post `role: agent`, and can't pick fields outside AFS (`normalizeAnnotation` rebuilds every field).
  - Prompts label page content as data. Only `comment` and human thread messages are instructions.
- **AFS v1.1 compliance.** Required fields are `id, comment, elementPath, timestamp, x, y, element`. Status enum: `pending | acknowledged | resolved | dismissed`. Pencil-only data goes under the `pencil` extension key.
- **No Agentation code.** Their packages are PolyForm Shield licensed. Implement from the public spec (agentation.com/schema, /api) only.
- **Sketch reading.** The overlay turns strokes into gestures (`interpret()` → `classify()` → `resolve()`). Plain circles never send an image or the sketch guide. Every other mark sends the gesture lines, plus a wireframe-and-ink PNG when it helps. Sketch PNGs are validated by magic bytes, capped at 512 KB, and stored 0600 in a 0700 temp folder that only `--add-dir` exposes.
- **Keep briefs lean.** `brief()` is what Claude sees in headless and MCP modes, about 50–80 tokens per annotation. Don't add the full JSON, computed styles or the bounding box. `pencil_get` exists for the rare case that needs them.
- **Dev only.** Framework integrations must never inject the overlay into production builds.

## Conventions

- **Docs move with behaviour.** A change to config, commands, the API or security updates `README.md` and the right file in `docs/`. Copy changes that affect the pitch also update `site/index.html`.
- **Writing style:** direct, short sentences, no hype.
- **Tests:** a new route, tool or security rule gets a test in `test/server.test.js`. Use `fake-claude.sh`; never call the real `claude` in tests.
- **Overlay UI** is injected into other people's apps: scope all CSS under `#pa-*` and `.pa-*`, and mark every node with `data-pa`.

## Status

- **Done (v0.5):**
  - Headless and MCP modes, AFS v1.1, SSE, batching, the bookmarklet, whisper.cpp voice.
  - Sketch intent: arrows (move), boxes (add), X and strike-through (remove), underline (emphasise), plus a sketch image for handwriting.
  - Docs, the landing page, the demo app, and a recorder.
- **Not yet:**
  - Annotations are in memory only: a restart clears them.
  - Only one server per port.
  - No license chosen (MIT is the plan).
  - Placeholders to fill: `[LICENSE]`, `[ADD WAITLIST LINK]` in `site/` and the docs.
  - Untested on real devices: a real Pencil, and the Next.js snippet.
  - Sketch recognition is heuristic and only tested with synthetic strokes. Tune `classify()` thresholds against real Pencil input.
  - `site/` doesn't mention sketching yet: run /sync-site.
- **Next:** see `docs/product/hosted-plan.md` (relay, QR pairing, end-to-end encryption) and its "Decide first" list.

## Links

- Hosted-product whiteboard: https://claude.ai/artifact/4VqF13Pk84k4YcaHCJXR3a
- Landing page design canvas: https://claude.ai/artifact/XxzXwaDRQZxjGMd2yV7dKs (`site/` is the static export)
- AFS spec: https://agentation.com/schema
