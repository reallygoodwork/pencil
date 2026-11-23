#!/usr/bin/env node
// Try Pencil Agent in 30 seconds, no Tailscale needed:
//   npm run demo            → real Claude Code edits a scratch copy of the demo app
//   npm run demo -- --fake  → a scripted stand-in agent (no tokens), for recording
//   npm run demo -- --relay → opens Claude Code in this terminal, listening for notes (fastest: no startup per note)
// The real agent defaults to Haiku for plain circles and Sonnet for sketches. Override with AGENT_MODEL and
// AGENT_MODEL_SKETCH, or use Codex with AGENT=codex. The --relay session uses Sonnet (or AGENT_MODEL).
// Open http://localhost:5173 in a desktop browser, tap ✎, circle, send.
//
// On your phone or iPad:
//   npm run demo -- --fake --lan                 → same Wi-Fi, plain HTTP (no mic button; keyboard dictation works).
//                                                  Prints a QR code and a short <mac-name>.local address.
//   npm run demo -- --fake --tailscale           → over Tailscale with HTTPS (the mic button works); prints the
//                                                  two `tailscale serve` commands to run first

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FAKE = process.argv.includes("--fake");
const APP_PORT = Number(process.env.DEMO_PORT || 5173);
const PENCIL_PORT = Number(process.env.PORT || 4545);
const LAN = process.argv.includes("--lan");
const TS = process.argv.includes("--tailscale");
const RELAY = process.argv.includes("--relay");

// Where the phone reaches the demo app and Pencil Agent.
function lanIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.") && !a.address.startsWith("100.")) return a.address;
  return null;
}
function tailscaleName() {
  const bins = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];
  for (const bin of bins) {
    try {
      const out = require("child_process").execFileSync(bin, ["status", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
      const name = JSON.parse(out).Self?.DNSName?.replace(/\.$/, "");
      if (name) return name;
    } catch {}
  }
  return null;
}
let appOrigin = `http://localhost:${APP_PORT}`, publicUrl = `http://localhost:${PENCIL_PORT}`, bind = "127.0.0.1", hostEnv = {};
// The Mac's Bonjour name (what System Settings → General → Sharing shows as "Local hostname").
function localName() {
  try {
    if (process.platform === "darwin") {
      const n = require("child_process").execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8", timeout: 3000 }).trim();
      if (n) return `${n}.local`.toLowerCase();
    }
  } catch {}
  const h = os.hostname().split(".")[0];
  return /^[a-z0-9-]+$/i.test(h) ? `${h}.local`.toLowerCase() : null;
}
let ip = null, local = null;
if (LAN) {
  ip = lanIp();
  if (!ip) { console.error("Couldn't find this Mac's Wi-Fi address. Are you on Wi-Fi?"); process.exit(1); }
  local = localName();
  // The overlay loads from the address the page was opened on, so allow both.
  const origins = [`http://${ip}:${APP_PORT}`, ...(local ? [`http://${local}:${APP_PORT}`] : [])];
  appOrigin = origins.join(","); publicUrl = `http://${ip}:${PENCIL_PORT}`; bind = "0.0.0.0"; hostEnv = { HOST: "0.0.0.0" };
} else if (TS) {
  const name = tailscaleName();
  if (!name) { console.error("Couldn't read your Tailscale name. Is Tailscale running, with the CLI installed? See docs/tailscale.md."); process.exit(1); }
  appOrigin = `https://${name}`; publicUrl = `https://${name}:8443`;
}

// Work on a scratch copy so the repo's demo app never changes. Same folder every run, reset to the original,
// so Claude Code only asks "Do you trust this folder?" once.
const work = path.join(fs.realpathSync(os.tmpdir()), "pencil-demo");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work);
fs.cpSync(path.join(ROOT, "examples/demo-app"), work, { recursive: true });

const env = {
  ...process.env,
  APP_ORIGIN: appOrigin,
  PUBLIC_URL: publicUrl,
  ...hostEnv,
  PORT: String(PENCIL_PORT),
  PROJECT_DIR: work,
  ...(FAKE ? { AGENT_BIN: path.join(ROOT, "test/fixtures/fake-claude.sh"), AGENT: "claude" } : {}),
};
// Fast by default: a small model for plain circles, a stronger one when there are arrows and boxes to read.
if (!FAKE && (env.AGENT || "claude") === "claude") {
  env.AGENT_MODEL ||= env.CLAUDE_MODEL || "haiku";
  env.AGENT_MODEL_SKETCH ||= "sonnet";
}
// In relay mode Claude Code takes over this terminal, so the server logs to a file instead.
const logFile = path.join(os.tmpdir(), `pencil-demo-${process.pid}.log`);
const serverErr = RELAY ? fs.openSync(logFile, "w") : "inherit";
const server = spawn(process.execPath, [path.join(ROOT, "server.js"), ...(RELAY ? ["--relay"] : [])], { env, stdio: ["ignore", "ignore", serverErr] });

