# Hosted product plan

Status: **proposal**. Nothing here is built yet. The open-source tool in this repo is the starting point.
Whiteboard: https://claude.ai/artifact/4VqF13Pk84k4YcaHCJXR3a

**One line:** relay the work, never see the code.

## Shape

```
Phone / iPad                     pencil.app (hosted)                User's Mac
────────────                     ───────────────────                ──────────
App or preview URL               Accounts, projects, devices        pencil daemon (npx)
 + overlay (hosted script) ──▶   Relay (WebSocket room/project) ◀── outbound connection only
 circle, note, voice             Sees encrypted blobs only          runs Claude Code locally,
 pins update live          ◀──   Dashboard, history, billing        commits to a pencil/ branch
```

- **Setup goes from Tailscale and tokens to:** `npx pencil-agent login`, scan a QR code to pair the device, then add one line to the app (`@pencil/vite` or `@pencil/next`) or use the browser extension.
- **Two places to annotate:**
  - **Local dev server:** the power-user path. The phone still needs to reach the Mac.
  - **Preview deployments:** the main hosted path, with no tunnel. The agent commits, the preview redeploys, and the pin turns green with a link.
- **Later, a cloud runner for teams:** a sandboxed agent works against the GitHub repo and opens a pull request, with no local machine involved.

## Security

1. **End-to-end encryption.** QR pairing exchanges keys. The overlay encrypts each annotation with the daemon's public key, and the relay only routes ciphertext.
2. **Outbound only.** The daemon dials out to the relay, so there are no open ports or tunnels.
3. **Per-device credentials** that are short-lived and revocable, plus an origin allowlist per project.
   - **Watch out:** Safari blocks third-party cookies, so the overlay can't rely on a pencil.app login cookie. Decide between a device credential stored on the app's origin and a popup sign-in.
4. **Agent in a box.**
   - **Local:** file tools only, with a branch and a commit per annotation.
   - **Cloud:** a microVM per job, a GitHub App limited to selected repos, no secrets, and pull requests as the only output.
5. **Prompt injection.** Page text is labelled as data. With no shell, no secrets and review before merging, the worst case is a bad diff that someone reviews.
6. **Teams:** single sign-on, roles, an audit log (who asked for what, and the resulting commit), retention settings and rate limits.

## Hosting

| Piece | Use |
|---|---|
| Site and dashboard | Next.js on Vercel |
| Relay | Cloudflare Durable Objects or Fly.io (long-lived WebSockets) |
| Database | Postgres (Neon or Supabase) |
| Overlay | Versioned CDN script plus npm |
| Cloud runner | Vercel Sandbox or E2B, running the Claude Agent SDK |
| AI cost | Local runner: the user's own Claude plan. Cloud runner: metered, or bring your own key. |

## Distribution and pricing

- **Open core:** the daemon, overlay and AFS format under MIT; the hosted relay, team features and cloud runner are paid.
- **Packages:** `npx pencil-agent`, `@pencil/vite`, `@pencil/next`, and a Claude Code plugin (MCP server plus a watch-mode skill).
- **Safari Web Extension** for iOS and iPadOS, to add the overlay to any allowed site.
- **Integrations:** notes become Linear issues, and fixes post to Slack with the preview link.
- **Pricing:**
  - **Free:** local runner, 1 user.
  - **Pro:** previews, history, multiple devices.
  - **Team:** cloud runner, single sign-on, audit log, priced per seat plus usage.

## Roadmap

1. **MVP:** relay with QR pairing and end-to-end encryption, the daemon (from `server.js`), the Vite and Next packages, branch-per-session commits, and preview URLs.
2. **Teams:** GitHub App, cloud runner and pull requests, Linear and Slack, single sign-on and an audit log.
3. **Reach:** the Safari extension and a Mac menu bar app for non-developers.

## Decide first

- **Name:** "Pencil" is already used by pencil.dev. Check before launch.
- **Safari auth:** device credential or popup sign-in (see Security, point 3).
- **Agentation:** Agentation's packages are PolyForm Shield licensed, so never copy their code. Use their published AFS spec only, and lead with Pencil-first, mobile-first review.
