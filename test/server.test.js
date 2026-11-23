// Run with: npm test   (node:test, no dependencies)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 4600 + Math.floor(Math.random() * 300);
const ORIGIN = "http://localhost:5173";
const TOKEN = "test-token-0123456789abcdefghijklmn";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "pencil-test-home-"));
const project = fs.mkdtempSync(path.join(os.tmpdir(), "pencil-test-project-"));
const promptLog = path.join(home, "prompt.txt");
const argsLog = path.join(home, "args.txt");
let proc;

const H = (extra = {}) => ({ Origin: ORIGIN, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...extra });
const api = (p, { method = "GET", body, headers } = {}) =>
  fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: headers || H(), body: body && JSON.stringify(body) });
const afs = (comment, extra = {}) => ({
  comment, elementPath: "main > a.btn.btn-primary", element: "a", timestamp: Date.now(), x: 40, y: 300,
  url: `${ORIGIN}/`, cssClasses: "btn btn-primary", nearbyText: "Shop notebooks", sourceFile: "src/Button.tsx:12:7", ...extra,
});
const waitFor = async (fn, ms = 10_000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 150)); }
};

before(async () => {
  fs.copyFileSync(path.join(ROOT, "examples/demo-app/styles.css"), path.join(project, "styles.css"));
  proc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, HOME: home, PORT: String(PORT), APP_ORIGIN: ORIGIN, TOKEN, PROJECT_DIR: project,
      CLAUDE_BIN: path.join(ROOT, "test/fixtures/fake-claude.sh"), FAKE_CLAUDE_DELAY: "0", FAKE_CLAUDE_LOG: promptLog,
      FAKE_CLAUDE_ARGS: argsLog, AGENT_MODEL: "small-model", AGENT_MODEL_SKETCH: "big-model" },
    stdio: ["ignore", "ignore", process.env.DEBUG ? "inherit" : "ignore"],
  });
  await waitFor(() => fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.ok, () => false));
});
after(() => proc?.kill());

test("health and overlay are public", async () => {
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/health`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/overlay.js`)).status, 200);
});

test("rejects the wrong origin and the wrong token", async () => {
  assert.equal((await api("/config", { headers: H({ Origin: "http://evil.test" }) })).status, 403);
  assert.equal((await api("/config", { headers: H({ Authorization: "Bearer nope" }) })).status, 401);
  assert.equal((await api("/config", { headers: { Origin: ORIGIN } })).status, 401);
});

test("validates AFS input", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/` } })).json();
  assert.equal((await api(`/sessions/${s.id}/annotations`, { method: "POST", body: afs("") })).status, 400);
  assert.equal((await api(`/sessions/${s.id}/annotations`, { method: "POST", body: { comment: "x" } })).status, 400);
  assert.equal((await api(`/sessions/nope/annotations`, { method: "POST", body: afs("x") })).status, 404);
});

test("headless worker: annotation → brief → agent edit → resolved", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/` } })).json();
  const a = await (await api(`/sessions/${s.id}/annotations`, { method: "POST", body: afs("Make this our brand orange", { intent: "fix", status: "resolved" }) })).json();
  assert.equal(a.status, "pending", "browser cannot set status");
  assert.match(a.id, /^ann_/);
  const done = await waitFor(async () => { const x = await (await api(`/annotations/${a.id}`)).json(); return x.status === "resolved" && x; });
  assert.equal(done.resolvedBy, "agent");
  assert.match(done.thread.at(-1).content, /brand orange/);
  const prompt = fs.readFileSync(promptLog, "utf8");
  assert.match(prompt, new RegExp(`\\[${a.id}\\] fix: Make this our brand orange`));
  assert.match(prompt, /source: src\/Button.tsx:12:7/);
  assert.doesNotMatch(prompt, /computedStyles|boundingBox/, "brief stays lean");
  assert.match(fs.readFileSync(path.join(project, "styles.css"), "utf8"), /btn-primary\{background:var\(--accent\)/);
  const args = fs.readFileSync(argsLog, "utf8").split("\n");
  assert.equal(args[args.indexOf("--model") + 1], "small-model", "a plain circle uses the fast model");
  assert.equal(args[args.indexOf("--allowedTools") + 1], "Read,Edit,Write,Glob,Grep");
});

