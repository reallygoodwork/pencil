#!/usr/bin/env node
// Pencil Agent relay client, for a Claude Code session working in your project. Zero dependencies.
//
//   node bin/pencil.js wait [--session rly_x] [--match /checkout]   Block until notes arrive, claim them, print briefs.
//   node bin/pencil.js resolve <id> "what you changed"               Answer on the note; its marker turns to a check.
//   node bin/pencil.js reply   <id> "a question for the user"        Ask; their answer comes back to this session.
//   node bin/pencil.js dismiss <id> "why"                            Close without changes.
//   node bin/pencil.js get     <id>                                  The full AFS annotation as JSON.
//
// `wait` is meant to run as a background shell: it sleeps on a long poll and costs no tokens until a note lands,
// then prints and exits, which wakes the session. Run it again to keep listening. Notes you claim come back to the
// same --session when the user replies, so two sessions in one repo each get only their own threads.
const fs = require("fs"), os = require("os"), path = require("path");

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < rest.length; i++) rest[i].startsWith("--") ? (flags[rest[i].slice(2)] = rest[++i]) : args.push(rest[i]);

const PORT = Number(process.env.PENCIL_PORT || process.env.PORT || 4545);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = process.env.TOKEN || (() => {
  try { return fs.readFileSync(path.join(os.homedir(), ".pencil-agent", "token"), "utf8").trim(); }
  catch { fail("No token at ~/.pencil-agent/token. Start the server once (npm start) to create it."); }
})();
function fail(m) { process.stderr.write(m + "\n"); process.exit(1); }

async function call(p, opts = {}) {
  let res;
  try {
    res = await fetch(BASE + p, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } });
  } catch { fail(`Pencil Agent isn't running on port ${PORT}. Start it with: npm start -- --relay`); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${res.status}: ${body.error || "request failed"}`);
  return body;
}

(async () => {
  switch (cmd) {
    case "wait": {
      let session = flags.session || "";
      const match = flags.match ? `&match=${encodeURIComponent(flags.match)}` : "";
      for (;;) {
        const r = await call(`/agent/claim?wait=600&session=${encodeURIComponent(session)}${match}`);
        session = r.session;
        if (!r.count) continue; // nothing in 10 minutes: keep sleeping
        process.stdout.write(`session: ${session}  (pass --session ${session} next time)\n`);
        process.stdout.write(`${r.count} note${r.count > 1 ? "s" : ""} claimed. Make each change, answer with \`node bin/pencil.js resolve <id> "<what you changed>"\`, then run wait again.\n\n`);
        process.stdout.write(r.text + "\n");
        return;
      }
    }
    case "resolve": case "reply": case "dismiss": {
      const [id, ...words] = args;
      if (!id || !words.length) fail(`usage: pencil ${cmd} <id> "<message>"`);
      await call(`/agent/annotations/${encodeURIComponent(id)}/${cmd}`, { method: "POST", body: JSON.stringify({ message: words.join(" ") }) });
      process.stdout.write("ok\n");
      return;
    }
    case "get": {
      if (!args[0]) fail("usage: pencil get <id>");
      process.stdout.write(JSON.stringify(await call(`/agent/annotations/${encodeURIComponent(args[0])}`), null, 2) + "\n");
      return;
    }
    default:
      fail("usage: pencil wait | resolve | reply | dismiss | get   (see the top of bin/pencil.js)");
  }
})();
