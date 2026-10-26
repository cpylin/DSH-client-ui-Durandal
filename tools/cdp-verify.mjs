#!/usr/bin/env node
/**
 * Drive the running DeepSeek Harness window over CDP and check the parts of this skin that
 * verify.mjs structurally CANNOT check.
 *
 * Why this exists: verify.mjs evaluates the bundle in a fake DOM. That catches a broken
 * stylesheet, a bad token pair and a dead selector, but it never renders the app, so it has no
 * opinion about whether the hero empty state is actually gone, whether the composer really
 * ended up at the bottom, or whether the artwork actually got brighter. Three of the four
 * things this skin was last changed for are geometry, and geometry needs a real layout engine.
 *
 * Usage (the app must be RUNNING with --remote-debugging-port):
 *   node tools/cdp-verify.mjs --shots art/_cdp
 *
 * The app is single-instance, so a second launch without the flag just focuses the first one
 * and this script will find no debuggable target. Quit the app first, then:
 *   "<folder you installed DeepSeek Harness into>/DeepSeek Harness.exe" --remote-debugging-port=9222
 * One more trap: Page.captureScreenshot HANGS (does not throw) while the app has no window -
 * if the window was closed and the app is still running in the background, relaunch it first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.DSH_CDP_PORT || "9222";
const BASE = `http://127.0.0.1:${PORT}`;

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const shotsDir = path.resolve(root, argOf("shots", "art/_cdp"));
const VIEW = { width: Number(argOf("width", 1280)), height: Number(argOf("height", 800)) };

let checks = 0, failures = 0;
const ok = (name, pass, detail) => {
  checks++;
  if (pass) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ transport */

async function pickPage() {
  let list;
  try { list = await (await fetch(`${BASE}/json/list`)).json(); }
  catch (err) { throw new Error(`cannot reach ${BASE} - is the app running with --remote-debugging-port=${PORT}?`); }
  const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) throw new Error(`no page target at ${BASE} (found ${list.length} target(s))`);
  return page;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let seq = 0;
    const send = (method, params = {}) => new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.onopen = () => resolve(send);
    ws.onerror = () => reject(new Error("websocket failed to open"));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (!m.id || !pending.has(m.id)) return;
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(`${m.error.message} (${JSON.stringify(m.error.data ?? "")})`));
      else res(m.result);
    };
  });
}

/* ------------------------------------------------------------------ driver */

