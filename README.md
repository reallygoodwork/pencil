# Pencil Agent

Circle something on your running web app with Apple Pencil (or your finger on a phone), say what should change, and Claude Code edits your project. A numbered marker on the page shows progress live until the change is done.

```
iPhone / iPad                       Your Mac
─────────────                       ───────────────────────────────────────────
your app (dev) + overlay  ──HTTPS──▶  pencil-agent server (localhost:4545)
  circle + note                         │ waits; spends nothing while idle
  marker turns ✓   ◀──live updates──    └─▶ claude -p  (edits files in your repo)
                     (over Tailscale: private to your devices)
```

- **One small Node file, no dependencies.** It runs on your Mac next to your dev server.
- **Cheap on tokens.** Claude only runs when you send something, gets a short text brief per circle, and handles circles sent close together in one run.
- **Private and secure by default.** The server only listens on your Mac, your devices reach it through Tailscale, and every request needs a token. Claude can only read and edit files in your project.
- **Standard format.** Annotations are stored as [Agentation Annotation Format (AFS) v1.1](https://agentation.com/schema), so other AFS tools can read them.

---

## Try it in 30 seconds

No Tailscale and no setup. On your Mac, with Claude Code installed:
```bash
git clone https://github.com/reallygoodwork/pencil && cd pencil
npm run demo            # or: npm run demo -- --fake   (scripted agent, no tokens)
```
Open http://localhost:5173 in a desktop browser, click **✎**, circle something with the mouse, and send a note. The demo edits a scratch copy of a sample site, never your files.

## Requirements

- A Mac (or Linux machine) with **Node 20.6+**
- **Claude Code** installed and signed in: running `claude` in your terminal should work
- **Tailscale** on the Mac and on your iPhone or iPad (free; see [docs/tailscale.md](docs/tailscale.md))
- Your app's **dev server** running locally (Vite, Next.js, anything)

## Quick start (about 10 minutes)

### 1. Get the code
```bash
git clone https://github.com/reallygoodwork/pencil
cd pencil
```

### 2. Make your Mac reachable from your device
Follow **[docs/tailscale.md](docs/tailscale.md)**. The short version, once Tailscale is installed and HTTPS is enabled:
```bash
tailscale serve --bg --https=443  http://localhost:5173   # your app's dev server port
tailscale serve --bg --https=8443 http://127.0.0.1:4545   # pencil agent
```
You'll get a name like `https://your-mac.your-tailnet.ts.net`.

### 3. Configure
```bash
cp pencil.env.example pencil.env
```
Edit `pencil.env`:
```bash
APP_ORIGIN=https://your-mac.your-tailnet.ts.net        # your app, as the device sees it
PUBLIC_URL=https://your-mac.your-tailnet.ts.net:8443   # pencil agent, as the device sees it
PROJECT_DIR=/Users/you/code/your-app                   # the repo Claude may edit
```

### 4. Start the server
```bash
npm start
```
Leave it running. It never prints your token; step 5 shows how to get the script tag.

### 5. Add the overlay to your app
Pick one:
- **Script tag (recommended):** run `npm run tag` and paste the output into your app's dev HTML. For Vite and Next.js, use the setup in **[docs/frameworks.md](docs/frameworks.md)**, which reads the token automatically and never ships to production.
- **Bookmarklet (no code changes):** run `npm run bookmarklet`, save the output as a bookmark on your device, and tap it on any page of your app.

### 6. Use it
On your iPhone or iPad, open `https://your-mac.your-tailnet.ts.net`:
1. Tap the pen (bottom right). It lights up.
2. **Circle** the thing you want changed, or sketch it. Pause for under a second.
3. Pick **Change**, **Fix** or **Ask**, then type or dictate your note.
4. Tap send.

A numbered marker sits on what you marked. It turns blue while Claude works, then a green check with Claude's answer, and your dev server's hot reload shows the change. Tap it to drag between before and after.

---

## Sketch what you mean

You don't have to describe everything in words. Draw it like you'd mark up a print, and Claude reads the intent:

| Draw | Pencil Agent reads it as |
|---|---|
| ◯ a circle | "this thing" |
| → an arrow from one thing to a spot | move it there (a card, a section, a button) |
| □ a box in empty space, with handwriting inside | add something like this here, with that label |
| ✕ an X, or a line through text | remove it |
| ＿ an underline | emphasise it |
| any other doodle | a shape or layout to build, read from the sketch image |

Draw several marks in a row, then pause for a moment and the note card opens, listing what it read ("→ Move card 'Fountain-pen safe' before card 'Lay-flat binding'"). Add a note or send the sketch as it is. Claude replies starting with **"Read as…"**, so if it misread you, reply on the note.

For anything beyond a plain circle, Claude also gets a small picture: the page as grey outlines with your ink in red. That's how it reads handwriting and rough shapes. Plain circles stay text-only, to keep token use low.

## Day-to-day use

| You want to… | Do this |
|---|---|
| Draw on iPad | Use the Pencil. Fingers keep scrolling and tapping as normal. |
| Draw on iPhone | Use your finger while ✎ is on. Turn ✎ off to scroll. |
| Send several changes at once | Circle and send a few in a row. Anything sent within about 2 seconds goes to Claude in one run. |
| Ask instead of change | Pick **Ask** above the note. Claude answers without editing files, and the answer opens on the note. |
| Move something | Draw an arrow from it to where it should go. |
| Add something | Draw a box where it should go and scribble what it is inside. |
| See what has notes | Annotated elements get an outline and a small numbered marker. The eye in the tray hides them all. |
| See every note | Tap the tray ("3 notes · 1 working") next to ✎. **Open** and **Done** tabs; tap a note to jump to it. |
| See what Claude did | Tap the marker to read the thread. Finished notes show a before/after you can drag to compare. |
| Follow up or correct it | Tap the marker and reply. That reopens the note and Claude picks it up again. |
| Close one | **Close** on the note or in the tray. It moves to Done with its history, and Claude leaves it alone. |
| Reopen one | **Reopen** from the Done tab. It goes back to Claude. |
| Delete one | The bin, then confirm. You get 5 seconds to **Undo**. |
| Talk instead of type | Use the 🎤 on your keyboard. For a mic button in the note (with a live voice visual) that transcribes on your Mac, see [Voice](docs/reference.md#voice). |

**Colours:** amber = waiting, blue = Claude is working, purple = Claude asked you something, green = done, grey = closed. Dashed outline = still open, solid = finished.

**Write notes like you'd brief a developer:** "make this the brand orange and 20% smaller" works better than "fix this". Claude sees the element you circled, its text, classes and (for React) its component and source file.

## Keeping token use low

The server is built to keep token use low:
- **Idle costs nothing.** No model runs until you send a note.
- **Short briefs.** Each circle becomes about 50–80 tokens: your note, the page, the element path and text, the source file, and classes. The full captured details (styles, bounding box, attributes) stay on your Mac.
- **Batching.** Circles sent close together go to one `claude` run, so Claude explores your codebase once.
- **Smaller model:** set `CLAUDE_MODEL=haiku` or `sonnet` in `pencil.env` for routine tweaks.
- **Help Claude find things faster:** a short `CLAUDE.md` in your project ("components live in src/components, styles use Tailwind") cuts down the exploring Claude does on each run.

## Optional: let your open Claude Code session do the work (relay)

By default each batch starts a fresh `claude -p` run. If you'd rather the session that built the thing also fixes it, with all its context, use relay mode:
```bash
npm run relay            # the server listens, but runs no agent itself
npm run install-relay    # once: installs the /pencil-relay command into ~/.claude/commands
```
Then, in a Claude Code session in your project, run **`/pencil-relay`**. It starts one background shell (`node bin/pencil.js wait`) that sleeps on a long poll until a note lands, so **waiting costs no tokens**. When a note arrives the shell prints the brief and exits, which wakes the session. Claude makes the change, answers on the note with `node bin/pencil.js resolve <id> "…"`, and starts waiting again.

**Notes go back to the session that took them.** Each session gets an id, and when you reply on a note, the reply goes to the session that handled it. Two sessions in one repo each see only their own threads. Add `--match /checkout` to only take notes from pages whose URL contains `/checkout`.

An MCP mode also exists (`node server.js --mcp`), but its `pencil_watch` re-sends your session's context every few minutes while idle. Prefer relay.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Error toast `origin not allowed` | `APP_ORIGIN` must exactly match the address bar origin on the device: scheme, host and port, with no trailing slash. |
| Error toast `bad token` | The tag or bookmarklet has an old token. Run `npm run tag` or `npm run bookmarklet` again. The token lives in `~/.pencil-agent/token`. |
| No ✎ button appears | Check that `PUBLIC_URL/health` opens on the device. If your app sets a Content Security Policy, allow `PUBLIC_URL` in `script-src` and `connect-src` in dev. |
| `502` from Tailscale | Is the dev server running? Use the full `http://localhost:PORT` form in `tailscale serve`. See [docs/tailscale.md](docs/tailscale.md#troubleshooting). |
| Vite says "Blocked request. This host is not allowed" | Add `server.allowedHosts: ['.ts.net']`. See [docs/frameworks.md](docs/frameworks.md#vite). |
| The Pencil scrolls instead of drawing | The pen is off. Tap it so it lights up. |
| Marker turns green but the page doesn't change | Your dev server isn't hot-reloading through Tailscale. See [docs/frameworks.md](docs/frameworks.md) or add `data-reload="true"` to the script tag. |
| Marker turns purple with "I couldn't finish this" | Claude failed or timed out. Check the server's terminal output, then reply on the note to retry. |
| `claude: not found` | Set `CLAUDE_BIN=/full/path/to/claude` in `pencil.env`. |
| `Port 4545 is in use` | Another Pencil Agent is running, or set `PORT=` to something else (and update the `tailscale serve` command to match). |

## Security in one paragraph

The server binds to `127.0.0.1`, so only your Mac can reach it directly, and your devices reach it through Tailscale's private network. Every API call needs a random token (stored in `~/.pencil-agent/token`, readable only by you), must come from your app's exact origin, and must name an allowed Host, so a website can't reach it through your browser by pointing its own hostname at your Mac. The relay's agent API only answers on the Mac itself: no Origin, a loopback Host, nothing forwarded. Claude runs with file tools only: **Read, Edit, Write, Glob, Grep**, inside `PROJECT_DIR`, with no shell and no network. Text captured from the page is labelled as data, not instructions. Never add the script tag to production builds. Details are in [docs/reference.md](docs/reference.md#security).

## Repo layout

```
server.js            the server (no dependencies)
overlay.js           the browser overlay
bin/pencil.js        relay client for a Claude Code session (wait, resolve, reply, dismiss, get)
templates/           the /pencil-relay command, installed with npm run install-relay
docs/                setup guides + reference; docs/product/ = hosted-product plan
examples/demo-app/   sample site for the demo
scripts/             demo runner, video recorder
site/                landing page (static)
test/                npm test
CLAUDE.md            context for Claude Code when working on this repo
```

## Docs

- [docs/tailscale.md](docs/tailscale.md): set up private HTTPS access from your phone or iPad
- [docs/frameworks.md](docs/frameworks.md): Vite, Next.js, other frameworks, and the bookmarklet
- [docs/reference.md](docs/reference.md): configuration, AFS data model, HTTP API, MCP tools, voice, security

## Credits

- Annotation format: [Agentation Annotation Format Schema v1.1](https://agentation.com/schema). Pencil Agent is an independent implementation and contains no Agentation code.
- Stroke rendering: [perfect-freehand](https://github.com/steveruizok/perfect-freehand) by Steve Ruiz (MIT), vendored in `vendor/`.
- Made by [Really Good Work Inc.](https://reallygood.work) · [@reallygoodwork](https://x.com/reallygoodwork)

## License

MIT. Use it for anything: personal, client work, commercial. Change it, ship it, sell it. Just keep the credit: the copyright line in [LICENSE](LICENSE) stays in your copy. A shout-out to [@reallygoodwork](https://x.com/reallygoodwork) is appreciated, not required.

© 2026 Drew Minns, [Really Good Work Inc.](https://reallygood.work)