const token = () => (process.env.TOKEN || fs.readFileSync(path.join(os.homedir(), ".pencil-agent/token"), "utf8")).trim();
const types = { ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".js": "text/javascript" };

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(work, rel);
  if (!file.startsWith(work) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (rel === "index.html") {
    let src = publicUrl;
    if (LAN) { const h = String(req.headers.host || "").split(":")[0]; if (h === ip || h === local) src = `http://${h}:${PENCIL_PORT}`; }
    const tag = `<script src="${src}/overlay.js" data-token="${token()}" data-reload="true" defer></script>`;
    body = body.toString().replace("</body>", `${tag}\n</body>`);
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}).listen(APP_PORT, bind, () => {
  const who = RELAY ? "your Claude Code session" : FAKE ? "fake agent" : env.AGENT === "codex" ? "real Codex" : "real Claude Code";
  if (TS) {
    console.log(`\nRun these once (they keep running in the background until you turn them off):\n`);
    console.log(`  tailscale serve --bg --https=443  http://localhost:${APP_PORT}`);
    console.log(`  tailscale serve --bg --https=8443 http://127.0.0.1:${PENCIL_PORT}\n`);
    console.log(`Then on your phone (Tailscale on):  ${appOrigin}   (${who})`);
    console.log(`When you're done:  tailscale serve reset\n`);
  } else if (LAN) {
    const url = `http://${ip}:${APP_PORT}`;
    console.log(`\nOn your phone (same Wi-Fi), point the camera at this:\n`);
    console.log(qr(url));
    console.log(`  ${url}${local ? `\n  or type  http://${local}:${APP_PORT}` : ""}   (${who})`);
    console.log(`  Tip: Share → Add to Home Screen, and next time it's one tap.`);
    console.log(`  Plain HTTP on your local network: fine at home, not on café or office Wi-Fi.\n`);
  } else {
    console.log(`\nDemo app:  http://localhost:${APP_PORT}   (${who} editing ${work})\n`);
  }
  if (RELAY) startRelaySession();
});

// Relay mode: open Claude Code here, in the scratch copy, already listening. Enter first, so the QR code
// stays on screen while you scan it.
function startRelaySession() {
  console.log(`Server log:  tail -f ${logFile}`);
  console.log(`\nPress Enter to open Claude Code. It listens for notes and edits the scratch copy. Quit it to stop the demo.`);
  process.stdin.once("data", () => {
    process.stdin.pause();
    const pencil = path.join(ROOT, "bin/pencil.js");
    const installed = fs.existsSync(path.join(os.homedir(), ".claude/commands/pencil-relay.md"));
    // Without the installed command, pass the same instructions as the first message.
    const prompt = installed ? "/pencil-relay" : fs.readFileSync(path.join(ROOT, "templates/pencil-relay.md"), "utf8")
      .replace(/^---[\s\S]*?---\n/, "").replaceAll("{{PENCIL}}", pencil).replaceAll(" $ARGUMENTS", "");
    const bin = process.env.AGENT_BIN || process.env.CLAUDE_BIN || "claude";
    // One session takes both circles and sketches, so it gets one model: Sonnet is quick and still reads sketches well.
    const model = process.env.AGENT_MODEL || process.env.CLAUDE_MODEL || "sonnet";
    // "--allowedTools=": the flag takes a list, so a separate value would swallow the prompt after it.
    const claude = spawn(bin, [prompt, "--model", model, `--allowedTools=Bash(node ${pencil}:*)`], { cwd: work, stdio: "inherit", env: process.env });
    process.removeAllListeners("SIGINT");
    process.on("SIGINT", () => {}); // Ctrl+C belongs to Claude Code now
    claude.on("error", () => { console.error(`Couldn't start ${bin}. Is Claude Code installed?`); stop(); });
    claude.on("exit", stop);
  });
}

if (FAKE) {
  console.log("Fake agent: it doesn't read your note. It only makes two scripted edits:");
  console.log('  circle the headline, say "shorter and punchier"');
  console.log('  circle "Shop notebooks", say "make it the brand orange"');
  console.log("Anything else comes back unchanged. Drop --fake to have real Claude Code edit it.\n");
}

// A terminal QR code (two rows per line with half blocks). Dev-only: vendor/qrcode-generator.js, MIT.
function qr(text) {
  const q = require(path.join(ROOT, "vendor/qrcode-generator.js"))(0, "M");
  q.addData(text); q.make();
  const n = q.getModuleCount(), on = (r, c) => r >= 0 && c >= 0 && r < n && c < n && q.isDark(r, c);
  let out = "";
  for (let r = -2; r < n + 2; r += 2) {
    let line = "  ";
    for (let c = -2; c < n + 2; c++) { const t = on(r, c), b = on(r + 1, c); line += t && b ? " " : t ? "▄" : b ? "▀" : "█"; }
    out += line + "\n";
  }
  return out;
}

const stop = () => { server.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
