# Reference

- [Configuration](#configuration)
- [Commands](#commands)
- [What Claude receives](#what-claude-receives)
- [Data model (AFS v1.1)](#data-model-afs-v11)
- [HTTP API](#http-api)
- [MCP tools](#mcp-tools-optional-mode)
- [Voice](#voice)
- [Security](#security)

## Configuration

Set these in `pencil.env` (loaded with `node --env-file=pencil.env`) or as environment variables.

| Variable | Default | |
|---|---|---|
| `APP_ORIGIN` | **required** | Your app's origin as the device sees it, e.g. `https://your-mac.tailnet.ts.net`. Several are allowed, comma-separated (e.g. a Wi-Fi IP and a `.local` name). |
| `PUBLIC_URL` | `http://HOST:PORT` | Pencil Agent's address as the device sees it. Used for the tag and bookmarklet. |
| `PROJECT_DIR` | current directory | The repo Claude may edit |
| `AGENT` | `claude` | Headless mode's agent: `claude` or `codex` |
| `AGENT_MODEL` | the agent's default | e.g. `haiku` or `sonnet`. `CLAUDE_MODEL` still works. |
| `AGENT_MODEL_SKETCH` | `AGENT_MODEL` | Model for notes with arrows, boxes or crosses. Pair a fast model for circles with a stronger one here. |
| `AGENT_BIN` | the `AGENT` name | Full path, if it isn't on your `PATH`. `CLAUDE_BIN` still works. |
| `PORT` | `4545` | |
| `HOST` | `127.0.0.1` | Keep this with Tailscale. Use `0.0.0.0` only for the same-Wi-Fi setup. |
| `TOKEN` | generated | Normally read from `~/.pencil-agent/token` (created on first run, permissions 0600). Delete the file to rotate it. |
| `ALLOWED_HOSTS` | none | Extra `Host` names to accept, comma-separated. Loopback names and the `PUBLIC_URL` and `APP_ORIGIN` hosts are always allowed. |
| `WHISPER_MODEL` | off | Path to a whisper.cpp model; turns on the mic button in notes |
| `WHISPER_BIN` / `FFMPEG_BIN` / `WHISPER_LANG` | `whisper-cli` / `ffmpeg` / `en` | |

## Commands

```bash
npm start                  # node --env-file=pencil.env server.js
npm run tag                # print the <script> tag
npm run bookmarklet        # print the bookmarklet
npm run relay              # listen only; a Claude Code session claims notes
npm run install-relay      # install the /pencil-relay command into ~/.claude/commands
node server.js --mcp       # optional MCP mode (Claude Code launches this)

node bin/pencil.js wait [--session rly_x] [--match /path]   # block until notes arrive, claim, print briefs
node bin/pencil.js resolve <id> "what changed"              # answer on the note; its marker turns to a check
node bin/pencil.js reply   <id> "question"                  # ask; the answer comes back to the same session
node bin/pencil.js dismiss <id> "why"
node bin/pencil.js get     <id>                             # full AFS JSON
```

## What Claude receives

In the default mode, each batch becomes one `claude -p` run with tools limited to `Read,Edit,Write,Glob,Grep` in `PROJECT_DIR` (or one `codex exec` run with `AGENT=codex`). A batch goes out once no new note has landed for 0.4 seconds, or after 2 seconds at most. The server log shows how long each note took. The prompt is a short brief per annotation:

```
[ann_c6j7hqC0Cmk] change: make it blue
page: /pricing
element: body > section.hero > button.cta.primary "Buy now"
source: src/components/PrimaryButton.tsx:12:7 (App > Hero > PrimaryButton)
classes: cta primary
```

Every note also carries a picture of what was marked, its size and the exact point you marked, plus the element's HTML as you saw it. For a plain circle these are optional lines the agent opens only if it needs them:

```
image: /tmp/pencil-sketches-…/9f2a….png (720×440), pin at (156, 220): crop around that point. Optional: open it only if the text isn't enough.
seen: /tmp/pencil-sketches-…/955c….html (sha256 3b1f0c9a27de): the element's HTML as the user saw it. If the source has moved on, change what they saw.
```

The snapshot also records a SHA-256 of the whole page as you saw it (`pencil.snapshot.page`), so a note can be matched to the exact version you reviewed.

For a sketch, each mark gets its own line, plus a pointer to the sketch image, and the prompt gains a short guide to reading marks:

```
[ann_MtU7ZG0RbJ8] change: Add a third button: Gift cards
page: /
element: #site > section.hero > div.actions "Shop notebooks See the paper"
mark 1: box drawn in empty space (150×53px) with handwriting inside: add what's sketched in div.actions, after a.btn.btn-ghost "See the paper"
sketch image: /tmp/pencil-sketches-…/32bc….png (Read it: page outlines in grey, the user's ink in red)
```

Claude ends with one line per item (`ann_…: what changed`), and that line appears on the note on your device. Batches hold up to 5 annotations, collected over 2 seconds.

## Data model (AFS v1.1)

Annotations follow the [Agentation Annotation Format Schema v1.1](https://agentation.com/schema). The overlay fills in:

| Field | Value |
|---|---|
| `id`, `comment`, `timestamp`, `element`, `elementPath` | Required AFS fields |
| `x`, `y` | Centre of your circle: `x` as % of viewport width, `y` as px from document top (viewport px if `isFixed`) |
| `url`, `boundingBox` | Page URL, and the element's box in document coordinates |
| `intent` | `change`, `fix` or `question` (from the chips) |
| `reactComponents`, `sourceFile` | Component chain and `path:line:column` when available |
| `cssClasses`, `computedStyles`, `accessibility`, `attributes`, `nearbyText`, `nearbyElements`, `selectedText`, `fullPath`, `isFixed`, `isMultiSelect` | Context |
| `status`, `thread`, `resolvedAt`, `resolvedBy`, `sessionId`, `createdAt`, `updatedAt` | Managed by the server |
| `kind` | `feedback`; `rearrange` when the sketch has an arrow; `placement` when it adds something |
| `pencil` *(extension)* | `{ number, input, circle, strokes, gestures[], sketch }`. Each gesture is `{ type, target, container, before, after, size, label, summary }`, where `type` is one of `circle`, `move`, `add`, `cross`, `strike`, `underline`, `line` or `sketch`. `sketch` is the path of the saved image. AFS allows additional properties. |

**Lifecycle:** `pending` → `acknowledged` → `resolved` | `dismissed`. When Claude asks a question, the annotation stays `acknowledged` with an `agent` message last in the `thread`. A human reply moves it back to `pending`.

Sessions are one per page URL, ignoring the `#hash`. Storage is in memory: restarting the server clears it.

## HTTP API

Every request must carry an allowed `Host` (loopback, the `PUBLIC_URL` or `APP_ORIGIN` host, or `ALLOWED_HOSTS`), or it gets `421`. All routes except `/health`, `/overlay.js` and `/vendor/*` need `Authorization: Bearer <token>` and an `Origin` equal to one of the `APP_ORIGIN` values. Route shapes follow [agentation.com/api](https://agentation.com/api).

| Method | Path | |
|---|---|---|
| `POST` | `/sessions` | `{url}` → session |
| `GET` | `/sessions`, `/sessions/:id` | A session includes its annotations |
| `POST` | `/sessions/:id/annotations` | AFS annotation → stored annotation. `pencil.held: true` queues it: no agent takes it until the queue is sent. |
| `POST` | `/sessions/:id/send` | Sends the session's queued notes → `{sent}` |
| `GET` `PATCH` `DELETE` | `/annotations/:id` | PATCH accepts `comment`, `intent`, `severity`, `status: dismissed\|pending` |
| `POST` | `/annotations/:id/thread` | `{content}`; always stored as `role: "human"` |
| `GET` | `/pending`, `/sessions/:id/pending` | Queued notes aren't listed until they're sent |
| `GET` | `/events`, `/sessions/:id/events` | SSE stream: `{type, timestamp, sessionId, sequence, payload}`; resume with `Last-Event-ID` |
| `GET` | `/health`, `/status`, `/config` | |
| `POST` | `/transcribe` | Audio body → `{text}` |

**Agent API** (used by `bin/pencil.js`). Local only: no `Origin` header, a loopback `Host`, no `X-Forwarded-For`, `Forwarded` or `Tailscale-User-Login` header, plus the token. Anything from a page or through Tailscale gets `403`.

| Method | Path | |
|---|---|---|
| `GET` | `/agent/claim?session=&wait=&match=` | Long-polls up to `wait` seconds (max 600) and claims up to 5 notes for `session`. A note goes to the session that claimed it before, while that session is active (seen in the last 15 minutes). Returns `{session, count, ids, text}`. |
| `POST` | `/agent/annotations/:id/resolve` \| `reply` \| `dismiss` | `{message}` |
| `GET` | `/agent/annotations/:id` | Full AFS JSON |

## MCP tools (optional mode)

`node server.js --mcp`, registered with `claude mcp add`. Outputs are plain text to keep tokens low.

| Tool | |
|---|---|
| `pencil_watch` | Waits for new annotations (`timeoutSeconds`, default 300, max 600). Returns briefs, plus sketch images as image content, and marks them acknowledged. Returns `none` if nothing arrives. |
| `pencil_resolve` | `annotationId`, `summary`. The summary appears on the note. |
| `pencil_reply` | `annotationId`, `message`: ask the user something |
| `pencil_dismiss` | `annotationId`, `reason` |
| `pencil_get` | `annotationId` → the full AFS JSON, only when the brief isn't enough |

## Voice

Keyboard dictation (the 🎤 on the iPhone or iPad keyboard) works everywhere and needs no setup.

For a mic button in the note pill that transcribes **on your Mac** (audio never leaves your devices). Tap to start, tap to stop (or just tap send). While you talk, a dithered visual of your voice runs behind the text; it's drawn from the mic level in the browser with Web Audio, nothing extra is sent.
```bash
brew install whisper-cpp ffmpeg
mkdir -p ~/models && curl -L -o ~/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```
Add `WHISPER_MODEL=/Users/you/models/ggml-base.en.bin` to `pencil.env` and restart. The button only appears on HTTPS pages, so it works through Tailscale but not over plain Wi-Fi HTTP.

## Security

| Layer | What it does |
|---|---|
| Network | Binds to `127.0.0.1`. Devices reach it only through Tailscale Serve, which is private to your tailnet. |
| Token | A random 192-bit token, stored in `~/.pencil-agent/token` (0600) and checked in constant time on every API call and event stream. The overlay sends it in a header, never in a URL. |
| Origin | Only the exact `APP_ORIGIN` values pass CORS and the server-side origin check. |
| Host | Every request must name an allowed host. This blocks DNS rebinding, where a website points its own hostname at `127.0.0.1` and talks to the server through your browser. |
| Agent API | The relay's claim and answer routes only answer requests made on the Mac itself, never from a page or through Tailscale, and still need the token. |
| Input | Annotations are rebuilt field by field: types checked, enums validated, strings capped. Bodies are capped at 900 KB to fit one sketch image and one HTML snapshot (64 KB) (audio at 10 MB). The browser can't mark items resolved or post as the agent. |
| Agent | `claude -p` gets file tools only (`Read,Edit,Write,Glob,Grep`) in `PROJECT_DIR`, with no shell and no network. With `AGENT=codex`, `codex exec` runs in its `workspace-write` sandbox: it can edit `PROJECT_DIR` and run commands there, with no network. That's a wider door than Claude's file tools, so choose it knowingly. Prompts label page content as data, not instructions. In MCP mode, your own Claude Code permission settings apply. |
| Snapshots | The marked element's HTML, capped at 64 KB, saved 0600 next to the sketches. It's data for the agent, labelled as such in the brief. |
| Sketches | Accepted only as PNG data URLs. The bytes are checked and capped at 512 KB, then saved with permissions 0600 to a private temp folder (0700) that is deleted on exit. In headless mode Claude gets read access to that folder through `--add-dir`, nothing else. |
| Processes | `claude`, `ffmpeg` and `whisper-cli` run with argument arrays and never through a shell. Audio goes to a private temp directory that is deleted after each use. Every subprocess has a timeout. |
| Production | The overlay is dev-only. Never ship the tag. The framework setups in [frameworks.md](frameworks.md) only inject it in dev. |

**What to keep in mind:**
- **Anyone with the token and a device on your tailnet can ask Claude to edit `PROJECT_DIR`.** Treat the token like a password.
- **Review changes like any other.** Commit before a session and use `git diff` after.
