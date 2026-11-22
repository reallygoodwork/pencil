#!/usr/bin/env node
// Try Pencil Agent in 30 seconds, no Tailscale needed:
//   npm run demo            → real Claude Code edits a scratch copy of the demo app
//   npm run demo -- --fake  → a scripted stand-in agent (no tokens), for recording
// Open http://localhost:5173 in a desktop browser, tap ✎, circle, send.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FAKE = process.argv.includes("--fake");
const APP_PORT = Number(process.env.DEMO_PORT || 5173);
const PENCIL_PORT = Number(process.env.PORT || 4545);

// Work on a scratch copy so the repo's demo app never changes.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pencil-demo-"));
fs.cpSync(path.join(ROOT, "examples/demo-app"), work, { recursive: true });

const env = {
  ...process.env,
  APP_ORIGIN: `http://localhost:${APP_PORT}`,
  PUBLIC_URL: `http://localhost:${PENCIL_PORT}`,
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
    const tag = `<script src="http://localhost:${PENCIL_PORT}/overlay.js" data-token="${token()}" data-reload="true" defer></script>`;
    body = body.toString().replace("</body>", `${tag}\n</body>`);
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}).listen(APP_PORT, "127.0.0.1", () => {
  console.log(`\nDemo app:  http://localhost:${APP_PORT}   (${FAKE ? "fake agent" : "real Claude Code"} editing ${work})\n`);
});

const stop = () => { server.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