const main = async () => {
  fs.mkdirSync(shotsDir, { recursive: true });
  const page = await pickPage();
  const send = await connect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");

  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result?.value;
  };
  const shot = async (name, clip) => {
    const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    const file = path.join(shotsDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  };

  console.log(`CDP target: ${page.title || page.url}`);
  // Escape hatch: ask the running app a question without running the whole check. Used to read
  // a real element's rect instead of guessing one off a screenshot - a guessed box is how a
  // sample ends up half on a line of text and reports a number that means nothing.
  const evalOnly = argOf("eval", null);
  if (evalOnly) {
    console.log(JSON.stringify(await ev(evalOnly), null, 2));
    process.exit(0);
  }
  // A fixed surface, because background-size:cover + background-position:58% center move the
  // artwork with the viewport - without this, two screenshots of "the same" region are not
  // the same pixels and every brightness comparison would be measuring the resize.
  await send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 1, mobile: false });
  await sleep(400);

  const skinApi = await ev("typeof window.durandalSkin");
  if (skinApi !== "object") {
    console.log(`\n  window.durandalSkin is ${skinApi} - the skin is not loaded. Nothing to check.`);
    process.exit(2);
  }
  const scheme = await ev('document.documentElement.getAttribute("data-sk-scheme")');
  console.log(`scheme: ${scheme} | viewport: ${VIEW.width}x${VIEW.height}`);

  // Deterministic preferences: veil 0 is the state all the brightness claims are about.
  await ev('window.durandalSkin.set("veil", 0); window.durandalSkin.set("blur", 0); "ok"');
  await sleep(500);

  /* ---------------------------------------------------------------- the films */
  // The three films were removed in the source, so the "before" state is reconstructed here by
  // writing the OLD values back as inline properties. That is exact rather than approximate:
  // all three were constants at veil 0, and the presenter writes the same two custom
  // properties as inline styles on <body>, so a later inline write simply wins.
  // The veil constant lives inside html::after's calc(), so it is reproduced by solving for the
  // --sk-veil-a that yields the old constant (the slider term is linear).
  section("A. what each film was costing the artwork");
  const OLD = {
    dark: { frame: "rgba(16,22,38,0.30)", table: "rgba(11,17,32,0.08)", veilA: 0.05 / 1.15 },
    light: { frame: "rgba(255,255,255,0.26)", table: "rgba(249,251,255,0.08)", veilA: 0.12 / 0.95 },
  }[scheme] || null;

  if (!OLD) {
    console.log(`  (unknown scheme ${scheme}; skipping the film price-out)`);
  } else {
    // The baseline is whatever the RUNNING build has right now, read back rather than assumed,
    // so restoring is exact.
    //
    // NOT removeProperty: these are inline custom properties written by the app's own token
    // presenter, so removing one leaves the variable UNDEFINED and every var() that referenced
    // it resolves to an opaque app default - which hides the artwork outright. The first
    // version of this script did exactly that and cheerfully reported the films as BRIGHTENING
    // the art, because deleting them was what turned the art off. The numbers were inverted,
    // not subtle, and the fix is to set the PREVIOUS value back instead of deleting.
    const base = await ev(`(() => { const b = document.body.style, h = document.documentElement.style; return {
      frame: b.getPropertyValue("--dsw-specific-sidebar-fill"),
      table: b.getPropertyValue("--dsw-alias-bg-base"),
      veilA: h.getPropertyValue("--sk-veil-a"),
    }; })()`);
    console.log(`  baseline tokens: frame='${base.frame}' table='${base.table}' veilA='${base.veilA}'`);
    ok("the running build's film tokens were read back before being disturbed",
      !!base.frame && !!base.table, JSON.stringify(base));

    // Written out longhand rather than cleverly, so each state is auditable in the source.
    const apply = async ({ frame, table, veil }) => ev(`(() => {
      const b = document.body.style, h = document.documentElement.style;
      const old = ${JSON.stringify(OLD)}, cur = ${JSON.stringify(base)};
      b.setProperty("--dsw-specific-sidebar-fill", ${frame ? "old.frame" : "cur.frame"});
      b.setProperty("--dsw-alias-bg-base", ${table ? "old.table" : "cur.table"});
      h.setProperty("--sk-veil-a", ${veil ? "String(old.veilA)" : "cur.veilA"});
      return "ok";
    })()`);

    // The artwork region is taken from the app's own conversation column, and the sidebar strip
    // is sampled as a control: it is painted by --sk-panel, which none of these three touches,
    // so it must NOT move. A sidebar that brightens means the edit broke the panel rather than
    // lifting a film.
    const boxes = await ev(`(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null;
        const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      return { column: r('[class*="_centerCol"]'), sidebar: r('[class*="_sidebarCol"]') };
    })()`);
    fs.writeFileSync(path.join(shotsDir, "boxes.json"), JSON.stringify({ view: VIEW, boxes }, null, 2));
    console.log(`  boxes: column ${boxes.column ? `${Math.round(boxes.column.width)}x${Math.round(boxes.column.height)}` : "NOT FOUND"}, sidebar ${boxes.sidebar ? `${Math.round(boxes.sidebar.width)}x${Math.round(boxes.sidebar.height)}` : "NOT FOUND"}`);
    ok("the conversation column was found (the sampler needs it as an anchor)", !!boxes.column && boxes.column.width > 100);

    const states = [
      ["before-all-three", { frame: true, table: true, veil: true }],
      ["before-no-frame", { frame: false, table: true, veil: true }],
      ["before-no-table", { frame: false, table: false, veil: true }],
      ["after", { frame: false, table: false, veil: false }],
    ];
    for (const [name, on] of states) {
      await apply(on);
      await sleep(350);
      await shot(name);
      console.log(`  shot  ${name}.png`);
    }
    await apply({ frame: false, table: false, veil: false });
    await sleep(300);
    console.log(`  prices -> tools/sample-pixels.py ${path.relative(root, shotsDir)}/*.png`);
  }

  /* ------------------------------------------------------- the empty state */
  section("B. the empty conversation (hero phase)");
  // Section C needs a conversation that HAS turns, and section B needs one that does not, so
  // they cannot both run against the same open state. --no-new-session leaves whatever the
  // caller opened alone, which is how C is run: open a session, then re-run with the flag.
  const keepSession = process.argv.includes("--no-new-session");
  if (keepSession) {
    console.log("  (--no-new-session: leaving the open conversation alone)");
  } else {
    await ev(`(() => {
      const b = [...document.querySelectorAll("button,[role=button],a")].find((e) => /新会话|new session|New chat/i.test(e.textContent || ""));
      if (b) b.click();
      return b ? "clicked" : "no new-session control";
    })()`);
    await sleep(900);
  }

  const hero = await ev(`(() => {
    const q = (s) => document.querySelector(s);
    const cs = (e, p) => (e ? getComputedStyle(e)[p] : null);
    const stack = q('[class*="_composerStack"]');
    const seat = q('[class*="_composerSeat"]');
    const card = q('[data-composer-card]');
    const visibleText = (t) => [...document.querySelectorAll("*")]
      .some((n) => !n.children.length && (n.textContent || "").trim() === t && n.getClientRects().length > 0);
    const phaseEl = document.querySelector('._root[data-phase]') ||
      [...document.querySelectorAll("[data-phase]")].find((n) => n.className && /_root/.test(n.className));
    return {
      phase: phaseEl ? phaseEl.getAttribute("data-phase") : null,
      firstChildDisplay: cs(stack && stack.firstElementChild, "display"),
      workspaceRowDisplay: cs(q('[class*="_heroWorkspaceRow"]'), "display"),
      headlineVisible: visibleText("探索未至之境"),
      badgeVisible: visibleText("预览版"),
      fishVisible: !!(q('[class*="_fishHitbox"]') && q('[class*="_fishHitbox"]').getClientRects().length),
      cardVisible: !!(card && card.getClientRects().length && card.getBoundingClientRect().height > 40),
      // The card's own fill. The transcript's blanket-transparency rule used to reach it through
      // [class*="_card"] because [data-conversation-content] is the composer's ANCESTOR, and
      // erased the fill with !important. Unreadable in the dark, obvious over a bright artwork.
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      cardBottomGap: card ? Math.round(innerHeight - card.getBoundingClientRect().bottom) : null,
      seatBottomGap: seat ? Math.round(innerHeight - seat.getBoundingClientRect().bottom) : null,
    };
  })()`);
  console.log(`  ${JSON.stringify(hero)}`);

  if (hero.phase !== "hero") {
    // B is ABOUT a fresh conversation. Running it against an open one would report the hero
    // rules as broken when all that happened is that this is the wrong screen.
    console.log("  (this is not a fresh conversation, so there is no hero state to check here)");
  } else {
    ok("we are in the hero phase (a fresh conversation, which is what this is about)", true);
    ok("the hero block is hidden", hero.firstChildDisplay === "none", `display=${hero.firstChildDisplay}`);
    ok("the hero-only workspace chip row is hidden", hero.workspaceRowDisplay === "none", `display=${hero.workspaceRowDisplay}`);
    ok("the headline, the preview badge and the whale are all off-screen",
      !hero.headlineVisible && !hero.badgeVisible && !hero.fishVisible,
      JSON.stringify({ headline: hero.headlineVisible, badge: hero.badgeVisible, fish: hero.fishVisible }));
    // The other half of the bet: hiding by :first-child must not have taken the input with it.
    ok("the input card is still there (the :first-child bet did not eat the composer)", hero.cardVisible === true);
    ok("the input card sits at the bottom edge", hero.cardBottomGap !== null && hero.cardBottomGap <= 8, `gap=${hero.cardBottomGap}px`);
    // The card must keep its own fill now that the artwork behind it is bright. Reading
    // backgroundColor is enough here: with the fix the app's --dsw-specific-input-major (0.78 at
    // veil 0) lands on it, and without it this is exactly 'rgba(0, 0, 0, 0)'.
    const a = /rgba?\([^)]*?,\s*([0-9.]+)\)$/.exec(String(hero.cardBg));
    const alpha = a ? Number(a[1]) : (String(hero.cardBg).startsWith("rgb(") ? 1 : 0);
    ok("the input card still has a fill (the transcript blanket does not reach it)",
      alpha >= 0.5, `backgroundColor=${hero.cardBg}`);
    await shot("hero");
  }

  /* ---------------------------------------------------------- the transcript */
  section("C. the transcript: question and answer filled, work rows not");
  const rows = await ev(`[...document.querySelectorAll("[data-chat-flow-kind]")].map((el) => {
    const cs = getComputedStyle(el);
    const bubble = el.querySelector('[class*="_bubble"]');
    return {
      kind: el.getAttribute("data-chat-flow-kind"),
      answer: el.hasAttribute("data-turn-process-answer"),
      /* A work row IS an assistant-step (that is the whole trap this section exists for), so
         the kind alone cannot say which of them is the answer. The member marker can, and it
         is the only marker that holds in BOTH fold states. */
      member: el.hasAttribute("data-turn-process-member"),
      hidden: el.hasAttribute("hidden"),
      bg: cs.backgroundColor,
      bubbleBg: bubble ? getComputedStyle(bubble).backgroundColor : null,
    };
  })`);
  const alphaOf = (c) => { const m = /rgba?\([^)]*?,\s*([0-9.]+)\)$/.exec(String(c)); return m ? Number(m[1]) : (String(c).startsWith("rgb(") ? 1 : 0); };
  const visible = rows.filter((r) => !r.hidden);
  console.log(`  ${visible.length} visible flow row(s)${visible.length ? ": " + visible.map((r) => r.kind).join(", ") : ""}`);

  if (visible.length === 0) {
    console.log("  (no conversation with messages is open - section C needs one; open a session that has a turn and re-run)");
  } else {
    const work = visible.filter((r) => !["user", "steering", "assistant-step"].includes(r.kind));
    const qa = visible.filter((r) => ["user", "steering"].includes(r.kind) || r.answer || r.kind === "assistant-step");
    ok("the work rows (reasoning / tool calls / results) are still fully transparent",
      work.every((r) => alphaOf(r.bg) === 0), work.map((r) => `${r.kind}=${r.bg}`).join(", "));
    ok("the question's bubble has a fill",
      visible.filter((r) => ["user", "steering"].includes(r.kind)).every((r) => alphaOf(r.bubbleBg) >= 0.85),
      visible.filter((r) => ["user", "steering"].includes(r.kind)).map((r) => `${r.kind}=${r.bubbleBg}`).join(", "));
    // The answer is the assistant-step that is NOT a member of the turn's work fold. (Writing
    // this as "every visible assistant-step" is what the first version of this check did, and
    // it passed only because every back then got the fill - including the work rows, which is
    // the very defect this now exists to catch.)
    ok("the assistant's prose has a fill",
      visible.filter((r) => r.kind === "assistant-step" && !r.member).every((r) => alphaOf(r.bg) >= 0.85),
      visible.filter((r) => r.kind === "assistant-step" && !r.member).map((r) => `${r.kind}=${r.bg}`).join(", "));
    ok("the work rows that are assistant-steps stay see-through (they are not prose)",
      visible.filter((r) => r.kind === "assistant-step" && r.member).every((r) => alphaOf(r.bg) === 0),
      visible.filter((r) => r.kind === "assistant-step" && r.member).map((r) => `${r.kind}=${r.bg}`).join(", "));
    // A row's own backgroundColor is not proof that the row is see-through: a child could be
    // painting the fill instead. So walk the whole subtree and report anything in a WORK row
    // that actually paints - a second reading of the same question with a different yardstick.
    const painters = await ev(`(() => {
      const out = [];
      for (const row of document.querySelectorAll('[data-chat-flow-kind="turn-process"],[data-chat-flow-kind="turn-tail"]')) {
        if (row.hasAttribute("hidden")) continue;
        const walk = (n) => {
          const cs = getComputedStyle(n);
          const paints = cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
            (cs.backgroundImage && cs.backgroundImage !== "none") ||
            (cs.boxShadow && cs.boxShadow !== "none");
          if (paints) {
            const r = n.getBoundingClientRect();
            if (r.width > 40 && r.height > 8)
              out.push({ cls: String(n.className).slice(0, 46), bg: cs.backgroundColor, bgi: cs.backgroundImage.slice(0, 28) });
          }
          for (const c of n.children) walk(c);
        };
        walk(row);
      }
      return out.slice(0, 12);
    })()`);
    ok("nothing inside the work rows paints either (they are see-through all the way down)",
      painters.length === 0, JSON.stringify(painters));

    // The regression the assistant-step anchor exists for: data-turn-process-answer is only
    // rendered while the work fold is collapsed, so an answer styled by that marker alone loses
    // its fill exactly when the reader expands the fold to read the work.
    const fold = await ev(`(async () => {
      /* The answers are identified BEFORE the fold opens, by the one marker that is only
         rendered while it is closed, and then found again AFTER by node key - because that is
         the point of the check: whatever styles the answer must survive the marker going away.
         (Reading "every visible assistant-step" both before and after, as this used to, cannot
         fail for the right reason: the rows that appear when the fold opens are work rows, and
         they are supposed to be see-through.) */
      const read = () => [...document.querySelectorAll('[data-turn-process-answer]')]
        .filter((e) => e.getClientRects().length)
        .map((e) => ({ key: e.getAttribute("data-chat-node-key"), bg: getComputedStyle(e).backgroundColor }));
      const before = read();
      const btn = document.querySelector('[data-chat-flow-kind="turn-process"] button[aria-expanded],[data-chat-flow-kind="turn-process"] [role="button"]');
      if (!btn) return { clicked: false };
      btn.click();
      await new Promise((r) => setTimeout(r, 600));
      const byKey = new Map([...document.querySelectorAll("[data-chat-node-key]")]
        .map((e) => [e.getAttribute("data-chat-node-key"), e]));
      const after = before.map((b) => {
        const el = byKey.get(b.key);
        return { key: b.key, found: !!el, bg: el ? getComputedStyle(el).backgroundColor : null };
      });
      return { clicked: true, before: before.length, after };
    })()`);
    if (!fold.clicked) {
      console.log("  (no work-fold disclosure found to expand; skipping the fold check)");
    } else {
      ok("the answer keeps its fill after the work fold is expanded",
        fold.after.length > 0 && fold.after.every((a) => a.found && alphaOf(a.bg) >= 0.85),
        `answers before=${fold.before} after=${JSON.stringify(fold.after.slice(0, 3))}`);
    }

    console.log(`  (${qa.length} filled row(s) of ${visible.length})`);
    await shot("transcript");
    console.log(`  shot  transcript.png`);
  }

  section(`verdict: ${checks - failures}/${checks} runtime checks passed`);
  if (failures) {
    console.log("\nThis is a rendered-layout check, not a substitute for verify.mjs - run both.");
    process.exit(1);
  }
  console.log(`\nScreenshots in ${path.relative(root, shotsDir)}.`);
  console.log("Brightness is measured from those PNGs, not from the token values:");
  console.log(`  python tools/sample-pixels.py ${path.relative(root, shotsDir)}/*.png --boxes ${path.relative(root, path.join(shotsDir, "boxes.json"))}`);
  process.exit(0);
};

main().catch((err) => {
  console.error(`\ncdp-verify: ${err.message}`);
  process.exit(2);
});