test("AGENT=codex runs codex exec in its sandbox", async () => {
  const port = PORT + 400, args = path.join(home, "codex-args.txt");
  const p = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, HOME: home, PORT: String(port), APP_ORIGIN: ORIGIN, TOKEN, PROJECT_DIR: project, AGENT: "codex",
      AGENT_BIN: path.join(ROOT, "test/fixtures/fake-claude.sh"), AGENT_MODEL: "fast", FAKE_CLAUDE_DELAY: "0", FAKE_CLAUDE_ARGS: args },
    stdio: "ignore",
  });
  try {
    const call = (u, o = {}) => fetch(`http://127.0.0.1:${port}${u}`, { headers: H(), ...o });
    await waitFor(() => call("/health").then((r) => r.ok, () => false));
    const s = await (await call("/sessions", { method: "POST", body: JSON.stringify({ url: `${ORIGIN}/` }) })).json();
    const a = await (await call(`/sessions/${s.id}/annotations`, { method: "POST", body: JSON.stringify(afs("Make this shorter")) })).json();
    await waitFor(async () => (await (await call(`/annotations/${a.id}`)).json()).status === "resolved");
    const got = fs.readFileSync(args, "utf8").split("\n");
    assert.deepEqual(got.slice(0, 3), ["exec", "--sandbox", "workspace-write"]);
    assert.equal(got[got.indexOf("-m") + 1], "fast");
    const prompt = fs.readFileSync(args, "utf8").split("\n--\n")[1];
    assert.match(prompt, new RegExp(`\\[${a.id}\\] change: Make this shorter`), "prompt comes last, after --");
  } finally { p.kill(); }
});

test("rejects an unknown AGENT", async () => {
  const p = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, HOME: home, APP_ORIGIN: ORIGIN, TOKEN, AGENT: "gpt" }, stdio: "ignore" });
  const code = await new Promise((res) => p.on("exit", res));
  assert.equal(code, 1);
});

test("queue: held notes wait for the user to send them, then go out together", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/queue` } })).json();
  const post = (c) => api(`/sessions/${s.id}/annotations`, { method: "POST", body: afs(c, { pencil: { held: true } }) }).then((r) => r.json());
  const a = await post("first"), b = await post("second");
  assert.equal(a.pencil.held, true);
  await new Promise((r) => setTimeout(r, 1500)); // longer than the batch wait
  assert.equal((await (await api(`/annotations/${a.id}`)).json()).status, "pending", "no agent takes a held note");
  assert.equal((await (await api(`/sessions/${s.id}/pending`)).json()).length, 0, "held notes aren't pending for agents");
  assert.equal((await (await api(`/sessions/${s.id}/send`, { method: "POST", body: {} })).json()).sent, 2);
  for (const x of [a, b]) await waitFor(async () => (await (await api(`/annotations/${x.id}`)).json()).status === "resolved");
  assert.equal((await api(`/sessions/nope/send`, { method: "POST", body: {} })).status, 404);
});

test("human reply reopens an annotation; browser messages are always human", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/x` } })).json();
  const a = await (await api(`/sessions/${s.id}/annotations`, { method: "POST", body: afs("tweak") })).json();
  await waitFor(async () => (await (await api(`/annotations/${a.id}`)).json()).status === "resolved");
  const m = await (await api(`/annotations/${a.id}/thread`, { method: "POST", body: { content: "smaller", role: "agent" } })).json();
  assert.equal(m.role, "human");
  // thread: agent summary, human reply, agent summary again (the original note lives in `comment`)
  const again = await waitFor(async () => { const x = await (await api(`/annotations/${a.id}`)).json(); return x.thread.length >= 3 && x.status === "resolved" && x; });
  assert.deepEqual(again.thread.map((t) => t.role), ["agent", "human", "agent"]);
});

test("SSE stream sends the AFS event envelope", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/sse` } })).json();
  const ctl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${PORT}/sessions/${s.id}/events`, { headers: H(), signal: ctl.signal });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  await api(`/sessions/${s.id}/annotations`, { method: "POST", body: afs("hello") });
  let buf = "";
  while (!/annotation\.created/.test(buf)) buf += (await reader.read()).value;
  ctl.abort();
  const ev = JSON.parse(buf.match(/data: (.+)/)[1]);
  for (const k of ["type", "timestamp", "sessionId", "sequence", "payload"]) assert.ok(k in ev, k);
});

// 1×1 transparent PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const sketchBody = (extra = {}) => afs("Sketch: move the third card first", {
  kind: "rearrange",
  pencil: {
    gestures: [{ type: "move", target: { path: "section.features > div.card:nth-of-type(3)", text: "03 Fountain-pen safe" },
      container: { path: "section.features", text: "" }, before: { path: "section.features > div.card:nth-of-type(1)", text: "01 Lay-flat binding" } },
      { type: "bogus", target: { path: "p.sub" } }],
    sketch: PNG,
  },
  ...extra,
});

