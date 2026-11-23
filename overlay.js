// Pencil Agent overlay — produces Agentation Annotation Format Schema (AFS) v1.1 annotations.
// Tap the pen, circle or sketch with Apple Pencil (or a finger on phones), say or type the change, send.
// Notes stay marked on the page, live over SSE, until you or the agent close them. The tray lists them all.
(() => {
  if (window.__pencilAgent) return;
  window.__pencilAgent = true;

  const me = document.currentScript || document.querySelector('script[src*="overlay.js"][data-token]');
  const SERVER = new URL(me.src).origin;
  const TOKEN = me.dataset.token;
  const RELOAD = me.dataset.reload === "true"; // set if your dev server has no hot reload
  const auth = { Authorization: "Bearer " + TOKEN };
  const api = (path, { method = "GET", body, headers = {} } = {}) =>
    fetch(SERVER + path, {
      method,
      headers: { ...auth, ...(body && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body instanceof Blob ? body : body && JSON.stringify(body),
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
      return data;
    });

  // ---------- styles & UI: dark glass pills ----------
  const style = document.createElement("style");
  style.id = "pa-style";
  style.textContent = `
  #pa-canvas{position:fixed;inset:0;z-index:2147483645;pointer-events:none}
  .pa-ui{font:15px/1.35 -apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;color:#F4F4F5;letter-spacing:normal;text-align:left;-webkit-font-smoothing:antialiased;text-transform:none}
  :where(.pa-ui),:where(.pa-ui) *{box-sizing:border-box}
  :where(.pa-ui) button,:where(.pa-ui) textarea{all:unset;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  :where(.pa-ui) button{cursor:pointer}
  :where(.pa-ui) svg{display:block;flex:0 0 auto}
  .pa-ui [hidden]{display:none!important}
  .pa-glass{background:rgba(24,24,27,.94);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 50px -18px rgba(0,0,0,.75)}
  #pa-btn{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483647;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#F4F4F5}
  #pa-btn.on{background:#F4F4F5;color:#121214}

  .pa-pill{position:relative;display:flex;align-items:flex-end;gap:8px;min-height:60px;padding:7px 7px 7px 20px;border-radius:30px;overflow:hidden;transition:border-radius .15s}
  .pa-pill.tall{border-radius:22px}
  .pa-pill.inner{background:rgba(255,255,255,.06);min-height:52px;padding:3px 3px 3px 16px;border-radius:26px}
  .pa-pill canvas{position:absolute;inset:0;width:100%;height:100%;opacity:.85;pointer-events:none;display:none}
  .pa-pill.rec canvas{display:block}
  .pa-pill textarea{position:relative;display:block;flex:1;min-width:0;height:44px;max-height:132px;padding:11px 0;font-size:16px;line-height:22px;color:#F4F4F5;overflow:auto;white-space:pre-wrap;word-break:break-word}
  .pa-pill textarea::placeholder{color:#A1A1AA;opacity:1}
  .pa-sbtn{position:relative;flex:0 0 44px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.1);color:#F4F4F5;display:inline-flex;align-items:center;justify-content:center}
  .pa-sbtn.go{background:#F4F4F5;color:#121214}
  .pa-sbtn.go.off{opacity:.35}
  .pa-sbtn.mic.rec{background:#F2547D;animation:pa-pulse 1.6s ease-out infinite}
  .pa-sbtn.mic.busy{opacity:.5}
  @keyframes pa-pulse{0%{box-shadow:0 0 0 0 rgba(242,84,125,.55)}70%{box-shadow:0 0 0 12px rgba(242,84,125,0)}100%{box-shadow:0 0 0 0 rgba(242,84,125,0)}}

  #pa-compose{position:fixed;z-index:2147483647;width:min(440px,calc(100vw - 24px));display:none}
  .pa-meta{display:inline-flex;align-items:center;gap:2px;max-width:100%;height:36px;padding:0 2px 0 14px;margin:0 0 8px;border-radius:999px;font-size:13px}
  .pa-meta .pa-tgt{color:#C4C4CC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto;margin-right:6px}
  .pa-meta button{height:32px;padding:0 7px;border-radius:999px;color:#7C7C86;font-weight:500;white-space:nowrap}
  .pa-meta button.on{color:#F4F4F5;font-weight:600}
  .pa-meta button.x{display:inline-flex;align-items:center;gap:4px;padding:0 12px 0 8px;margin-left:4px;color:#F4F4F5;font-weight:600;background:rgba(255,255,255,.1)}

  .pa-dot{flex:0 0 auto;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;line-height:1;background:var(--c);color:var(--ink)}
  .pa-dot.l{width:32px;height:32px;font-size:13px}
  .pa-outline{position:absolute;z-index:2147483644;pointer-events:none;border-radius:12px;border:1.5px dashed var(--c);background:color-mix(in srgb,var(--c) 7%,transparent)}
  .pa-outline.solid{border-style:solid}
  .pa-marker{position:absolute;z-index:2147483646;height:30px;max-width:230px;padding:0 12px 0 4px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:500;white-space:nowrap;transform:translateY(-50%);overflow:hidden}
  .pa-marker .pa-l{overflow:hidden;text-overflow:ellipsis}
  .pa-marker.working::after,.pa-row.working .pa-dot::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(76,111,255,0),rgba(76,111,255,.35),rgba(76,111,255,0)) no-repeat;background-size:120px 100%;animation:pa-shimmer 1.6s linear infinite}
  @keyframes pa-shimmer{0%{background-position:-120px 0}100%{background-position:260px 0}}
  html.pa-hide .pa-outline,html.pa-hide .pa-marker{display:none}

  #pa-toast{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;display:none;align-items:center;gap:10px;height:44px;max-width:min(560px,calc(100vw - 24px));padding:0 16px;border-radius:999px;font-size:14px}
  #pa-toast.has-dot{padding-left:6px}
  #pa-toast .pa-tt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #pa-toast button{height:36px;padding:0 10px;margin-right:-10px;border-radius:999px;font-weight:600;color:#F4F4F5;flex:0 0 auto}

  #pa-tray{position:fixed;right:84px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:2147483647;display:none;align-items:center;gap:8px;height:52px;padding:0 4px 0 14px;border-radius:999px;font-size:14px;white-space:nowrap}
  #pa-tray .pa-dots{display:inline-flex;gap:3px}
  #pa-tray .pa-dots i{width:8px;height:8px;border-radius:50%;background:var(--c)}
  .pa-mut{color:#8A8A94}
  .pa-ib{width:44px;height:44px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:#9C9CA5}
  .pa-ib.hi{color:#F4F4F5}
  .pa-qb{height:40px;padding:0 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;color:#9C9CA5;font-size:13.5px;font-weight:500;white-space:nowrap}
  .pa-qb.hi{color:#F4F4F5}
  .pa-qb.danger{background:rgba(240,82,82,.16);color:#FF8A8A}
  .pa-qb.send{background:#F4F4F5;color:#121214;font-weight:600}
  #pa-kb{position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px;border:0;padding:0}

  #pa-list{position:fixed;right:84px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:2147483647;width:400px;max-height:min(62vh,500px);border-radius:24px;display:none;flex-direction:column;overflow:hidden}
  .pa-lh{display:flex;align-items:center;gap:4px;padding:4px 4px 4px 16px;flex:0 0 auto}
  .pa-lh b{font-size:15px;font-weight:600;margin-right:6px}
  .pa-tab{height:44px;padding:0 6px;font-size:13.5px;font-weight:500;color:#7C7C86}
  .pa-tab.on{color:#F4F4F5;font-weight:600}
  .pa-rows{overflow:auto;overscroll-behavior:contain}
  .pa-row{display:flex;align-items:center;gap:12px;padding:8px 6px 8px 16px;border-top:1px solid rgba(255,255,255,.06)}
  .pa-row .pa-dot{position:relative;overflow:hidden}
  .pa-row .pa-rt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;cursor:pointer;padding:4px 0}
  .pa-row .pa-rt span:first-child{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pa-row .pa-rt span:last-child{font-size:12px;color:#8A8A94;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pa-row.closed .pa-rt span:first-child{color:#8A8A94;text-decoration:line-through}
  .pa-row .pa-ask{flex:1;font-size:14px;color:#E4E4E7}
  .pa-empty{padding:18px 16px 22px;color:#8A8A94;font-size:14px;border-top:1px solid rgba(255,255,255,.06)}

  #pa-note{position:fixed;z-index:2147483647;width:min(440px,calc(100vw - 24px));border-radius:24px;padding:12px 10px 8px 18px;display:none}
  .pa-nh{display:flex;align-items:center;gap:10px;min-height:36px}
  .pa-nh .pa-tgt{flex:1;min-width:0;font-size:13px;color:#8A8A94;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pa-nb{max-height:240px;overflow:auto;padding:6px 8px 10px 0}
  .pa-nb p{margin:0;font-size:17px;line-height:1.4;white-space:pre-wrap}
  .pa-msg{margin:10px 0 0;padding:9px 12px;border-radius:14px;background:rgba(255,255,255,.06);font-size:14px;line-height:1.4;white-space:pre-wrap}
  .pa-msg small{display:block;font-size:11.5px;color:#8A8A94;margin-bottom:2px}
  .pa-msg.human{background:transparent;padding:4px 0 0;color:#C4C4CC}
  .pa-cmp{--p:50%;position:relative;margin:12px 0 0;border-radius:14px;overflow:hidden;background:#fff;touch-action:none;cursor:ew-resize;user-select:none;-webkit-user-select:none}
  .pa-cmp img{display:block;width:100%;height:auto;pointer-events:none}
  .pa-cmp img.a{position:absolute;inset:0;height:100%;object-fit:contain;object-position:left top;background:#fff;clip-path:inset(0 0 0 var(--p))}
  .pa-cmp i{position:absolute;top:0;bottom:0;left:var(--p);width:2px;margin-left:-1px;background:#4C6FFF}
  .pa-cmp i::after{content:"";position:absolute;top:50%;left:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:#4C6FFF;box-shadow:0 2px 8px rgba(0,0,0,.35)}
  .pa-cmp b{position:absolute;bottom:8px;padding:2px 8px;border-radius:999px;background:rgba(17,17,19,.8);color:#F4F4F5;font-size:11.5px;font-weight:600}
  .pa-cmp b.l{left:8px} .pa-cmp b.r{right:8px}
  .pa-na{display:flex;align-items:center;gap:2px;min-height:44px;margin:6px 0 0 -12px}
  .pa-na .pa-ask{flex:1;padding-left:12px;font-size:14px;color:#E4E4E7}

  @media (max-width:520px){
    #pa-list{right:12px;left:12px;width:auto;bottom:calc(84px + env(safe-area-inset-bottom))}
    #pa-tray{left:auto}
  }`;
  document.head.appendChild(style);

  const el = (tag, props = {}, parent = document.body) => {
    const n = Object.assign(document.createElement(tag), props);
    n.setAttribute("data-pa", "");
    parent.appendChild(n);
    return n;
  };
  // tiny element builder for the bits inside our containers
  const h = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "html") n.innerHTML = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n[k] = v;
      else if (k === "className" || k === "textContent" || k === "hidden" || k === "value" || k === "placeholder") n[k] = v;
      else n.setAttribute(k, v);
    }
    n.append(...kids.flat().filter((k) => k != null && k !== false));
    return n;
  };
  const svg = (d, s = 18, w = 1.75) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    pen: svg('<path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3"/>', 22),
    mic: svg('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 20),
    send: svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 18, 1.9),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 18, 1.9),
    x: svg('<path d="M7 7l10 10M17 7L7 17"/>', 16, 1.9),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 12, 3),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    up: svg('<path d="M6 15l6-6 6 6"/>', 16, 1.9),
    down: svg('<path d="M6 9l6 6 6-6"/>', 16, 1.9),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 16),
    close: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/>', 16),
    reopen: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>', 16),
  };

  const canvas = el("canvas", { id: "pa-canvas" });
  const btn = el("button", { id: "pa-btn", className: "pa-ui pa-glass", title: "Annotate", innerHTML: ICON.pen });
  btn.setAttribute("aria-label", "Annotate");
  const toast = el("div", { id: "pa-toast", className: "pa-ui pa-glass" });
  toast.setAttribute("role", "status");

  // A pill input: text, mic (live dither while you talk), send. Used for new notes and replies.
  const pills = [];
  function makePill({ inner = false, placeholder, onSend }) {
    const cv = h("canvas", { "aria-hidden": "true" });
    const ta = h("textarea", { rows: "1", placeholder, "aria-label": placeholder });
    const mic = h("button", { className: "pa-sbtn mic", hidden: true, "aria-label": "Start talking", html: ICON.mic });
    const go = h("button", { className: "pa-sbtn go", "aria-label": "Send", html: ICON.send });
    const root = h("div", { className: "pa-pill" + (inner ? " inner" : " pa-glass") }, cv, ta, mic, go);
    const p = { root, cv, ta, mic, go, placeholder, rec: null, busy: null };
    p.grow = () => {
      ta.style.height = "44px";
      if (!ta.scrollHeight) return; // hidden: measure next time
      const hgt = Math.max(44, Math.min(ta.scrollHeight, 132));
      ta.style.height = hgt + "px";
      root.classList.toggle("tall", hgt > 46);
    };
    p.reset = (ph = p.placeholder) => { p.placeholder = ph; ta.placeholder = ph; ta.value = ""; p.grow(); };
    ta.addEventListener("input", p.grow);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go.click(); }
      if (e.key === "Escape") { e.preventDefault(); p.onEscape?.(); }
    });
    mic.onclick = () => (p.rec ? stopTalking(p) : startTalking(p));
    go.onclick = async () => { if (p.rec || p.busy) await stopTalking(p); onSend(ta.value.trim()); };
    pills.push(p);
    return p;
  }

  // New note: a meta line (what you marked · intent · ×) above the pill.
  const INTENTS = [["change", "Change"], ["fix", "Fix"], ["question", "Ask"]];
  const compose = el("div", { id: "pa-compose", className: "pa-ui" });
  const metaTgt = h("span", { className: "pa-tgt" });
  const chips = INTENTS.map(([v, l]) => h("button", { textContent: l, "data-v": v, onclick: () => setIntent(v) }));
  // Queue: hold notes on the device and send them together. The choice sticks between visits.
  let queueMode = false;
  try { queueMode = localStorage.getItem("pa-queue") === "1"; } catch {}
  const queueChip = h("button", { textContent: "Queue", title: "Hold notes and send them together", onclick: () => setQueue(!queueMode) });
  const cancelBtn = h("button", { className: "x", "aria-label": "Clear the marks", title: "Clear the marks" });
  cancelBtn.append(h("span", { html: ICON.x }), h("span", { textContent: "Clear" }));
  compose.append(h("div", { className: "pa-meta pa-glass" }, metaTgt, ...chips, queueChip, cancelBtn));
  let intent = "change";
  const setIntent = (v) => { intent = v; chips.forEach((c) => c.classList.toggle("on", c.dataset.v === v)); };
  const cPill = makePill({ placeholder: "Say or type the change", onSend: (t) => sendNote(t) });
  const ta = cPill.ta;
  compose.append(cPill.root);
  function setQueue(on) {
    queueMode = on;
    try { localStorage.setItem("pa-queue", on ? "1" : "0"); } catch {}
    queueChip.classList.toggle("on", on);
    queueChip.setAttribute("aria-pressed", String(on));
    cPill.go.innerHTML = on ? ICON.plus : ICON.send;
    cPill.go.setAttribute("aria-label", on ? "Add to the queue" : "Send");
    ta.focus({ preventScroll: true });
  }
  // iOS only opens the keyboard when focus happens inside a tap. The note card opens after a pause, so
  // focus this hidden field as the stroke ends, then hand focus to the note's text box when it opens.
  const kb = el("input", { id: "pa-kb", className: "pa-ui", type: "text", tabIndex: -1 });
  kb.setAttribute("aria-hidden", "true");
  let kbWanted = false;
  const kbOpen = () => { if (kbWanted && document.activeElement !== ta) kb.focus({ preventScroll: true }); kbWanted = false; };
  const kbClose = () => { if (document.activeElement === kb || document.activeElement === ta) document.activeElement.blur(); };

  // One note: status, thread, reply, close / reopen / delete.
  const detail = el("div", { id: "pa-note", className: "pa-ui pa-glass" });
  const nHead = h("div", { className: "pa-nh" });
  const nBody = h("div", { className: "pa-nb" });
  const nPill = makePill({ inner: true, placeholder: "Reply", onSend: (t) => reply(t) });
  const nAct = h("div", { className: "pa-na" });
  detail.append(nHead, nBody, nPill.root, nAct);

  // ---------- stroke rendering (perfect-freehand, with a plain-line fallback) ----------
  let getStroke = null;
  import(SERVER + "/vendor/perfect-freehand.mjs").then((m) => (getStroke = m.getStroke)).catch(() => {});
  const ctx = canvas.getContext("2d");
  function resize() {
    const dpr = devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  addEventListener("resize", resize);

  // ---------- sketching: several strokes, then a short pause opens the note card ----------
  let drawing = false, cur = null, strokes = [], inputType = "pen", stylusSeen = false;
  let rect = null, target = null, sketch = null, idleT = null;
  const IDLE_MS = 800;
  function drawStroke(s, live) {
    const p = s.pts;
    if (p.length < 2) return;
    if (getStroke) {
      const o = getStroke(p, { size: 7, thinning: 0.6, smoothing: 0.5, streamline: 0.4, simulatePressure: s.input !== "pen", last: !live });
      if (o.length < 4) return;
      const a = (x, y) => (x + y) / 2;
      let d = `M${o[0][0]},${o[0][1]} Q${o[1][0]},${o[1][1]} ${a(o[1][0], o[2][0])},${a(o[1][1], o[2][1])} T`;
      for (let i = 2; i < o.length - 1; i++) d += `${a(o[i][0], o[i + 1][0])},${a(o[i][1], o[i + 1][1])} `;
      ctx.fill(new Path2D(d + "Z"));
    } else {
      ctx.lineWidth = 3; ctx.lineJoin = ctx.lineCap = "round";
      ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
  }
  function redraw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = ctx.strokeStyle = "#e5484d";
    strokes.forEach((s) => drawStroke(s, false));
    if (cur) drawStroke(cur, true);
  }
  const clearStroke = () => { clearTimeout(idleT); strokes = []; cur = null; sketch = null; redraw(); };

  // ---------- input: Pencil always draws; fingers draw only on devices where no Pencil has been used ----------
  let drawMode = sessionStorage.getItem("pa-draw") === "1";
  const setMode = (on) => {
    drawMode = on;
    sessionStorage.setItem("pa-draw", on ? "1" : "0");
    btn.classList.toggle("on", on);
    if (!on) { abortTalking(cPill); hide(compose); clearStroke(); kbClose(); }
  };
  setMode(drawMode);
  const coarse = matchMedia("(pointer: coarse)").matches;
  btn.addEventListener("click", () => {
    setMode(!drawMode);
    // Phones: say once how to scroll while the pen is on.
    if (drawMode && coarse && !stylusSeen) {
      let seen = false;
      try { seen = localStorage.getItem("pa-hint") === "1"; localStorage.setItem("pa-hint", "1"); } catch {}
      if (!seen) say("Draw with one finger · scroll with two", 4000);
    }
  });

  const ours = (e) => e.target instanceof Element && e.target.closest("[data-pa]");
  const draws = (e) => drawMode && !ours(e) && (e.pointerType === "pen" || e.pointerType === "mouse" || (e.pointerType === "touch" && !stylusSeen));
  // Two fingers scroll the page while the pen is on: the second finger drops the stroke in progress.
  const fingers = new Set();
  let pan = null;
  const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  const dropStroke = () => { if (drawing) { drawing = false; cur = null; redraw(); } };
  document.addEventListener("touchstart", (e) => {
    if (!drawMode || ours(e)) return;
    const stylus = [...e.changedTouches].some((t) => t.touchType === "stylus");
    if (stylus) stylusSeen = true;
    if (!stylus && e.touches.length >= 2) { dropStroke(); pan = mid(e.touches); }
    if (stylus || !stylusSeen) e.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("touchmove", (e) => {
    if (!pan || e.touches.length < 2) return;
    e.preventDefault();
    const m = mid(e.touches);
    scrollBy(pan[0] - m[0], pan[1] - m[1]);
    pan = m;
  }, { passive: false, capture: true });
  const endTouch = (e) => { if (e.touches.length < 2) pan = null; if (e.type === "touchend") kbOpen(); };
  document.addEventListener("touchend", endTouch, true);
  document.addEventListener("touchcancel", endTouch, true);

  let swallowClick = false;
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "pen") stylusSeen = true;
    if (e.pointerType === "touch") fingers.add(e.pointerId);
    if (fingers.size > 1 || pan) { dropStroke(); return; }
    if (!draws(e)) return;
    e.preventDefault(); e.stopPropagation();
    clearTimeout(idleT);
    if (compose.style.display === "block") hide(compose); // keep the strokes: they're adding to the sketch
    hide(detail);
    drawing = true; inputType = e.pointerType;
    cur = { input: e.pointerType, pts: [[e.clientX, e.clientY, e.pressure || 0.5]] };
  }, true);
  document.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    if (fingers.size > 1) return dropStroke();
    for (const c of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) cur.pts.push([c.clientX, c.clientY, c.pressure || 0.5]);
    redraw();
  }, true);
  const finish = (e) => {
    fingers.delete(e.pointerId);
    if (!drawing) return;
    drawing = false; swallowClick = true;
    setTimeout(() => (swallowClick = false), 60);
    e.preventDefault(); e.stopPropagation();
    if (cur.pts.length >= 3) { strokes.push(cur); kbWanted = e.pointerType !== "mouse"; }
    cur = null;
    redraw();
    if (!strokes.length) return;
    idleT = setTimeout(analyze, IDLE_MS);
  };
  document.addEventListener("pointerup", finish, true);
  document.addEventListener("pointercancel", finish, true);
  document.addEventListener("click", (e) => {
    if ((swallowClick || (drawMode && !stylusSeen)) && !ours(e)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  addEventListener("scroll", () => { if (!drawing && compose.style.display !== "block") { clearStroke(); kbClose(); } }, { passive: true });

  function analyze() {
    sketch = interpret(strokes);
    if (!sketch.gestures.length) return clearStroke();
    rect = sketch.bbox;
    target = sketch.primary;
    openCompose();
  }

  // ---------- reading the sketch: what was drawn, and what it points at ----------
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const pathLen = (p) => p.reduce((s, q, i) => (i ? s + dist(p[i - 1], q) : 0), 0);
  function bboxOf(p) {
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  // One stroke → a mark: circle, box, arrow, line or scribble.
  function classify(s) {
    const p = s.pts, b = bboxOf(p), size = Math.max(b.w, b.h), L = pathLen(p);
    const start = p[0], end = p[p.length - 1];
    if (size < 14) return { type: "dot", b, p };
    if (dist(start, end) < 0.3 * size && L > 1.8 * size) {
      const m = 0.18 * Math.min(b.w, b.h) + 4;
      const nearEdge = p.filter(([x, y]) => x - b.x < m || b.x + b.w - x < m || y - b.y < m || b.y + b.h - y < m).length / p.length;
      return { type: nearEdge > 0.82 ? "box" : "circle", b, p };
    }
    // Arrow drawn in one stroke: the tip is the point farthest from the start, and the pen doubles back from it.
    let tip = 0;
    p.forEach((q, i) => { if (dist(start, q) > dist(start, p[tip])) tip = i; });
    const shaft = pathLen(p.slice(0, tip + 1)), head = L - shaft;
    if (tip < p.length - 2 && dist(start, p[tip]) > 40 && head > 0.06 * L && head < 0.6 * L && dist(start, p[tip]) / shaft > 0.75) {
      return { type: "arrow", b, p, from: start, to: p[tip] };
    }
    if (dist(start, end) / L > 0.85) return { type: "line", b, p, from: start, to: end };
    return { type: "scribble", b, p };
  }
  // Marks → gestures, merging two-stroke arrows and crosses.
  function interpret(list) {
    let marks = list.map(classify).filter((m) => m.type !== "dot");
    // a line plus a small "V" at one end = an arrow pointing at that end
    for (const line of marks.filter((m) => m.type === "line")) {
      const len = dist(line.from, line.to);
      const headIdx = marks.findIndex((m) => m !== line && m.type !== "box" && m.type !== "circle" && Math.max(m.b.w, m.b.h) < 0.5 * len &&
        Math.min(dist([m.b.x + m.b.w / 2, m.b.y + m.b.h / 2], line.from), dist([m.b.x + m.b.w / 2, m.b.y + m.b.h / 2], line.to)) < 40);
      if (headIdx < 0) continue;
      const h = marks[headIdx], hc = [h.b.x + h.b.w / 2, h.b.y + h.b.h / 2];
      const [from, to] = dist(hc, line.to) < dist(hc, line.from) ? [line.from, line.to] : [line.to, line.from];
      Object.assign(line, { type: "arrow", from, to, b: bboxOf(line.p.concat(h.p)), p: line.p.concat(h.p) });
      marks.splice(headIdx, 1);
    }
    // two crossing lines of similar length = an X (remove)
    const lines = marks.filter((m) => m.type === "line");
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], c = lines[j], ca = [a.b.x + a.b.w / 2, a.b.y + a.b.h / 2], cc = [c.b.x + c.b.w / 2, c.b.y + c.b.h / 2];
      if (a.type === "line" && c.type === "line" && dist(ca, cc) < 0.35 * Math.max(a.b.w, a.b.h)) {
        a.type = "cross"; a.b = bboxOf(a.p.concat(c.p)); a.p = a.p.concat(c.p); c.type = "merged";
      }
    }
    marks = marks.filter((m) => m.type !== "merged");
    // scribbles inside a box are its label (handwriting)
    for (const box of marks.filter((m) => m.type === "box")) {
      for (const m of marks) if (m !== box && m.type === "scribble" && within(m.b, box.b)) { m.type = "merged"; box.label = true; }
    }
    marks = marks.filter((m) => m.type !== "merged");

    const circles = marks.filter((m) => m.type === "circle").map((m) => ({ m, el: pickElement(m.b) }));
    const gestures = marks.map((m) => resolve(m, circles)).filter(Boolean);
    const all = bboxOf(list.flatMap((s) => s.pts));
    const needsImage = gestures.some((g) => !["circle", "strike", "underline", "cross"].includes(g.type) || g.label);
    const primary = gestures[0].el || gestures[0].container || document.body;
    return { gestures, bbox: all, primary, needsImage };
  }
  const within = (a, b) => a.x >= b.x - 6 && a.y >= b.y - 6 && a.x + a.w <= b.x + b.w + 6 && a.y + a.h <= b.y + b.h + 6;
  const blockAt = (x, y) => {
    let n = document.elementFromPoint(x, y);
    if (!n || n.closest("[data-pa]")) return null;
    while (n && n !== document.body && /^(inline|contents)$/.test(getComputedStyle(n).display)) n = n.parentElement;
    return n === document.body || n === document.documentElement ? null : n;
  };
  // Where something would go if dropped at (x, y) inside `container`: before which child, along its flow.
  function slotIn(container, x, y) {
    const cs = getComputedStyle(container);
    const row = /flex/.test(cs.display) && !/column/.test(cs.flexDirection);
    const kids = [...container.children].filter((k) => !k.closest("[data-pa]") && k.getBoundingClientRect().height > 0);
    const before = kids.find((k) => {
      const r = k.getBoundingClientRect();
      return row || /grid/.test(cs.display) && r.width < container.clientWidth * 0.9
        ? (y < r.bottom && x < r.left + r.width / 2) || y < r.top
        : y < r.top + r.height / 2;
    });
    return { container, before: before || null, after: before ? null : kids.at(-1) || null };
  }
  function resolve(m, circles) {
    const c = [m.b.x + m.b.w / 2, m.b.y + m.b.h / 2];
    if (m.type === "circle") return { type: "circle", el: pickElement(m.b), m };
    if (m.type === "box") {
      const el = pickElement(m.b), r = el.getBoundingClientRect();
      const fills = el !== document.body && within({ x: r.left, y: r.top, w: r.width, h: r.height }, m.b) && r.width * r.height > 0.25 * m.b.w * m.b.h;
      if (fills && !m.label) return { type: "circle", el, m };
      let container = blockAt(c[0], c[1]);
      while (container && container.parentElement && !within(m.b, rectOf(container))) container = container.parentElement;
      if (!container || container === document.body) container = document.querySelector("main") || document.body;
      return { type: "add", ...slotIn(container, c[0], c[1]), size: { width: Math.round(m.b.w), height: Math.round(m.b.h) }, label: !!m.label, m };
    }
    if (m.type === "arrow") {
      // What moves: a circled element if the arrow starts in one; otherwise the element at the tail,
      // taken at the level where it sits beside the drop point (so a card moves, not the heading inside it).
      const hit = circles.find(({ m: cm }) => dist(m.from, [cm.b.x + cm.b.w / 2, cm.b.y + cm.b.h / 2]) < Math.max(cm.b.w, cm.b.h) * 0.6);
      const tail = hit ? hit.el : blockAt(m.from[0], m.from[1]);
      if (!tail) return null;
      const drop = blockAt(m.to[0], m.to[1]);
      let el = tail, container = tail.parentElement;
      if (!hit && drop) {
        let a = tail;
        while (a.parentElement && !a.parentElement.contains(drop)) a = a.parentElement;
        const big = (n) => { const r = n.getBoundingClientRect(); return r.width * r.height > 0.5 * innerWidth * innerHeight; };
        if (a.parentElement && a.parentElement !== document.body && !big(a)) { el = a; container = a.parentElement; }
        else { el = itemOf(tail); container = drop.parentElement || el.parentElement; }
      } else if (drop && !el.parentElement.contains(drop)) container = drop.parentElement || container;
      return { type: "move", el, ...slotIn(container, m.to[0], m.to[1]), m };
    }
    if (m.type === "cross") { const el = blockAt(c[0], c[1]); return el && { type: "cross", el, m }; }
    if (m.type === "line") {
      const flat = m.b.h < 0.3 * m.b.w;
      const on = blockAt(c[0], c[1]);
      if (flat && on) {
        const r = on.getBoundingClientRect();
        if (c[1] > r.top + r.height * 0.2 && c[1] < r.bottom - r.height * 0.2) return { type: "strike", el: on, m };
      }
      const above = flat && blockAt(c[0], c[1] - 10);
      if (above) return { type: "underline", el: above, m };
      return { type: "line", el: on || blockAt(m.from[0], m.from[1]), m };
    }
    return { type: "sketch", el: pickElement(m.b), m };
  }
  // The list item an element belongs to: climb until it has look-alike siblings (cards, rows, list items).
  function itemOf(n) {
    for (let i = 0, e = n; e && e.parentElement && i < 5; i++, e = e.parentElement) {
      const alike = [...e.parentElement.children].filter((k) => k.tagName === e.tagName && k.className === e.className);
      if (alike.length > 1) return e;
    }
    return n;
  }
  const rectOf = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const named = (n) => n ? short(n) + (textOf(n) ? ` “${textOf(n).slice(0, 32)}”` : "") : "";
  function describe(g) {
    switch (g.type) {
      case "circle": return `◯ ${named(g.el)}`;
      case "move": return `→ Move ${named(g.el)} ${g.before ? "before " + named(g.before) : "to the end of " + named(g.container)}`;
      case "add": return `□ Add ${g.label ? "your sketched element" : "something"} ${g.before ? "before " + named(g.before) : g.after ? "after " + named(g.after) : "in " + named(g.container)}`;
      case "cross": return `✕ Remove ${named(g.el)}`;
      case "strike": return `✕ Strike ${named(g.el)}`;
      case "underline": return `＿ Emphasise ${named(g.el)}`;
      case "line": return `／ Line near ${named(g.el)}`;
      default: return `✎ Sketch near ${named(g.el)}`;
    }
  }

  // A small picture of the sketch for the agent: the page as outlines + text, with the ink on top.
  function sketchImage(sk, pinAt) {
    // Crop to the ink plus generous context (neighbours matter for "add it here"), at least 720 × 440.
    // Include the elements the marks refer to (e.g. the whole button row), unless they're page-sized.
    let b = sk.bbox;
    for (const g of sk.gestures) for (const n of [g.el, g.container, g.before, g.after]) {
      if (!n || n === document.body) continue;
      const r = rectOf(n);
      if (r.w * r.h > 0.6 * innerWidth * innerHeight) continue;
      const x = Math.min(b.x, r.x), y = Math.min(b.y, r.y);
      b = { x, y, w: Math.max(b.x + b.w, r.x + r.w) - x, h: Math.max(b.y + b.h, r.y + r.h) - y };
    }
    const pad = 60, minW = Math.min(innerWidth, 720), minH = Math.min(innerHeight, 440);
    let x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad);
    let x1 = Math.min(innerWidth, b.x + b.w + pad), y1 = Math.min(innerHeight, b.y + b.h + pad);
    if (x1 - x0 < minW) { const cx = (x0 + x1) / 2; x0 = Math.max(0, Math.min(innerWidth - minW, cx - minW / 2)); x1 = x0 + minW; }
    if (y1 - y0 < minH) { const cy = (y0 + y1) / 2; y0 = Math.max(0, Math.min(innerHeight - minH, cy - minH / 2)); y1 = y0 + minH; }
    const w = x1 - x0, h = y1 - y0, scale = Math.min(1, 1000 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext("2d");
    g.scale(scale, scale); g.translate(-x0, -y0);
    g.fillStyle = "#fff"; g.fillRect(x0, y0, w, h);
    let n = 0;
    for (const el of document.body.querySelectorAll("*")) {
      if (n > 180 || el.closest("[data-pa]") || /^(SCRIPT|STYLE|BR|svg|path)$/.test(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6 || r.right < x0 || r.left > x1 || r.bottom < y0 || r.top > y1) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      n++;
      g.strokeStyle = /^(A|BUTTON|INPUT|IMG|VIDEO|SELECT|TEXTAREA)$/.test(el.tagName) ? "#7a7a7a" : "#d4d4d4";
      g.lineWidth = 1; g.strokeRect(r.left + 0.5, r.top + 0.5, r.width - 1, r.height - 1);
      const own = [...el.childNodes].filter((t) => t.nodeType === 3).map((t) => t.textContent).join(" ").replace(/\s+/g, " ").trim();
      if (own) {
        const fs = Math.max(10, Math.min(18, parseFloat(getComputedStyle(el).fontSize) * 0.6));
        g.fillStyle = "#555"; g.font = `${fs}px sans-serif`;
        g.fillText(own.slice(0, Math.max(4, Math.floor(r.width / (fs * 0.55)))), r.left + 4, r.top + fs + 2, r.width - 6);
      }
    }
    g.strokeStyle = "#e5484d"; g.lineWidth = 3.5; g.lineJoin = g.lineCap = "round";
    for (const s of strokes) { g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    const url = c.toDataURL("image/png");
    if (url.length >= 600000) return null;
    const pin = pinAt && [Math.round((pinAt[0] - x0) * scale), Math.round((pinAt[1] - y0) * scale)];
    return { url, width: c.width, height: c.height, pin };
  }

  // ---------- what did they circle? ----------
  // Element under the circle's centre, widened to the largest ancestor still mostly inside the circle.
  function pickElement(r) {
    let node = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2) || document.body;
    if (node.closest("[data-pa]")) node = document.body;
    const inside = (n) => {
      const b = n.getBoundingClientRect();
      const ix = Math.max(0, Math.min(b.right, r.x + r.w) - Math.max(b.left, r.x));
      const iy = Math.max(0, Math.min(b.bottom, r.y + r.h) - Math.max(b.top, r.y));
      return (ix * iy) / Math.max(1, b.width * b.height);
    };
    while (node.parentElement && node.parentElement !== document.body && inside(node.parentElement) > 0.7) node = node.parentElement;
    return node;
  }
  const short = (n) => n.tagName.toLowerCase() + [...n.classList].slice(0, 3).map((c) => "." + CSS.escape(c)).join("");
  function elementPath(n) {
    const parts = [];
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      if (n.id) { parts.unshift("#" + CSS.escape(n.id)); break; }
      let s = short(n);
      const sib = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(n) + 1})`;
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(" > ");
  }
  function fullPath(n) {
    const parts = [];
    for (; n && n.nodeType === 1; n = n.parentElement) parts.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + [...n.classList].map((c) => "." + c).join(""));
    return parts.join(" > ");
  }
  function reactInfo(n) {
    let key;
    for (let i = 0, node = n; node && i < 5; i++, node = node.parentElement) {
      key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
      if (key) { n = node; break; }
    }
    if (!key) return {};
    const names = [];
    let source = "";
    for (let f = n[key]; f && names.length < 8; f = f.return) {
      const t = f.type;
      const name = t && typeof t !== "string" ? t.displayName || t.name || t.render?.displayName || t.render?.name : null;
      if (name && /^[A-Z]/.test(name) && names[names.length - 1] !== name) names.push(name);
      const s = f._debugSource;
      if (!source && s) source = [s.fileName, s.lineNumber, s.columnNumber].filter((v) => v != null).join(":");
    }
    return { reactComponents: names.reverse().join(" > "), sourceFile: source };
  }
  function sourceAttr(n) {
    for (let i = 0; n && i < 6; i++, n = n.parentElement)
      for (const a of n.attributes || []) if (/^data-(source|loc|component-file|inspector-relative-path)/.test(a.name)) return a.value;
    return "";
  }
  const textOf = (n) => (n.innerText || n.value || "").replace(/\s+/g, " ").trim();
  function isFixed(n) {
    for (; n && n !== document.body; n = n.parentElement) if (/fixed|sticky/.test(getComputedStyle(n).position)) return true;
    return false;
  }

  // Build an AFS v1.1 annotation for the sketch. The primary element fills the standard AFS fields;
  // every mark is described under the `pencil` extension, and AFS `kind` says what the sketch does.
  function buildAnnotation(note, t, r, sk) {
    const cs = getComputedStyle(t);
    const fixed = isFixed(t);
    const ox = fixed ? 0 : scrollX, oy = fixed ? 0 : scrollY;
    const b = t.getBoundingClientRect();
    const react = reactInfo(t);
    const attributes = {};
    for (const a of ["id", "name", "role", "aria-label", "data-testid", "data-test", "href", "type", "alt", "title", "placeholder"]) {
      const v = t.getAttribute(a);
      if (v) attributes[a] = v.slice(0, 200);
    }
    const sibs = [t.previousElementSibling, t.nextElementSibling].filter(Boolean);
    const props = ["color", "background-color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "padding", "margin", "border", "border-radius", "display", "gap", "width", "height"];
    return {
      comment: note,
      elementPath: elementPath(t),
      timestamp: Date.now(),
      x: Math.round(((r.x + r.w / 2) / innerWidth) * 10000) / 100,
      y: Math.round(r.y + r.h / 2 + oy),
      element: t.tagName.toLowerCase(),
      url: location.href,
      boundingBox: { x: Math.round(b.left + ox), y: Math.round(b.top + oy), width: Math.round(b.width), height: Math.round(b.height) },
      reactComponents: react.reactComponents || undefined,
      cssClasses: [...t.classList].join(" ") || undefined,
      computedStyles: props.map((p) => `${p}: ${cs.getPropertyValue(p)}`).join("; "),
      accessibility: [t.getAttribute("role") && `role="${t.getAttribute("role")}"`, ...[...t.attributes].filter((a) => a.name.startsWith("aria-")).map((a) => `${a.name}="${a.value}"`)].filter(Boolean).join(" ") || undefined,
      nearbyText: [textOf(t).slice(0, 300), t.parentElement && textOf(t.parentElement).replace(textOf(t), " … ").trim().slice(0, 300)].filter((s) => s && s !== "…").join(" | ") || undefined,
      selectedText: String(getSelection?.() || "").trim().slice(0, 500) || undefined,
      sourceFile: react.sourceFile || sourceAttr(t) || undefined,
      attributes: Object.keys(attributes).length ? attributes : undefined,
      intent,
      kind: sk.gestures.some((g) => g.type === "move") ? "rearrange" : sk.gestures.some((g) => g.type === "add") ? "placement" : "feedback",
      isFixed: fixed,
      isMultiSelect: new Set(sk.gestures.map((g) => g.el).filter(Boolean)).size > 1,
      fullPath: fullPath(t),
      nearbyElements: sibs.map((s) => `${short(s)} "${textOf(s).slice(0, 60)}"`).join(" | ") || undefined,
      pencil: {
        input: inputType,
        circle: { x: Math.round(r.x + ox), y: Math.round(r.y + oy), width: Math.round(r.w), height: Math.round(r.h) },
        strokes: strokes.slice(0, 12).map((st) => simplify(st.pts, 48).map(([x, y]) => [Math.round(x + ox), Math.round(y + oy)])),
        gestures: sk.gestures.slice(0, 12).map((g) => ({
          type: g.type,
          target: g.el ? { path: elementPath(g.el), text: textOf(g.el).slice(0, 80) } : undefined,
          container: g.container ? { path: elementPath(g.container), text: textOf(g.container).slice(0, 80) } : undefined,
          before: g.before ? { path: elementPath(g.before), text: textOf(g.before).slice(0, 80) } : undefined,
          after: g.after ? { path: elementPath(g.after), text: textOf(g.after).slice(0, 80) } : undefined,
          size: g.size,
          label: g.label || undefined,
          summary: describe(g),
        })),
        // Every note carries a picture of what was marked, its size and the exact point, so the agent can crop
        // around it. Plain circles send it too; the brief marks it optional so it only costs tokens when needed.
        ...(() => {
          const img = sketchImage(sk, [r.x + r.w / 2, r.y + r.h / 2]);
          return img ? { sketch: img.url, sketchSize: { width: img.width, height: img.height }, pin: img.pin } : {};
        })(),
      },
    };
  }
  function simplify(p, max = 96) {
    if (p.length <= max) return p;
    const step = (p.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => p[Math.round(i * step)]);
  }

  // ---------- sessions: one per page URL (hash ignored), following AFS sessions ----------
  const pageKey = () => location.href.split("#")[0];
  let session = null, currentKey = null;
  async function ensureSession() {
    const key = pageKey();
    if (session && currentKey === key) return session;
    let ids = {};
    try { ids = JSON.parse(sessionStorage.getItem("pa-sessions") || "{}"); } catch {}
    if (ids[key]) {
      try { session = await api(`/sessions/${ids[key]}`); currentKey = key; return session; } catch {}
    }
    session = await api("/sessions", { method: "POST", body: { url: key } });
    session.annotations = [];
    ids[key] = session.id;
    try { sessionStorage.setItem("pa-sessions", JSON.stringify(ids)); } catch {}
    currentKey = key;
    return session;
  }


  // ---------- compose & send ----------
  function place(card, r) {
    show(card);
    const h0 = card.offsetHeight || 120, w0 = card.offsetWidth;
    if (innerWidth < 520) { card.style.left = "12px"; card.style.top = "calc(12px + env(safe-area-inset-top))"; return; }
    const below = r.y + r.h + 12;
    card.style.left = Math.min(Math.max(12, r.x), innerWidth - w0 - 12) + "px";
    card.style.top = (below + h0 > innerHeight - 12 ? Math.max(12, r.y - h0 - 12) : below) + "px";
  }
  function openCompose() {
    const lines = sketch.gestures.map(describe);
    const g = sketch.gestures[0];
    const [verb, n0] = g.type === "add" ? (g.after ? ["Add after ", g.after] : g.before ? ["Add before ", g.before] : ["Add in ", g.container])
      : [{ move: "Move ", cross: "Remove ", strike: "Remove ", underline: "Emphasise " }[g.type] || "", g.el || g.container];
    metaTgt.textContent = verb + (n0 ? targetOf({ element: n0.tagName.toLowerCase(), pencil: { gestures: [{ target: { text: textOf(n0).slice(0, 80) } }] } }) : "Sketch") + (lines.length > 1 ? ` +${lines.length - 1}` : "");
    metaTgt.title = lines.join("\n");
    const sketchy = sketch.needsImage || sketch.gestures.some((g) => g.type !== "circle");
    cPill.reset(sketchy ? "Add a note, or just send the sketch" : "Say or type the change");
    cPill.go.classList.toggle("off", !sketchy);
    setIntent("change");
    setQueue(queueMode);
    place(compose, rect);
    toast.style.display = "none"; // the card replaces any hint up top
    ta.focus({ preventScroll: true });
  }
  ta.addEventListener("input", () => cPill.go.classList.toggle("off", !ta.value.trim() && !(sketch && (sketch.needsImage || sketch.gestures.some((g) => g.type !== "circle")))));
  const cancelCompose = () => { abortTalking(cPill); hide(compose); clearStroke(); kbClose(); };
  cancelBtn.onclick = cancelCompose;
  cPill.onEscape = cancelCompose;
  async function sendNote(text) {
    if (!sketch) return;
    // A sketch can speak for itself; a plain circle needs words.
    const note = text || (sketch.needsImage || sketch.gestures.some((g) => g.type !== "circle") ? "Sketch: " + sketch.gestures.map(describe).join("; ") : "");
    if (!note) return ta.focus();
    const ann = buildAnnotation(note, target, rect, sketch);
    if (queueMode) ann.pencil.held = true;
    const before = renderEl(target);
    ann.pencil.snapshot = await snapshotOf(target);
    hide(compose); clearStroke(); kbClose();
    // With a finger, the pen stays on only while marking: turn it off so the page scrolls again.
    if (inputType === "touch" && !stylusSeen) setMode(false);
    try {
      const s = await ensureSession();
      const a = await api(`/sessions/${s.id}/annotations`, { method: "POST", body: ann });
      if (before) try { sessionStorage.setItem("pa-before-" + a.id, before); } catch {}
      upsert(a, true);
      if (queueMode) { const q = queued().length; say(`Queued · ${q} to send`, 2500, a); }
      else say("Sent · waiting for Claude", 2500, a);
    } catch (e) {
      if (e.status === 404) { session = null; say("Session expired, send again", 4000); }
      else say("Couldn't send: " + e.message, 6000);
    }
  }

  // ---------- notes: status, markers on the page, the tray ----------
  const ST = {
    queued: { c: "#C4C4CC", ink: "#121214", label: "Queued" },
    open: { c: "#F5A524", ink: "#2A1A00", label: "Waiting for Claude" },
    working: { c: "#4C6FFF", ink: "#FFFFFF", label: "Claude is on it" },
    question: { c: "#A35BFF", ink: "#FFFFFF", label: "Claude has a question" },
    done: { c: "#2FB67C", ink: "#0B2A1C", label: "Done" },
    closed: { c: "#6E6E78", ink: "#F4F4F5", label: "Closed" },
  };
  const awaiting = (a) => a.status === "acknowledged" && a.thread?.at(-1)?.role === "agent";
  const stateOf = (a) => a.status === "pending" && a.pencil?.held ? "queued" : a.status === "pending" ? "open" : a.status === "resolved" ? "done" : a.status === "dismissed" ? "closed" : awaiting(a) ? "question" : "working";
  const isOpen = (a) => !["done", "closed"].includes(stateOf(a));
  const KIND = { button: "Button", a: "Link", img: "Image", svg: "Icon", input: "Field", textarea: "Field", select: "Menu", p: "Text", span: "Text", li: "Item", ul: "List", ol: "List", nav: "Nav", header: "Header", footer: "Footer", section: "Section", article: "Card", form: "Form", label: "Label", video: "Video" };
  const targetOf = (a) => {
    const t = (a.pencil?.gestures?.[0]?.target?.text || a.attributes?.["aria-label"] || a.attributes?.alt || "").replace(/\s+/g, " ").trim();
    const k = /^h[1-6]$/.test(a.element) ? "Heading" : KIND[a.element] || "Section";
    return t ? `${k} “${t.length > 28 ? t.slice(0, 27) + "…" : t}”` : k;
  };
  const dotFor = (a, large) => {
    const s = ST[stateOf(a)];
    return h("span", { className: "pa-dot" + (large ? " l" : ""), style: `--c:${s.c};--ink:${s.ink}`, html: stateOf(a) === "done" ? ICON.check : null, textContent: stateOf(a) === "done" ? null : String(a.pencil?.number ?? "•") });
  };

  const notes = new Map(); // id → { a, el, outline, marker, flashUntil }
  const deleting = new Map(); // id → timer, for undo
  let hideMarkers = sessionStorage.getItem("pa-hide") === "1";
  let listOpen = false, listTab = "open", confirmId = null;
  const visible = () => [...notes.values()].filter((n) => !deleting.has(n.a.id)).sort((x, y) => (x.a.pencil?.number ?? 0) - (y.a.pencil?.number ?? 0));

  function upsert(a, quiet) {
    let n = notes.get(a.id);
    const prev = n?.a;
    if (!n) notes.set(a.id, (n = { a }));
    n.a = a;
    if (prev && isOpen(prev) && !isOpen(a)) {
      n.flashUntil = Date.now() + 20000;
      try { sessionStorage.setItem("pa-flash-" + a.id, String(n.flashUntil)); } catch {}
    }
    if (!prev) n.flashUntil = Number(sessionStorage.getItem("pa-flash-" + a.id)) || 0; // survives the hot reload
    if (prev && !quiet) announce(a, prev);
    renderAll();
  }
  function drop(id) {
    const n = notes.get(id);
    if (!n) return;
    n.outline?.remove(); n.marker?.remove();
    notes.delete(id);
    if (detail.dataset.id === id) hide(detail);
    renderAll();
  }
  function announce(a, prev) {
    const s = stateOf(a), was = stateOf(prev), last = a.thread?.at(-1);
    if (s === "working" && was !== "working") say("Working · finding it in your code", 3000, a);
    if (s === "question" && (was !== "question" || prev.thread?.length !== a.thread?.length)) { say("Claude: " + last.content, 8000, a); openNote(a.id); }
    if (s === "done" && was !== "done") {
      say("Done · " + (last?.role === "agent" ? last.content : "resolved"), 6000, a);
      if (RELOAD) setTimeout(() => location.reload(), 1200);
    }
  }

  // Where a note lives on the page: its element if it's still there, else where it was.
  function findEl(n) {
    if (n.el?.isConnected) return n.el;
    for (const sel of [n.a.elementPath, n.a.fullPath]) {
      try { const e = sel && document.querySelector(sel); if (e) return (n.el = e); } catch {}
    }
    return null;
  }
  function boxOf(n) {
    const e = findEl(n), fixed = !!n.a.isFixed;
    if (e) {
      const r = e.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + (fixed ? 0 : scrollX), y: r.top + (fixed ? 0 : scrollY), w: r.width, h: r.height, fixed };
    }
    const b = n.a.boundingBox;
    return b ? { x: b.x, y: b.y, w: b.width, h: b.height, fixed } : null;
  }
  const toViewport = (b) => ({ x: b.x - (b.fixed ? 0 : scrollX), y: b.y - (b.fixed ? 0 : scrollY), w: b.w, h: b.h });

  function renderMarkers() {
    document.documentElement.classList.toggle("pa-hide", hideMarkers);
    const now = Date.now();
    for (const n of notes.values()) {
      const s = stateOf(n.a);
      const want = !deleting.has(n.a.id) && (isOpen(n.a) || n.flashUntil > now);
      const b = want && boxOf(n);
      if (!b) { n.outline?.remove(); n.marker?.remove(); n.outline = n.marker = null; continue; }
      const st = ST[s];
      if (!n.outline) {
        n.outline = el("div", { className: "pa-outline" });
        n.marker = el("button", { className: "pa-ui pa-glass pa-marker", onclick: () => openNote(n.a.id) });
      }
      const pos = b.fixed ? "fixed" : "absolute";
      Object.assign(n.outline.style, { position: pos, left: b.x - 4 + "px", top: b.y - 4 + "px", width: b.w + 8 + "px", height: b.h + 8 + "px" });
      n.outline.style.setProperty("--c", st.c);
      n.outline.classList.toggle("solid", !isOpen(n.a));
      const answer = !isOpen(n.a) && n.a.thread?.findLast?.((m) => m.role === "agent")?.content;
      const label = (answer || n.a.comment.replace(/^Sketch: /, "")).replace(/\s+/g, " ");
      n.marker.replaceChildren(dotFor(n.a), h("span", { className: "pa-l", textContent: label }));
      n.marker.className = "pa-ui pa-glass pa-marker " + s;
      n.marker.setAttribute("aria-label", `Note ${n.a.pencil?.number}: ${label} (${st.label})`);
      const maxX = (b.fixed ? 0 : scrollX) + innerWidth - 240;
      Object.assign(n.marker.style, { position: pos, left: Math.max(4, Math.min(b.x + 6, maxX)) + "px", top: Math.max(b.fixed ? 18 : 18, b.y - 4) + "px" });
    }
  }
  setInterval(() => { if (notes.size) renderMarkers(); }, 1000); // follow layout changes and hot reloads
  addEventListener("resize", () => notes.size && renderMarkers());

  // The tray: "3 notes · 1 working", hide markers, open the list.
  const tray = el("div", { id: "pa-tray", className: "pa-ui pa-glass" });
  const list = el("div", { id: "pa-list", className: "pa-ui pa-glass" });
  const eyeBtn = () => h("button", { className: "pa-ib", "aria-label": hideMarkers ? "Show note markers" : "Hide note markers", "aria-pressed": String(hideMarkers), html: hideMarkers ? ICON.eyeOff : ICON.eye, onclick: () => { hideMarkers = !hideMarkers; sessionStorage.setItem("pa-hide", hideMarkers ? "1" : "0"); renderAll(); } });
  function renderTray() {
    const all = visible();
    if (!all.length) { hide(tray); hide(list); listOpen = false; return; }
    const count = (s) => all.filter((n) => stateOf(n.a) === s).length;
    const open = all.filter((n) => isOpen(n.a)).length;
    const sub = count("question") ? `· ${count("question")} question${count("question") > 1 ? "s" : ""}` : count("working") ? `· ${count("working")} working` : open ? `· ${open} waiting` : "· all done";
    const dots = h("span", { className: "pa-dots", "aria-hidden": "true" }, ...["queued", "open", "working", "question", "done"].filter(count).map((s) => h("i", { style: `--c:${ST[s].c}` })));
    const q = count("queued");
    const sendBtn = q && h("button", { className: "pa-qb send", textContent: `Send ${q}`, "aria-label": `Send ${q} queued note${q > 1 ? "s" : ""}`, onclick: sendQueue });
    tray.replaceChildren(dots, h("span", { textContent: `${all.length} note${all.length > 1 ? "s" : ""}` }), h("span", { className: "pa-mut", textContent: q ? `· ${q} queued` : sub }),
      sendBtn, eyeBtn(), h("button", { className: "pa-ib hi", "aria-label": "Show all notes", html: ICON.up, onclick: () => { listOpen = true; renderAll(); } }));
    if (!listOpen) { tray.style.display = "flex"; hide(list); return; }
    hide(tray);
    const done = all.filter((n) => !isOpen(n.a)), opened = all.filter((n) => isOpen(n.a));
    const rows = listTab === "open" ? opened : done;
    const tab = (k, label) => h("button", { className: "pa-tab" + (listTab === k ? " on" : ""), "aria-pressed": String(listTab === k), textContent: label, onclick: () => { listTab = k; confirmId = null; renderAll(); } });
    list.replaceChildren(
      h("div", { className: "pa-lh" }, h("b", { textContent: "Notes" }), tab("open", `Open ${opened.length}`), h("span", { className: "pa-mut", textContent: "·", "aria-hidden": "true" }), tab("done", `Done ${done.length}`),
        h("span", { style: "flex:1" }), count("queued") && h("button", { className: "pa-qb send", textContent: `Send ${count("queued")}`, onclick: sendQueue }), eyeBtn(), h("button", { className: "pa-ib hi", "aria-label": "Collapse notes", html: ICON.down, onclick: () => { listOpen = false; confirmId = null; renderAll(); } })),
      h("div", { className: "pa-rows" }, rows.length ? rows.map((n) => noteRow(n.a)) : h("div", { className: "pa-empty", textContent: listTab === "open" ? "Nothing open. Circle something to add a note." : "Nothing finished yet." })));
    list.style.display = "flex";
  }
  function noteRow(a) {
    const s = stateOf(a), n = a.pencil?.number;
    if (confirmId === a.id) {
      return h("div", { className: "pa-row" }, dotFor(a), h("span", { className: "pa-ask", textContent: `Delete note ${n}?` }),
        h("button", { className: "pa-qb", textContent: "Keep", onclick: () => { confirmId = null; renderAll(); } }),
        h("button", { className: "pa-qb danger", textContent: "Delete", onclick: () => { confirmId = null; remove(a.id); } }));
    }
    const del = h("button", { className: "pa-ib", "aria-label": `Delete note ${n}`, html: ICON.trash, onclick: () => { confirmId = a.id; renderAll(); } });
    const acts = isOpen(a)
      ? [h("button", { className: "pa-ib", "aria-label": `Close note ${n}`, title: "Close (keeps it in Done)", html: ICON.close, onclick: () => setStatus(a.id, "dismissed") }), del]
      : [h("button", { className: "pa-qb", html: ICON.reopen, onclick: () => setStatus(a.id, "pending") }, "Reopen"), del];
    return h("div", { className: "pa-row " + s }, dotFor(a),
      h("div", { className: "pa-rt", role: "button", tabindex: "0", onclick: () => focusNote(a.id), onkeydown: (e) => e.key === "Enter" && focusNote(a.id) },
        h("span", { textContent: a.comment.replace(/^Sketch: /, "") }), h("span", { textContent: `${targetOf(a)} · ${ST[s].label}` })),
      ...acts);
  }
  const queued = () => visible().filter((n) => stateOf(n.a) === "queued");
  async function sendQueue() {
    try {
      const s = await ensureSession();
      const { sent } = await api(`/sessions/${s.id}/send`, { method: "POST", body: {} });
      say(`Sent ${sent} note${sent === 1 ? "" : "s"} · waiting for Claude`, 2500);
    } catch (e) { say("Couldn't send: " + e.message, 6000); }
  }
  function renderAll() {
    renderMarkers();
    renderTray();
    const n = detail.dataset.id && notes.get(detail.dataset.id);
    if (detail.style.display === "block") n && !deleting.has(n.a.id) ? renderNote(n.a) : hide(detail);
  }

  // ---------- one note ----------
  function focusNote(id) {
    const n = notes.get(id);
    if (!n) return;
    listOpen = false; renderAll();
    const e = findEl(n);
    if (e) e.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => openNote(id), e ? 380 : 0);
  }
  function openNote(id) {
    const n = notes.get(id);
    if (!n) return;
    if (detail.dataset.id !== id) nPill.reset();
    detail.dataset.id = id;
    confirmId = null;
    renderNote(n.a);
    const m = n.marker?.isConnected && n.marker.getBoundingClientRect();
    const b = boxOf(n);
    place(detail, m ? { x: m.left, y: m.top, w: m.width, h: m.height } : b ? toViewport(b) : { x: innerWidth / 2 - 200, y: 80, w: 0, h: 0 });
  }
  function renderNote(a) {
    const s = stateOf(a), n = a.pencil?.number;
    nHead.replaceChildren(dotFor(a), h("span", { className: "pa-tgt", textContent: `${targetOf(a)} · ${ST[s].label}` }),
      h("button", { className: "pa-ib", "aria-label": "Close card", html: ICON.x, onclick: () => hide(detail) }));
    const scrolled = nBody.scrollTop + nBody.clientHeight >= nBody.scrollHeight - 4;
    nBody.replaceChildren(h("p", { textContent: a.comment }),
      ...(a.thread || []).map((m) => h("div", { className: "pa-msg " + m.role }, m.role === "agent" ? h("small", { textContent: "Claude" }) : null, m.content)));
    const cmp = !isOpen(a) && compareFor(a);
    if (cmp) nBody.append(cmp);
    if (scrolled) nBody.scrollTop = nBody.scrollHeight;
    nPill.ta.placeholder = s === "question" ? "Answer Claude" : isOpen(a) ? "Add to this note" : "Not quite? Reply to reopen";
    if (confirmId === a.id) {
      nAct.replaceChildren(h("span", { className: "pa-ask", textContent: `Delete note ${n}? It's gone for good.` }),
        h("button", { className: "pa-qb", textContent: "Keep", onclick: () => { confirmId = null; renderNote(a); } }),
        h("button", { className: "pa-qb danger", textContent: "Delete", onclick: () => { confirmId = null; remove(a.id); } }));
      return;
    }
    nAct.replaceChildren(h("span", { style: "flex:1" }),
      isOpen(a)
        ? h("button", { className: "pa-qb", title: "Close: done with it, history kept", html: ICON.close, onclick: () => setStatus(a.id, "dismissed") }, "Close")
        : h("button", { className: "pa-qb hi", html: ICON.reopen, onclick: () => setStatus(a.id, "pending") }, "Reopen"),
      h("button", { className: "pa-ib", "aria-label": `Delete note ${n}`, html: ICON.trash, onclick: () => { confirmId = a.id; renderNote(a); } }));
  }
  nPill.onEscape = () => hide(detail);
  async function reply(content) {
    const id = detail.dataset.id;
    if (!content) return nPill.ta.focus();
    try { await api(`/annotations/${id}/thread`, { method: "POST", body: { content } }); nPill.reset(); refreshOne(id); }
    catch (e) { say("Couldn't reply: " + e.message, 6000); }
  }
  async function setStatus(id, status) {
    try { upsert(await api(`/annotations/${id}`, { method: "PATCH", body: { status } }), true); }
    catch (e) { say("✗ " + e.message, 6000); }
  }
  // Delete waits 5 seconds so it can be undone. An open note is closed right away so the agent leaves it alone.
  function remove(id) {
    const n = notes.get(id);
    if (!n) return;
    const wasPending = n.a.status === "pending";
    if (wasPending) api(`/annotations/${id}`, { method: "PATCH", body: { status: "dismissed" } }).catch(() => {});
    const commit = () => { deleting.delete(id); api(`/annotations/${id}`, { method: "DELETE" }).then(() => drop(id)).catch((e) => say("✗ " + e.message, 6000)); };
    deleting.set(id, { timer: setTimeout(commit, 5000), commit });
    hide(detail);
    renderAll();
    say(`Note ${n.a.pencil?.number} deleted`, 5000, null, ["Undo", () => {
      const d = deleting.get(id);
      if (!d) return;
      clearTimeout(d.timer); deleting.delete(id);
      if (wasPending) setStatus(id, "pending"); else renderAll();
      hide(toast);
    }]);
  }
  addEventListener("pagehide", () => {
    for (const [id, d] of deleting) { clearTimeout(d.timer); fetch(`${SERVER}/annotations/${id}`, { method: "DELETE", headers: auth, keepalive: true }).catch(() => {}); }
  });

  // ---------- live updates: SSE (AFS event envelope) over fetch, so the token stays in a header ----------
  let lastEventId = null, streamAbort = null, streamFails = 0;
  async function stream(sessionId) {
    streamAbort?.abort();
    const ctl = (streamAbort = new AbortController());
    try {
      const r = await fetch(`${SERVER}/sessions/${sessionId}/events`, { headers: { ...auth, ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}) }, signal: ctl.signal });
      if (!r.ok || !r.body) throw new Error("stream " + r.status);
      streamFails = 0;
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
          const id = block.match(/^id: ?(.+)$/m)?.[1];
          if (id) lastEventId = id;
          if (data) try { onEvent(JSON.parse(data)); } catch {}
        }
      }
    } catch (e) {
      if (ctl.signal.aborted) return;
      streamFails++;
    }
    if (!ctl.signal.aborted) setTimeout(() => stream(sessionId), Math.min(15000, 1000 * 2 ** streamFails));
  }
  function onEvent(ev) {
    const p = ev.payload;
    if (ev.type === "annotation.created" || ev.type === "annotation.updated") upsert(p);
    else if (ev.type === "annotation.deleted") drop(p.id);
    else if (ev.type === "thread.message") refreshOne(p.annotationId);
  }
  async function refreshOne(id) { try { upsert(await api(`/annotations/${id}`)); } catch {} }
  async function refresh() {
    if (!session) return;
    try { const s = await api(`/sessions/${session.id}`); for (const a of s.annotations) upsert(a); } catch {}
  }
  // Safety net if a proxy buffers the stream: a slow poll while anything is open.
  setInterval(() => { if (streamFails > 2 && [...notes.values()].some((n) => isOpen(n.a))) refresh(); }, 3000);

  async function start() {
    try {
      await ensureSession();
      lastEventId = null;
      for (const id of [...notes.keys()]) drop(id);
      for (const a of session.annotations || []) upsert(a, true);
      stream(session.id);
    } catch (e) { say("Pencil Agent: " + e.message, 6000); }
  }
  start();
  // Client-side navigation: switch sessions when the page URL changes.
  setInterval(() => { if (currentKey && pageKey() !== currentKey) start(); }, 1000);

  // ---------- voice: tap the mic, talk, tap again. The mic level drives a dither; whisper.cpp on your machine transcribes ----------
  api("/config").then((cfg) => {
    if (!cfg.transcribe || !window.isSecureContext || !navigator.mediaDevices || !window.MediaRecorder) return;
    for (const p of pills) p.mic.hidden = false;
  }).catch(() => {});

  let audioCtx = null;
  async function startTalking(p) {
    if (p.rec || p.busy) return;
    // Create/resume audio inside the tap, before any await, or Safari keeps it suspended.
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !audioCtx) audioCtx = new AC();
    audioCtx?.resume?.();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      let src = null, stopDraw = () => {};
      if (audioCtx) {
        src = audioCtx.createMediaStreamSource(stream);
        const an = audioCtx.createAnalyser();
        an.fftSize = 512; an.smoothingTimeConstant = 0.55; an.minDecibels = -85; an.maxDecibels = -25;
        const mute = audioCtx.createGain(); mute.gain.value = 0; // some Safari versions only run analysers wired to the output
        src.connect(an); an.connect(mute); mute.connect(audioCtx.destination);
        stopDraw = dither(p.cv, an, audioCtx.sampleRate);
      }
      p.rec = { rec, stream, chunks, src, stopDraw };
      rec.start();
      p.root.classList.add("rec"); p.mic.classList.add("rec");
      p.mic.setAttribute("aria-label", "Stop talking");
      p.ta.placeholder = "Listening…";
    } catch (err) { say("Mic: " + err.message, 5000); }
  }
  function endRecording(p) {
    const r = p.rec;
    p.rec = null;
    r.stopDraw(); r.src?.disconnect();
    p.root.classList.remove("rec"); p.mic.classList.remove("rec");
    p.mic.setAttribute("aria-label", "Start talking");
    return r;
  }
  // Stop and transcribe. Resolves once the words are in the field, so Send can wait for them.
  function stopTalking(p) {
    if (p.busy) return p.busy;
    if (!p.rec) return Promise.resolve();
    const r = endRecording(p);
    p.busy = new Promise((done) => {
      r.rec.onstop = async () => {
        r.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(r.chunks, { type: r.rec.mimeType || "audio/mp4" });
        p.ta.placeholder = "Transcribing…"; p.mic.classList.add("busy");
        try {
          const { text } = await api("/transcribe", { method: "POST", body: blob, headers: { "Content-Type": blob.type } });
          if (text) { p.ta.value = (p.ta.value ? p.ta.value.trimEnd() + " " : "") + text.trim(); p.grow(); p.ta.dispatchEvent(new Event("input")); }
        } catch (err) { say("Couldn't transcribe: " + err.message, 5000); }
        p.mic.classList.remove("busy"); p.ta.placeholder = p.placeholder;
        p.busy = null;
        done();
      };
      if (r.rec.state === "recording") r.rec.stop(); else r.rec.onstop();
    });
    return p.busy;
  }
  function abortTalking(p) {
    if (!p.rec) return;
    const r = endRecording(p);
    r.rec.onstop = () => r.stream.getTracks().forEach((t) => t.stop());
    if (r.rec.state === "recording") r.rec.stop(); else r.rec.onstop();
    p.ta.placeholder = p.placeholder;
  }

  // Ordered (Bayer 4×4) dither of the live spectrum: low voice frequencies in the middle, highs toward the edges.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const SPECTRUM = [[245, 165, 36], [242, 84, 125], [163, 91, 255], [76, 141, 255], [47, 211, 199], [242, 84, 125]];
  const palAt = (u) => {
    const n = SPECTRUM.length - 1, x = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(x), f = x - i, a = SPECTRUM[i], b = SPECTRUM[i + 1];
    return `${(a[0] + (b[0] - a[0]) * f) | 0},${(a[1] + (b[1] - a[1]) * f) | 0},${(a[2] + (b[2] - a[2]) * f) | 0}`;
  };
  function dither(cv, an, rate) {
    const g = cv.getContext("2d"), cell = 4, bins = new Uint8Array(an.frequencyBinCount);
    const hz = rate / an.fftSize, lo = Math.max(1, Math.round(90 / hz)), hi = Math.min(bins.length - 1, Math.round(4000 / hz));
    let raf = 0, cols = [], t0 = performance.now();
    const tick = () => {
      const w = cv.clientWidth, h0 = cv.clientHeight, dpr = devicePixelRatio || 1;
      if (w && h0) {
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h0 * dpr); }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h0);
        an.getByteFrequencyData(bins);
        const t = (performance.now() - t0) / 1000, nc = Math.floor(w / cell), nr = Math.floor(h0 / cell);
        if (cols.length !== nc) cols = new Array(nc).fill(0);
        for (let x = 0; x < nc; x++) {
          const u = x / nc, d = Math.abs(u - 0.5) * 2;
          const target = bins[Math.round(lo + (hi - lo) * Math.pow(d, 1.6))] / 255;
          cols[x] += (target - cols[x]) * (target > cols[x] ? 0.5 : 0.18);
          const e = cols[x] * (0.55 + 0.45 * Math.exp(-Math.pow(d / 0.7, 2))) + 0.05 * (0.5 + 0.5 * Math.sin(u * 40 + t * 2));
          const rgb = palAt(u);
          for (let y = 0; y < nr; y++) {
            const v = e * 1.55 - ((nr - 1 - y) / nr) * 1.05 + 0.04 * Math.sin(x * 1.7 + y * 2.3 + t * 4);
            if (v <= 0 || v < (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) continue;
            g.fillStyle = `rgba(${rgb},${Math.min(1, 0.35 + v)})`;
            g.fillRect(x * cell, y * cell, cell - 1, cell - 1);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); g.clearRect(0, 0, cv.width, cv.height); };
  }

  // ---------- snapshot & before/after ----------
  // The exact HTML of what was marked, and a hash of it and of the page, so the agent fixes the version you saw.
  async function snapshotOf(t) {
    try {
      const html = t.outerHTML.slice(0, 60000);
      const page = document.documentElement.cloneNode(true);
      page.querySelectorAll("[data-pa], #pa-style").forEach((n) => n.remove());
      return { html, page: await sha256(page.outerHTML) };
    } catch { return undefined; }
  }
  async function sha256(text) {
    try {
      const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch { return undefined; } // plain-HTTP pages have no crypto.subtle; the server hashes the element anyway
  }
  // A picture of an element, drawn by the browser from a copy of its DOM with computed styles inlined.
  // Before and after use the same renderer, so the comparison is fair even where web fonts or images don't carry over.
  const SNAP_PROPS = ["display", "box-sizing", "width", "height", "min-height", "margin", "padding", "border", "border-radius",
    "background-color", "background-image", "color", "font-family", "font-size", "font-weight", "font-style", "line-height",
    "letter-spacing", "text-align", "text-transform", "text-decoration", "white-space", "flex-direction", "flex-wrap",
    "justify-content", "align-items", "gap", "grid-template-columns", "grid-template-rows", "opacity", "box-shadow",
    "overflow", "object-fit", "vertical-align", "list-style", "position", "top", "right", "bottom", "left", "transform"];
  function renderEl(el) {
    try {
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.width * r.height > 3e6) return null;
      const clone = el.cloneNode(true);
      let count = 0;
      (function walk(src, dst) {
        if (src.nodeType !== 1 || ++count > 800) return;
        const cs = getComputedStyle(src);
        dst.setAttribute("style", SNAP_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
        for (let i = 0; i < src.children.length; i++) walk(src.children[i], dst.children[i]);
      })(el, clone);
      clone.style.margin = "0"; clone.style.position = "static"; clone.style.transform = "none";
      clone.querySelectorAll("script, [data-pa]").forEach((n) => n.remove());
      const w = Math.ceil(r.width), hgt = Math.ceil(r.height);
      const bg = getComputedStyle(document.body).backgroundColor || "#fff";
      const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${hgt}px;background:${bg};overflow:hidden">${new XMLSerializer().serializeToString(clone)}</div></foreignObject></svg>`;
      return svgText.length < 1.2e6 ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText) : null;
    } catch { return null; }
  }
  // Drag to compare: the element as you marked it, against how it looks now.
  const compares = new Map();
  function compareFor(a) {
    let before = null;
    try { before = sessionStorage.getItem("pa-before-" + a.id); } catch {}
    if (!before) return null;
    if (compares.has(a.id)) return compares.get(a.id);
    const n = notes.get(a.id), after = n && renderEl(findEl(n));
    if (!after) return null;
    const imgB = h("img", { src: before, alt: "Before" }), imgA = h("img", { className: "a", src: after, alt: "After" });
    const box = h("div", { className: "pa-cmp", role: "slider", tabindex: "0", "aria-label": "Drag to compare before and after", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50" },
      imgB, imgA, h("i", { "aria-hidden": "true" }), h("b", { className: "l", textContent: "Before" }), h("b", { className: "r", textContent: "After" }));
    const set = (pct) => { pct = Math.max(0, Math.min(100, pct)); box.style.setProperty("--p", pct + "%"); box.setAttribute("aria-valuenow", String(Math.round(pct))); };
    const at = (e) => { const b = box.getBoundingClientRect(); set(((e.clientX - b.left) / b.width) * 100); };
    box.addEventListener("pointerdown", (e) => { box.setPointerCapture(e.pointerId); at(e); e.preventDefault(); });
    box.addEventListener("pointermove", (e) => { if (box.hasPointerCapture(e.pointerId)) at(e); });
    box.addEventListener("keydown", (e) => {
      const v = Number(box.getAttribute("aria-valuenow"));
      if (e.key === "ArrowLeft") { set(v - 5); e.preventDefault(); }
      if (e.key === "ArrowRight") { set(v + 5); e.preventDefault(); }
    });
    set(50);
    compares.set(a.id, box);
    return box;
  }

  // ---------- bits ----------
  function show(n) { n.style.display = "block"; }
  function hide(n) { n.style.display = "none"; }
  let toastT;
  // A status pill at the top: optional note dot, a line of text, an optional action.
  function say(msg, ms, a, action) {
    toast.replaceChildren(...[a && dotFor(a, true), h("span", { className: "pa-tt", textContent: msg }),
      action && h("button", { textContent: action[0], onclick: action[1] })].filter(Boolean));
    toast.classList.toggle("has-dot", !!a);
    toast.style.display = "flex";
    clearTimeout(toastT);
    toastT = setTimeout(() => hide(toast), ms || 3000);
  }
  resize();
})();
