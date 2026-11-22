#!/usr/bin/env node
// Try Pencil Agent in 30 seconds, no Tailscale needed:
//   npm run demo            → real Claude Code edits a scratch copy of the demo app
//   npm run demo -- --fake  → a scripted stand-in agent (no tokens), for recording
// Open http://localhost:5173 in a desktop browser, tap ✎, circle, send.
//
// On your phone or iPad:
//   npm run demo -- --fake --lan                 → same Wi-Fi, plain HTTP (no mic button; keyboard dictation works)
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
if (LAN) {
  const ip = lanIp();
  if (!ip) { console.error("Couldn't find this Mac's Wi-Fi address. Are you on Wi-Fi?"); process.exit(1); }
  appOrigin = `http://${ip}:${APP_PORT}`; publicUrl = `http://${ip}:${PENCIL_PORT}`; bind = "0.0.0.0"; hostEnv = { HOST: "0.0.0.0" };
} else if (TS) {
  const name = tailscaleName();
  if (!name) { console.error("Couldn't read your Tailscale name. Is Tailscale running, with the CLI installed? See docs/tailscale.md."); process.exit(1); }
  appOrigin = `https://${name}`; publicUrl = `https://${name}:8443`;
}

// Work on a scratch copy so the repo's demo app never changes.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pencil-demo-"));
fs.cpSync(path.join(ROOT, "examples/demo-app"), work, { recursive: true });

const env = {
  ...process.env,
  APP_ORIGIN: appOrigin,
  PUBLIC_URL: publicUrl,
  ...hostEnv,
  PORT: String(PENCIL_PORT),
  PROJECT_DIR: work,
  ...(FAKE ? { CLAUDE_BIN: path.join(ROOT, "test/fixtures/fake-claude.sh") } : {}),
};
const server = spawn(process.execPath, [path.join(ROOT, "server.js")], { env, stdio: ["ignore", "ignore", "inherit"] });

const token = () => (process.env.TOKEN || fs.readFileSync(path.join(os.homedir(), ".pencil-agent/token"), "utf8")).trim();
const types = { ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".js": "text/javascript" };

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(work, rel);
  if (!file.startsWith(work) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (rel === "index.html") {
    const tag = `<script src="${publicUrl}/overlay.js" data-token="${token()}" data-reload="true" defer></script>`;
    body = body.toString().replace("</body>", `${tag}\n</body>`);
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}).listen(APP_PORT, bind, () => {
  const who = FAKE ? "fake agent" : "real Claude Code";
  if (TS) {
    console.log(`\nRun these once (they keep running in the background until you turn them off):\n`);
    console.log(`  tailscale serve --bg --https=443  http://localhost:${APP_PORT}`);
    console.log(`  tailscale serve --bg --https=8443 http://127.0.0.1:${PENCIL_PORT}\n`);
    console.log(`Then on your phone (Tailscale on):  ${appOrigin}   (${who})`);
    console.log(`When you're done:  tailscale serve reset\n`);
  } else if (LAN) {
    console.log(`\nOn your phone (same Wi-Fi):  ${appOrigin}   (${who})`);
    console.log(`Plain HTTP on your local network: fine for a demo at home, not on café or office Wi-Fi.\n`);
  } else {
    console.log(`\nDemo app:  http://localhost:${APP_PORT}   (${who} editing ${work})\n`);
  }
});

const stop = () => { server.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