test("sketches: gestures reach the brief, the image is saved privately as PNG", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/sketch` } })).json();
  const a = await (await api(`/sessions/${s.id}/annotations`, { method: "POST", body: sketchBody() })).json();
  assert.equal(a.kind, "rearrange");
  assert.equal(a.pencil.gestures[1].type, "sketch", "unknown gesture types are normalised");
  assert.ok(fs.existsSync(a.pencil.sketch));
  assert.equal(fs.statSync(a.pencil.sketch).mode & 0o777, 0o600);
  await waitFor(async () => (await (await api(`/annotations/${a.id}`)).json()).status === "resolved");
  const prompt = fs.readFileSync(promptLog, "utf8");
  assert.match(prompt, /mark 1: arrow: move section\.features > div\.card:nth-of-type\(3\)/);
  assert.match(prompt, /before section\.features > div\.card:nth-of-type\(1\)/);
  assert.match(prompt, /sketch image: .*\.png/);
  assert.match(prompt, /arrow = move it there/, "sketch guide is included");
  assert.match(prompt, /Read as/);
  const args = fs.readFileSync(argsLog, "utf8").split("\n");
  assert.equal(args[args.indexOf("--model") + 1], "big-model", "sketches use the sketch model");
});

test("sketches: non-PNG images are refused", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/sketch2` } })).json();
  const bad = sketchBody(); bad.pencil.sketch = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
  assert.equal((await api(`/sessions/${s.id}/annotations`, { method: "POST", body: bad })).status, 400);
  const fake = sketchBody(); fake.pencil.sketch = "data:image/png;base64," + Buffer.from("not a png").toString("base64");
  assert.equal((await api(`/sessions/${s.id}/annotations`, { method: "POST", body: fake })).status, 400);
});

test("plain circles keep the brief lean (no sketch guide, no marks)", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/lean` } })).json();
  const a = await (await api(`/sessions/${s.id}/annotations`, { method: "POST", body: afs("tighten this", { pencil: { gestures: [{ type: "circle", target: { path: "h1" } }] } }) })).json();
  await waitFor(async () => (await (await api(`/annotations/${a.id}`)).json()).status === "resolved");
  const prompt = fs.readFileSync(promptLog, "utf8");
  assert.doesNotMatch(prompt, /mark 1|sketch image|arrow = move/);
});

test("every note can carry a picture with its size and pin point, and a snapshot of what was seen", async () => {
  const s = await (await api("/sessions", { method: "POST", body: { url: `${ORIGIN}/pin` } })).json();
  const html = '<a class="btn btn-primary">Shop notebooks</a>';
  const a = await (await api(`/sessions/${s.id}/annotations`, { method: "POST", body: afs("make this orange", {
    pencil: { gestures: [{ type: "circle", target: { path: "a.btn" } }], sketch: PNG, sketchSize: { width: 1000, height: 640 }, pin: [412.4, 233],
      snapshot: { html, page: "ab".repeat(32) } } }) })).json();
  assert.deepEqual(a.pencil.pin, [412, 233]);
  assert.equal(fs.readFileSync(a.pencil.snapshot.path, "utf8"), html);
  assert.equal(fs.statSync(a.pencil.snapshot.path).mode & 0o777, 0o600);
  assert.equal(a.pencil.snapshot.sha256, require("node:crypto").createHash("sha256").update(html).digest("hex"));
  await waitFor(async () => (await (await api(`/annotations/${a.id}`)).json()).status === "resolved");
  const prompt = fs.readFileSync(promptLog, "utf8");
  assert.match(prompt, /image: .*\.png \(1000×640\), pin at \(412, 233\): crop around that point\. Optional/);
  assert.match(prompt, /seen: .*\.html \(sha256 [a-f0-9]{12}\)/);
  assert.doesNotMatch(prompt, /arrow = move/, "a circle with a picture is still not a sketch");
});

// Raw request so we can set Host and leave Origin out (fetch won't let us set Host).
const raw = (port, p, { method = "GET", headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = require("node:http").request({ host: "127.0.0.1", port, path: p, method, headers }, (res) => {
    let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : {} }));
  });
  req.on("error", reject);
  if (body) req.write(JSON.stringify(body));
  req.end();
});

test("only known Host names get an answer (blocks DNS rebinding)", async () => {
  assert.equal((await raw(PORT, "/health", { headers: { Host: "evil.example:4545" } })).status, 421);
  assert.equal((await raw(PORT, "/health", { headers: { Host: `localhost:${PORT}` } })).status, 200);
});

test("agent API: local only, never from a page or through a proxy", async () => {
  const auth = { Authorization: `Bearer ${TOKEN}`, Host: `127.0.0.1:${PORT}` };
  assert.equal((await raw(PORT, "/agent/claim", { headers: auth })).status, 200);
  assert.equal((await raw(PORT, "/agent/claim", { headers: { ...auth, Origin: ORIGIN } })).status, 403);
  assert.equal((await raw(PORT, "/agent/claim", { headers: { ...auth, "X-Forwarded-For": "100.64.0.2" } })).status, 403);
  assert.equal((await raw(PORT, "/agent/claim", { headers: { ...auth, Host: `localhost:${PORT}`, Authorization: "Bearer nope" } })).status, 401);
});

test("relay mode: notes go to the session that took them, and nothing runs on its own", async () => {
  const port = PORT + 2;
  const p = spawn(process.execPath, [path.join(ROOT, "server.js"), "--relay"], {
    env: { ...process.env, HOME: home, PORT: String(port), APP_ORIGIN: ORIGIN, TOKEN, PROJECT_DIR: project },
    stdio: ["ignore", "ignore", "ignore"],
  });
  try {
    await waitFor(() => fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false));
    const web = (u, o = {}) => fetch(`http://127.0.0.1:${port}${u}`, { ...o, headers: H(), body: o.body && JSON.stringify(o.body) }).then((r) => r.json());
    const agent = (u, o = {}) => raw(port, u, { ...o, headers: { Authorization: `Bearer ${TOKEN}`, Host: `127.0.0.1:${port}`, "Content-Type": "application/json" } });
    const s = await web("/sessions", { method: "POST", body: { url: `${ORIGIN}/relay` } });
    const a = await web(`/sessions/${s.id}/annotations`, { method: "POST", body: afs("make it orange") });
    await new Promise((r) => setTimeout(r, 2600));
    assert.equal((await web(`/annotations/${a.id}`)).status, "pending", "relay mode runs no agent by itself");

    const A = (await agent("/agent/claim?session=rly_aaaa&wait=1")).body;
    assert.deepEqual(A.ids, [a.id]);
    assert.match(A.text, /make it orange/);
    assert.equal((await agent(`/agent/annotations/${a.id}/reply`, { method: "POST", body: { message: "Which orange?" } })).status, 200);
    await web(`/annotations/${a.id}/thread`, { method: "POST", body: { content: "The brand one" } });

    const B = (await agent("/agent/claim?session=rly_bbbb&wait=1")).body;
    assert.equal(B.count, 0, "another session doesn't get A's thread");
    const A2 = (await agent("/agent/claim?session=rly_aaaa&wait=1")).body;
    assert.deepEqual(A2.ids, [a.id]);
    assert.match(A2.text, /human: The brand one/);

    await agent(`/agent/annotations/${a.id}/resolve`, { method: "POST", body: { message: "Now uses --accent." } });
    const done = await web(`/annotations/${a.id}`);
    assert.equal(done.status, "resolved");
    assert.equal(done.thread.at(-1).content, "Now uses --accent.");
  } finally { p.kill(); }
});

test("MCP mode lists five tools", async () => {
  const p = spawn(process.execPath, [path.join(ROOT, "server.js"), "--mcp"], {
    env: { ...process.env, HOME: home, PORT: String(PORT + 1), APP_ORIGIN: ORIGIN, TOKEN }, stdio: ["pipe", "pipe", "ignore"],
  });
  const lines = [];
  p.stdout.on("data", (d) => lines.push(...d.toString().trim().split("\n")));
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }) + "\n");
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
  const list = await waitFor(() => lines.map((l) => JSON.parse(l)).find((m) => m.id === 2));
  p.kill();
  assert.deepEqual(list.result.tools.map((t) => t.name), ["pencil_watch", "pencil_resolve", "pencil_reply", "pencil_dismiss", "pencil_get"]);
});

test("refuses to start on a hosting platform", async () => {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, HOME: home, APP_ORIGIN: ORIGIN, TOKEN, VERCEL: "1" }, encoding: "utf8", timeout: 5000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /runs on your own Mac/);
});

test("several app origins: each is allowed, anything else is not", async () => {
  const port = PORT + 3;
  const p = spawn(process.execPath, [path.join(ROOT, "server.js"), "--relay"], {
    env: { ...process.env, HOME: home, PORT: String(port), TOKEN, APP_ORIGIN: "http://mac.local:5173, http://192.168.1.20:5173" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  try {
    await waitFor(() => fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false));
    for (const o of ["http://mac.local:5173", "http://192.168.1.20:5173"]) {
      const r = await fetch(`http://127.0.0.1:${port}/config`, { headers: { Origin: o, Authorization: `Bearer ${TOKEN}` } });
      assert.equal(r.status, 200, o);
      assert.equal(r.headers.get("access-control-allow-origin"), o);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/config`, { headers: { Origin: "http://evil.test", Authorization: `Bearer ${TOKEN}` } })).status, 403);
    assert.equal((await raw(port, "/health", { headers: { Host: "mac.local:4545" } })).status, 200, "each origin's host is allowed");
  } finally { p.kill(); }
});
