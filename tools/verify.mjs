/**
 * verify.mjs �?every gate a build must pass before it reaches a live profile.
 *
 *   A. SAFETY LINT over the bundle and the stylesheet it actually injects: every pattern
 *      that once broke the UI (full-screen layer above content, hijacked pointer input,
 *      window drag regions, a skin that paints the window frame, layout !important,
 *      non-negative z-index on the wallpaper, a rule fragment joined mid-declaration) is
 *      rejected.
 *   B. SMOKE TEST in a fake DOM: the bundle is evaluated exactly as the browser would,
 *      activated against a stub ctx, the settings panel rendered, the escape hatches
 *      exercised, the self test driven through all three verdict paths.
 *   C. DESIGN ASSERTIONS for the design intent - and above all for the ONE palette rule:
 *      LIGHT reads blue, DARK reads gold. The rule is checked as a rule (polarity across
 *      the whole decorative token set), not as a list of literals, so a migration that
 *      lands on half the tokens cannot pass again.
 *   D. PACKAGING: the manifest really is a DSH bundle (dsh.bundle.patch present and
 *      pointing at a patch that inserts exactly the row whose id the bundle registers),
 *      because a skin that is not a bundle never reaches the app's plugin list.
 *
 * usage: node tools/verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { stripLegacyInsert } from './legacy-entry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8');

let failures = 0;
let checks = 0;
const ok = (name, pass, detail) => {
  checks++;
  if (pass) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);

/* ---------------------------------------------------------------- fake DOM */
function makeElement(tag) {
  const attrs = new Map(), styleProps = new Map();
  return {
    tagName: String(tag).toUpperCase(), parentNode: null, textContent: "", children: [],
    style: {
      setProperty: (k, v) => styleProps.set(k, String(v)),
      removeProperty: (k) => styleProps.delete(k),
      getPropertyValue: (k) => (styleProps.has(k) ? styleProps.get(k) : "")
    },
    setAttribute: (k, v) => attrs.set(k, v === undefined ? "" : String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: (k) => attrs.delete(k),
    hasAttribute: (k) => attrs.has(k),
    appendChild: (c) => { c.parentNode = null; return c; },
    removeChild: (c) => c,
    querySelector: () => null, closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    addEventListener: () => {}, removeEventListener: () => {}
  };
}
function makeDom() {
  const store = new Map();
  const html = makeElement("html"), body = makeElement("body"), head = makeElement("head");
  const headChildren = [], winListeners = new Map();
  head.appendChild = (c) => { headChildren.push(c); c.parentNode = head; return c; };
  head.removeChild = (c) => { const i = headChildren.indexOf(c); if (i >= 0) headChildren.splice(i, 1); return c; };

  const sandbox = {
    console,
    setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  };
  sandbox.window = sandbox;
  sandbox.window.innerHeight = 900;
  sandbox.window.addEventListener = (t, fn) => winListeners.set(t, fn);
  sandbox.window.removeEventListener = (t) => winListeners.delete(t);
  sandbox.document = {
    documentElement: html, body, head, createElement: makeElement,
    querySelector: () => null, elementFromPoint: () => null,
    addEventListener: () => {}, removeEventListener: () => {}
  };

  const React = {
    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
    useEffect: (fn) => { const c = fn(); if (typeof c === "function") c(); },
    createElement: (type, props, ...children) => ({ type, props: props || {}, children })
  };
  const jsx = { jsx: (type, props) => ({ type, props: props || {} }), jsxs: (type, props) => ({ type, props: props || {} }) };

  const boot = { id: null, factory: null };
  sandbox.window.__ModuleLoader__ = { load: (def) => { boot.id = def.id; boot.factory = def.factory; } };
  sandbox.require = (id) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsx;
    throw new Error(`unexpected module request: ${id}`);
  };

  const captured = { layers: [], comps: new Map(), events: new Map(), locale: new Map(), effects: [] };
  const theme = {
    colorScheme: "light",
    overrideTokens: (source, tokens) => {
      captured.layers.push({ source, tokens });
      return () => { captured.layers = captured.layers.filter((l) => l.source !== source); };
    },
    getTheme: () => ({ active: { colorScheme: theme.colorScheme }, preference: theme.colorScheme })
  };
  const ctx = {
    get: (n) => (n === "theme" ? theme : undefined),
    on: (e, fn) => captured.events.set(e, fn),
    off: (e) => captured.events.delete(e),
    effect: (fn) => { const d = fn(); if (typeof d === "function") captured.effects.push(d); return () => {}; },
    slots: {
      inject: (n, cb) => { const d = cb(); if (typeof d === "function") captured.effects.push(d); return () => {}; },
      register: (o, C) => { captured.comps.set(o.name, { opts: o, Comp: C }); return () => captured.comps.delete(o.name); }
    },
    locale: {
      register: (ns, dict) => { captured.locale.set(ns, dict); return () => captured.locale.delete(ns); },
      bind: (ns) => (key) => { const d = captured.locale.get(ns) || {}; return (d.zh && d.zh[key]) || key; }
    }
  };
  return { sandbox, boot, ctx, theme, captured, html, body, head, headChildren, winListeners };
}

/* ---------------------------------------------------------------- boot */
const env = makeDom();
vm.runInNewContext(bundle, env.sandbox, { filename: "lib/client.js" });
const api = env.boot.factory(env.sandbox.require);
const stop = api.apply(env.ctx);
const injected = env.headChildren.find((c) => c.getAttribute && c.getAttribute("data-plugin") === "dsh-client-ui-durandal");
const css = injected ? injected.textContent : "";
const code = bundle.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

/* ---------------------------------------------------------------- A. lint */
section("A. safety lint (bundle + injected stylesheet)");

const lint = (name, bad, detail) => ok(name, !bad, detail);
lint("no -webkit-app-region (window drag regions eat clicks)", /-webkit-app-region/.test(code));
lint("no window-level pointer/click listeners",
  /addEventListener\(\s*["'](pointerdown|pointermove|pointerup|mousedown|mousemove|mouseup|click|dblclick)["']/.test(code));
ok("the only addEventListener call is the passive keydown escape hatch",
  (code.match(/addEventListener\(/g) || []).length === 1 && /addEventListener\(\s*"keydown"/.test(code));
lint("no preventDefault anywhere", /preventDefault/.test(code));
lint("no document-level listeners", /document\.addEventListener/.test(code));
lint("no backdrop-filter", /backdrop-filter/.test(code));
lint("no pointer-events:auto", /pointer-events\s*:\s*auto/.test(code));
ok("the only filter declarations are the wallpaper blur and the showcase dim/reset",
  (() => {
    const decls = css.split(";").filter((d) => /(^|[^-])filter\s*:/.test(d));
    return decls.length === 3 && decls.every((d) => /--sk-blur|--sk-idle-blur|filter\s*:\s*none/.test(d));
  })());
ok("wallpaper layers are pointer-events:none", /pointer-events\s*:\s*none/.test(css));
ok("every z-index is negative",
  (() => { const z = [...css.matchAll(/z-index\s*:\s*(-?\d+)/g)].map((m) => Number(m[1])); return z.length > 0 && z.every((v) => v < 0); })());

// rules are split on '}' then each selector (paren-aware) is checked
const splitTop = (text) => {
  const out = []; let depth = 0, buf = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  out.push(buf); return out;
};
const rulePieces = css.split("}").filter((p) => p.includes("{"));
const selectors = rulePieces.flatMap((p) => splitTop(p.slice(0, p.indexOf("{")))).map((s) => s.trim()).filter(Boolean);
const ungated = selectors.filter((s) => !(s.startsWith('html[data-dsh-skin="durandal"]') || s.startsWith(".sk-")));
ok(`every rule is gated on the skin attribute or a .sk-* panel class (${selectors.length} selectors)`,
  ungated.length === 0, ungated.join("\n        "));
ok("the skin never paints the document root or the window frame",
  !selectors.some((s) => /^(html|body|html\[data-dsh-skin="durandal"\])$/.test(s)) &&
  !/\[class\*="_frame"\]/.test(css) && !/data-windows-titlebar/.test(css));
ok("the shared sidebar token is never re-bound in CSS (it also paints the Windows frame)",
  !/--dsw-specific-sidebar-fill\s*:/.test(css));

// A rule piece must be ONE well-formed block. The stylesheet is assembled by joining string
// fragments, so a fragment that stops mid-declaration followed by one that opens a new
// selector yields `box-shadow:...,html[...]{...}` - a value that swallows a whole block and
// silently deletes every rule inside it. That is precisely how the centre column's trim, its
// inlay, the code-block banner and the composer focus ring vanished for a release, so the
// shape is now checked rather than trusted.
const malformedPieces = rulePieces.filter((p) => {
  if (p.trimStart().startsWith("@")) return false;              // an at-rule may nest
  const body = p.slice(p.indexOf("{") + 1);
  return body.includes("{") || /(^|[,;]\s*)html\[data-dsh-skin=/.test(body);
});
ok("every rule is one well-formed block (no selector swallowed into a value)",
  malformedPieces.length === 0, malformedPieces.map((p) => p.slice(0, 90)).join("\n        "));
// ...and the other way a fragment can go wrong, which the shape check above cannot see: an
// element of this array is often ONE expression, continued with a leading `+` on the next line.
// Put an array comma at the end of the first line and that continuation stops being part of the
// expression - it becomes an array element of its own, `+ '...'`, i.e. a unary plus on a string,
// i.e. NaN - and the compiled selector reads `:is(...)NaNbackground-color:...`. That still has a
// selector and a body, so the shape check passes, the rule parses, matches nothing, and the
// styling silently disappears. That is how the answer's fill went missing on 2026-10-09.
ok("no array fragment was spliced into the stylesheet as a value",
  !/NaN/.test(css) && !/\bundefined\b/.test(css),
  (css.match(/.{0,50}NaN.{0,50}/) || [""])[0]);

/**
 * A colour's warmth: > 0 means the blue channel leads (cool), < 0 means red leads (warm).
 * Understands #rrggbb and rgb()/rgba(). Anything else (url(), gradients, keywords) is not a
 * polarity question and returns null.
 */
const warmth = (v) => {
  const s = String(v);
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return parseInt(m[1].slice(4, 6), 16) - parseInt(m[1].slice(0, 2), 16);
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  return m ? Number(m[3]) - Number(m[1]) : null;
};

const importantProps = [];
for (const piece of rulePieces) {
  const brace = piece.indexOf("{");
  for (const decl of piece.slice(brace + 1).split(";")) {
    if (!/!\s*important/.test(decl)) continue;
    importantProps.push(decl.split(":")[0].trim());
  }
}
const banned = /^(width|height|min-width|min-height|max-width|max-height|position|top|left|right|bottom|display|margin|padding|font-size|line-height|z-index|transform|opacity|filter|pointer-events|clip-path)$/;
const odd = importantProps.filter((p) => !/^--/.test(p) && !/(color|background|border|shadow)/.test(p));
ok(`!important is confined to colours, borders, shadows and token re-binds (${importantProps.length})`,
  importantProps.length > 0 && odd.length === 0 && !importantProps.some((p) => banned.test(p)), odd.join(", "));

const seen = new Map(); const dupes = [];
for (const piece of rulePieces) {
  const brace = piece.indexOf("{");
  const sel = piece.slice(0, brace).trim();
  for (const decl of piece.slice(brace + 1).split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim(), val = decl.slice(i + 1).trim();
    if (!prop || prop.startsWith("--")) continue;
    const key = `${sel}||${prop}`;
    if (seen.has(key) && seen.get(key) !== val) dupes.push(`${prop} on ${sel.slice(0, 60)}`);
    seen.set(key, val);
  }
}
ok(`no property is declared twice for the same selector (${dupes.length} duplicates)`, dupes.length === 0, dupes.join(" | "));
ok("no unresolved asset placeholder", !/__[A-Z_]+__/.test(bundle));
ok("the wallpaper is inlined as a JPEG data URL", /data:image\/jpeg;base64,/.test(bundle));

/* ---------------------------------------------------------------- B. smoke */
section("B. smoke test (fake DOM, real bundle)");

// the two earlier regressions must stay fixed
ok("the CTA keeps its own text re-bind, and column label re-binds are scheme-gated",
  /button\[class\*="_newSession"\]/.test(css) &&
  /--dsw-alias-label-primary:#2B2416!important/.test(css) &&
  !/html\[data-dsh-skin="durandal"\] \[class\*="_sidebarCol"\]\{[^}]*--dsw-alias-label-primary:/.test(css));
ok("the primary action is a shaped banner that follows the palette (blue / gold)",
  // shape once, then the two palettes' fills and inks
  /\[class\*="_newSession"\][^{]*\{[^}]*clip-path:polygon\(15px 0/.test(css) &&
  /background-color:var\(--sk-control,#3A69DC\)!important/.test(css) &&
  /background-image:linear-gradient\(180deg,#5480E8 0%,var\(--sk-control,#3A69DC\) 44%/.test(css) &&
  /background-color:var\(--sk-control,#F5D877\)!important/.test(css) &&
  // the token itself must carry the pair, or "palette-driven" is a claim, not a fact
  (() => { const TT = api.buildTokens({ bg: "art", veil: 0 });
    return TT["--sk-control"].light === "#2F5FD0" && TT["--sk-control"].dark === "#F5D877"; })() &&
  /background-image:linear-gradient\(180deg,#FFF6CE/.test(css) &&
  /--dsw-alias-label-primary:#FFFFFF!important/.test(css) &&
  /--dsw-alias-label-primary:#2B2416!important/.test(css) &&
  (css.match(/data-sk-scheme="dark"/g) || []).length >= 6);
// The light trim has to be HER blue and carried at a weight that holds a hairline on a
// bright screen. Asserted by hue and opacity, not by remembered literals: this check used to
// pin exact rgb strings (and was rewritten every time the tone was retuned, once still
// demanding the pre-migration gold). Now it states the requirement itself - cool, and deep
// enough - so re-tuning the palette does not mean re-teaching the assertion.
ok("the light trim is her blue, carried deep enough to hold a hairline",
  (() => {
    const TT = api.buildTokens({ bg: "art", veil: 0 });
    const coolEnough = (v) => { const w = warmth(v); return w !== null && w > 20; };
    const alphaOf = (v) => Number((String(v).match(/,\s*([0-9.]+)\)$/) || [])[1]);
    return coolEnough(TT["--sk-gold"].light) &&
      coolEnough(TT["--sk-edge"].light) && coolEnough(TT["--sk-accent-line"].light) &&
      alphaOf(TT["--sk-edge"].light) >= 0.6 && alphaOf(TT["--sk-accent-line"].light) >= 0.45;
  })());
ok("dark mode paints the session list gold, including the ui-workspace row classes",
  /--dsw-alias-label-primary:#F0D691!important/.test(css) &&
  /--dsw-alias-link:#F0D691!important/.test(css) &&
  /_sessionRow/.test(css) && /_title/.test(css) && /_projectRow/.test(css) &&
  /color:#F0D691!important/.test(css));
ok("decoration golds are scheme-aware skin tokens (line, weave, edge)",
  (() => {
    const TT = api.buildTokens({ bg: "art", veil: 0 });
    return ["--sk-edge", "--sk-edge-soft", "--sk-inlay"].every((n) => {
      const t = TT[n];
      return t && typeof t.light === "string" && typeof t.dark === "string";
    });
  })() &&
  /var\(--sk-edge/.test(css) && /var\(--sk-crest/.test(css));
ok("the sidebar keeps its panel sheen",
  (() => { const TT = api.buildTokens({ bg: "art", veil: 0 }); return !!TT["--sk-panel-sheen"]; })());
ok("clip-path is used only for that banner (and its inner frame)",
  (css.match(/clip-path:/g) || []).length === 2, String((css.match(/clip-path:/g) || []).length));
const decoRules = rulePieces.filter((p) => /::(before|after)/.test(p.slice(0, p.indexOf("{"))));
const liveDeco = decoRules.filter((p) => !/pointer-events\s*:\s*none/.test(p));
ok("every decorative pseudo-element is inert (" + decoRules.length + " rules)",
  decoRules.length >= 3 && liveDeco.length === 0,
  liveDeco.map((p) => p.slice(0, p.indexOf("{")).trim()).join(" | "));
// The sidebar's ornament is one ordered layer list. Assert the list itself: reordering it,
// dropping a layer or joining a fragment wrong all fail here (see the centre-column accident).
ok("the sidebar carries the divider, the crest watermark and the panel sheen",
  /background-image:var\(--sk-divider,none\),var\(--sk-crest,none\),var\(--sk-panel-sheen,none\)/.test(css) &&
  /background-size:62% auto,156px 156px,auto/.test(css) &&
  /background-position:center bottom 226px,center bottom 34px,center center/.test(css));
ok("nothing is drawn in bands across the panel or the window", !/repeat-x/.test(css));
ok("the sidebar edge is a hairline trim in that palette",
  /inset -1px 0 0 0 var\(--sk-edge/.test(css) && /inset -3px 0 0 0 var\(--sk-accent-line/.test(css) &&
  /\[class\*="_centerCol"\]\{box-shadow:inset 0 0 0 1px/.test(css));
ok("the sidebar carries the crest watermark",
  /var\(--sk-crest/.test(css) &&
  (() => { const TT = api.buildTokens({ bg: "art", veil: 0 }); return !!TT["--sk-crest"]; })());
ok('the build badge / brand chip is forced to a readable dark tile',
  /\[class\*="_buildVersion"\]/.test(css) && /data-slot="sidebar\.toggle\.badge"/.test(css) &&
  /background:#1E2A44!important/.test(css));

const layer = env.captured.layers[0];
ok("plugin registers exactly one theme override layer",
  env.captured.layers.length === 1 && layer.source === "dsh-client-ui-durandal");
const badTokens = Object.entries(layer.tokens).filter(([, v]) =>
  typeof v !== "object" || v === null || typeof v.light !== "string" || typeof v.dark !== "string");
ok(`all ${Object.keys(layer.tokens).length} overridden tokens carry a complete {light,dark} pair`,
  badTokens.length === 0, badTokens.map(([k]) => k).join(", "));

const alphaOf = (v) => Number((v.match(/,\s*([0-9.]+)\)$/) || [])[1]);
const T = api.buildTokens({ bg: "art", veil: 6 });
section("C. design assertions (light, airy, artwork first)");
ok("the table is nearly transparent so the artwork shows",
  alphaOf(T["--dsw-alias-bg-base"].light) <= 0.3 && alphaOf(T["--dsw-alias-bg-base"].dark) <= 0.3,
  T["--dsw-alias-bg-base"].light);
// THE FRAME GUARD: on Windows this token paints the whole window frame, so any non-zero
// value here is a film over the artwork everywhere. It used to be pinned to "thin" (<=0.35);
// three stacked films - this one, the 0.08 bg-base floor and the 0.05 wash on html::after -
// still left the illustration reading as "too faint". Thin was the wrong target, so the pin
// is now the only value that costs the art nothing. The sidebar is unaffected either way: it
// is painted by --sk-panel at higher specificity (asserted separately below).
ok("the shared frame token is fully transparent, not merely thin",
  alphaOf(T["--dsw-specific-sidebar-fill"].light) === 0 &&
  alphaOf(T["--dsw-specific-sidebar-fill"].dark) === 0,
  T["--dsw-specific-sidebar-fill"].light);
// ...and the whole point of that: at veil 0 NOTHING is laid over the artwork. Each of the
// three films is checked by name, so a future edit cannot restore one of them quietly.
{
  const Z = api.buildTokens({ bg: "art", veil: 0 });
  const films = ["--dsw-alias-bg-base", "--dsw-specific-sidebar-fill"];
  const left = films.filter((n) => alphaOf(Z[n].light) !== 0 || alphaOf(Z[n].dark) !== 0);
  ok("at veil 0 the artwork arrives at full strength (no film left on it)",
    left.length === 0, left.map((n) => `${n}: ${Z[n].light}`).join(", "));
}
// ...and the slider is still the one thing that can dim it, so "bright by default" did not
// become "bright and unadjustable".
ok("the background-depth slider still lays a wash on demand",
  alphaOf(api.buildTokens({ bg: "art", veil: 40 })["--dsw-alias-bg-base"].light) > 0.1);

// ---- the empty conversation: no hero chrome, the composer docked at the bottom -------------
// A fresh conversation used to be the one screen the artwork could not be seen on: the app's
// hero block (whale, headline, preview badge) and a hero-only workspace chip row sat in the
// middle with the input card centred under them. Both are now gone and the card is at the
// bottom edge, which leaves the illustration alone on the screen.
//
// The mechanism is pinned, not just the outcome, because the obvious-looking alternative is
// wrong: position:sticky does NOT dock a box (it only stops one scrolling off the top of its
// container, so with a short scrollport it is inert), and pairing it with flex-start parks the
// card at the TOP. margin-top:auto is what actually moves it down, and a future edit that
// "fixes" it back to sticky would look reasonable and silently break the layout.
ok("the hero empty state is removed (whale, headline, badge, workspace chip)",
  /\[data-phase="hero"\] \[class\*="_composerStack"\] > :first-child\{display:none\}/.test(css) &&
  /\[data-phase="hero"\] \[class\*="_heroWorkspaceRow"\]\{display:none\}/.test(css));
ok("in hero the composer docks at the bottom by auto margin, and NOT by sticky",
  /\[data-phase="hero"\] \[class\*="_composerSeat"\]\{margin-top:auto\}/.test(css) &&
  /\[class\*="_composerHero"\]\{padding-bottom:0\}/.test(css) &&
  !/\[data-phase="hero"\] \[class\*="_composerSeat"\]\{[^}]*position:sticky/.test(css));
ok("the docked composer stays a floating card (the seat is given no fill of its own)",
  !/\[data-phase="hero"\] \[class\*="_composerSeat"\]\{[^}]*background/.test(css));

// ---- the transcript: a fill for the question and the answer, none for the work -------------
// The blanket rule keeps every flow row transparent so the art reads through the transcript.
// Two rows are excepted, and the exception has to be spelled out for four reasons that each
// cost a bug if forgotten: the blanket matches on three attributes that live on the SAME
// element as the flow item; [data-turn-process-answer] only exists while the work fold is
// collapsed; the question's fill belongs on its bubble, which carries the app's own radius
// and padding; and - the one that actually shipped broken - a work row IS an
// `assistant-step`, so "fill the assistant-step" fills the folded-away work too.
ok("the question and the answer share ONE translucent surface - the art reads through it",
  // one token for both rows, and a wash rather than a wall
  /background-color:var\(--sk-flow-solid\)!important/.test(css) &&
  (() => {
    const TT = api.buildTokens({ bg: "art", veil: 0 });
    const alpha = (v) => Number((String(v).match(/,\s*([0-9.]+)\)$/) || [])[1]);
    const l = alpha(TT["--sk-flow-solid"].light), d = alpha(TT["--sk-flow-solid"].dark);
    return l >= 0.4 && l <= 0.75 && d >= 0.4 && d <= 0.75;
  })());
ok("the answer is matched by its kind as well as by the fold-dependent marker",
  // [data-turn-process-answer] disappears when the reader expands the work fold, so styling
  // that marker alone would drop the answer's fill exactly when it is most needed.
  /\[data-chat-flow-kind="assistant-step"\]/.test(css));
// The fold guard, and why an attribute rather than :not(:empty):
// A collapsed work row carries hidden="until-found", which the UA maps to
// content-visibility:hidden - the content is hidden, the BOX is kept, and the app gives the
// row no height of its own, so this stylesheet's 12px of padding was the only thing making it
// 24px tall. The result was a stack of empty navy pills (~300px of solid slab per turn) down
// the middle of the transcript. :not(:empty) cannot see it: the row keeps its text in the DOM.
// data-turn-process-member="true" is the only marker that holds in BOTH fold states - when the
// fold opens, `hidden` and `data-turn-process-hidden` come off, and this one stays.
ok("the fold cannot become a stack of slabs: the fill carries no layout",
  /:is\(\[data-chat-flow-kind="assistant-step"\],\[data-turn-process-answer\]\)\{/.test(css) &&
  !/padding:12px 16px/.test(css));
ok("the work rows (reasoning, tool calls, results) are still given no fill",
  // the blanket transparency rule still matches every kind by the bare attribute...
  css.includes(' [data-chat-flow-kind],') &&
  // ...and the skin only ever names these three, so no work kind got a fill by accident.
  // (The list is read back out of the stylesheet rather than restated, so adding a kind to
  // any of the rules above fails here until it is added here deliberately.)
  (() => {
    const kinds = [...css.matchAll(/data-chat-flow-kind="([a-z-]+)"/g)].map((m) => m[1]);
    return kinds.length > 0 && kinds.every((k) => ["user", "steering", "assistant-step"].includes(k));
  })());
// The blanket transparency rule is scoped to [data-conversation-content], and that element is
// the composer's ANCESTOR - in the hero phase the input card is one of its descendants. The
// card's class is <hash>_card, so the [class*="_card"] substring matched it and the !important
// on that rule erased both the app's own fill and the corner ticks this stylesheet draws on the
// card. Which meant the input had no background at all; it was invisible only because the
// artwork used to be dim enough that a see-through card still looked dark.
ok("the transcript blanket cannot reach the input card",
  /\[class\*="_card"\]:not\(\[data-composer-card\]\)/.test(css) &&
  !/\[data-conversation-content\] \[class\*="_card"\],/.test(css) &&
  /\[data-composer-card\]\{/.test(css));   // ...and the skin still styles the card itself
ok("the fill adds NO box, so nothing can jump when the turn ends",
  !/padding:12px 16px/.test(css) &&
  !/var\(--sk-flow-solid\)!important;border-radius/.test(css));
// ---- wide tables: the app's full-bleed must not outrun the answer's solid surface --------
// ui-chat's AssistantMarkdown.module.css widens every .md-table-wide on purpose:
// --dsh-table-spare is half the gutter the message column leaves in the chat container,
// --dsh-table-lead folds that into a negative left margin plus a matching padding-left, and
// the width carries both, so a four-column-or-more table bleeds sideways and stops at the
// container's right edge. Nothing shows against a transparent answer; against this skin's
// solid one the table painted ~150px past the card (hairlines included) over the artwork.
ok("the app's wide-table full-bleed is collapsed, and collapsed by specificity not !important",
  // The G prefix and the [data-conversation-content] ancestor are load-bearing: together they
  // outrank the app's own `.v5IAXa_body .md-table-wide`, which is what lets this rule carry no
  // !important (verify's lint reserves those for colour work).
  /html\[data-dsh-skin="durandal"\] \[data-conversation-content\] \.md-table-wide\{/.test(css) &&
  // both tokens zeroed: the app's calc(100% + lead + spare) then resolves to a plain 100%
  /--dsh-table-spare:0px;--dsh-table-lead:0px;/.test(css) &&
  /\.md-table-wide\{[^}]*width:100%[^}]*max-width:100%/.test(css) &&
  /\.md-table-wide\{[^}]*margin-left:0[^}]*padding-left:0\}/.test(css) &&
  // and no !important crept onto those layout properties
  !/\.md-table-wide\{[^}]*!important/.test(css));
ok("the wide table may come down to the card instead of holding its max-content width",
  // without this the wrapper is card-wide but the table inside would still be max-content:
  // the app pins it to exactly that, so the last column would be cut off at the card edge.
  /\[data-conversation-content\] \.md-table-wide>table\{max-width:100%\}/.test(css));
ok("the sidebar has its own panel colour, applied to the column only",
  /_sidebarCol"\]\{background-color:var\(--sk-panel/.test(css) &&
  (() => { const TT = api.buildTokens({ bg: "art", veil: 0 }); return !!TT["--sk-panel"]; })());
ok("scheme handling reads the app's own attribute - no JS colour-scheme guess",
  /hasAttribute\("data-ds-dark-theme"\)/.test(code) &&
  /data-sk-scheme/.test(css) &&
  /new MutationObserver/.test(code) &&
  !/getTheme\(\)/.test(code));
// one gate only: :has() was a second gate for the same thing and never fired in the app
ok("the scheme gate is a single attribute, with no duplicate dark-theme :has() path",
  !/:has\(body\[data-ds-dark-theme\]\)/.test(css) &&
  /\[data-sk-scheme="dark"\]::before/.test(css) &&
  /\[data-sk-scheme="dark"\] \[class\*="_sidebarCol"\]\{/.test(css));
ok("the wallpaper veil is preference-only (no constant wash left on html::after)",
  /background:rgba\(255,255,255,calc\(var\(--sk-veil-a,0\) \* \.95\)\)/.test(css) &&
  /background:rgba\(6,10,20,calc\(var\(--sk-veil-a,0\) \* 1\.15\)\)/.test(css) &&
  // the old shape was `calc(.12 + var(...))`. Match that directly rather than trusting the
  // two positive matches above, which a re-added constant would still satisfy.
  !/calc\(\s*\.[0-9]+\s*\+\s*var\(--sk-veil-a/.test(css));

// ---- THE palette rule, asserted as a rule ------------------------------------------------
// The skin has exactly two colours and one rule: LIGHT reads blue, DARK reads gold. Checking
// that as an invariant across the whole decorative set - rather than as a list of remembered
// literals - is what makes a half-applied migration impossible: it fails on whichever token
// was left behind, with nobody needing to have anticipated that particular one.
const PAIRED = [
  // skin trim + motifs
  "--sk-gold", "--sk-gold-soft", "--sk-edge", "--sk-edge-soft", "--sk-accent-line", "--sk-control",
  // the app's borders
  "--dsw-alias-border-l1", "--dsw-alias-border-l2", "--dsw-alias-border-l3", "--dsw-alias-border-l4",
  // the ink ladder: a cool navy ladder in light, a champagne one in dark
  "--dsw-alias-label-secondary", "--dsw-alias-label-tertiary", "--dsw-alias-label-caption",
  "--dsw-alias-label-dimmed", "--dsw-alias-label-primary-bluish",
  // actions and accents - the composer's send button, caret and pending dot live here
  "--dsw-alias-brand-primary", "--dsw-alias-brand-text",
  "--dsw-alias-button-primary-fill", "--dsw-alias-button-primary-hover", "--dsw-alias-button-primary-dimmed",
  "--dsw-alias-button-info-fill", "--dsw-alias-button-info-hover",
  "--dsw-alias-button-ghost-active-fill", "--dsw-alias-button-ghost-active-border",
  "--dsw-alias-interactive-bg-hover", "--dsw-alias-interactive-bg-active",
  "--dsw-alias-interactive-bg-hover-accent", "--dsw-alias-state-business-primary",
  "--dsw-focus-ring-color", "--dsw-alias-markdown-citation",
  "--dsw-alias-scrollbar-bg-l1", "--dsw-alias-scrollbar-bg-l2",
  "--dsw-alias-scrollbar-hover-l1", "--dsw-alias-scrollbar-hover-l2",
  "--dsw-alias-label-deep-diving", "--dsw-alias-label-document-preview",
  "--dsw-alias-bg-multi-select", "--dsw-specific-bubble-highlight",
  "--dsw-specific-sidebar-nav-item-hover", "--dsw-specific-sidebar-nav-item-active-accent"
];
// Deliberately NOT in the list, because they have no counterpart to correspond TO:
//   surfaces           bg-*, panel, halo, surface, *-input-major, sidebar-fill, menu-*, toast-*,
//                      tooltip-*, code-block*, *-selector, hover-solid, bubble, doc-preview
//   inverted ink       label-primary / -dimmed / -inverted / -foreground, border-inverted*
//   semantic states    state-success-primary, state-error-primary, state-warn-primary/-label
//                      (a gold "warning" would not read as a warning)
const wrongPole = [];
{
  const TT = api.buildTokens({ bg: "art", veil: 0 });
  for (const n of PAIRED) {
    const t = TT[n];
    if (!t) { wrongPole.push(`${n}: not defined`); continue; }
    const l = warmth(t.light), d = warmth(t.dark);
    if (l === null || d === null) continue;            // gradients and urls have no polarity
    if (!(l > 0 && d < 0)) wrongPole.push(`${n}: light warmth ${l}, dark warmth ${d}`);
  }
}
ok(`every paired trim token is cool in light and warm in dark (${PAIRED.length} tokens)`,
  wrongPole.length === 0, wrongPole.join("\n        "));

// The motifs must actually differ between palettes. They did not: the "gold twin" was derived
// by string-splitting literals the source no longer contained, so it returned the blue
// original unchanged and both schemes shipped the same warm crest.
const motifPair = (n) => {
  const t = api.buildTokens({ bg: "art", veil: 0 })[n];
  return !!t && typeof t.light === "string" && typeof t.dark === "string" && t.light !== t.dark;
};
const flatMotifs = ["--sk-crest", "--sk-panel-crest", "--sk-inlay"].filter((n) => !motifPair(n));
ok("the crest, the panel crest and the inlay really do carry two different variants",
  flatMotifs.length === 0, flatMotifs.join(", "));
// The nameplate must sit in the CONVERSATION column's left gutter, not on the sidebar: a
// background layer sits under the panel's own content, so on the sidebar the session rows
// painted straight over the letters. Asserting the host as well as the token keeps it from
// drifting back under the rows.
ok("the nameplate hangs in the conversation column's left gutter, across the frame line",
  motifPair("--sk-inscription") &&
  /\[class\*="_centerCol"\]\{background-image:var\(--sk-inscription,none\),var\(--sk-inlay,none\)/.test(css) &&
  /background-position:left 14px center,right 4px top 0/.test(css));
ok("the panels and the input card all carry the diamond divider",
  motifPair("--sk-divider") && /var\(--sk-divider/.test(css) &&
  /linear-gradient\(90deg,transparent,var\(--sk-gold\) 50%,transparent\)/.test(css));
// no dead skin tokens: everything the skin defines must be consumed by the stylesheet.
// (The predicate used to be wrapped in a comparison that was always false, so half of it was
// dead code and the failing token names were thrown away. Now it says what it means and names
// the offenders.)
const deadTokens = (() => {
  const TT = api.buildTokens({ bg: "art", veil: 0 });
  const defined = Object.keys(TT).filter((n) => n.indexOf("--sk-") === 0);
  return defined.filter((n) => css.indexOf("var(" + n) < 0);
})();
ok("no dead skin tokens (every --sk-* the skin defines is consumed)",
  deadTokens.length === 0, deadTokens.join(", "));

// The preview harness keeps its own copy of the token values - it has to, since it renders
// without the app. But two hand-kept copies of one palette is precisely how the last
// migration ended up landing on half the tokens, so the copy is held against the builder.
// Values are normalised first: `.30` and `0.3` are the same colour, not a drift.
const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase()
  .replace(/-?(\d*\.\d+)/g, (n) => String(parseFloat(n)));
const mockDecls = [...fs.readFileSync(path.join(root, "tools", "mock-sidebar.mjs"), "utf8")
  .matchAll(/'(--[a-z0-9-]+):([^']+)'/g)].map((m) => ({ name: m[1], value: m[2] }));
const drift = mockDecls.filter(({ name, value }) => {
  const t = api.buildTokens({ bg: "art", veil: 0 })[name];
  if (!t) return false;                       // a host token the mock publishes on its own
  const flat = norm(value);
  return [t.light, t.dark].every((v) => norm(v) !== flat);
});
ok(`the preview harness's token copy still matches the builder (${mockDecls.length} declarations)`,
  drift.length === 0, drift.map((d) => `${d.name}: ${d.value}`).join("\n        "));
ok("every --sk-* variable the stylesheet consumes is produced (token pair or runtime number)",
  (() => {
    const TT = api.buildTokens({ bg: "art", veil: 0 });
    const used = [...new Set([...css.matchAll(/var\((--sk-[a-z0-9-]+)/g)].map((m) => m[1]))];
    const runtime = [...new Set([...code.matchAll(/set\("(--sk-[a-z0-9-]+)"/g)].map((m) => m[1]))];
    const missing = used.filter((n) => !(n in TT) && runtime.indexOf(n) < 0);
    return used.length >= 6 && missing.length === 0;
  })());
ok("the ACTIVE sidebar row is token-driven (that is what paints the session name)",
  (() => {
    const TT = api.buildTokens({ bg: "art", veil: 0 });
    return ["--dsw-specific-sidebar-nav-item-active",
      "--dsw-specific-sidebar-nav-item-active-accent",
      "--dsw-specific-sidebar-nav-item-hover"]
      .every((n) => TT[n] && typeof TT[n].light === "string" && typeof TT[n].dark === "string");
  })());
ok("elevated surfaces are opaque (settings, dialogs, menus stay usable)",
  /^#FFFFFF$/.test(T["--dsw-alias-bg-layer-1"].light) && /^#FFFFFF$/.test(T["--dsw-specific-menu"].light) &&
  /^rgba\(255,255,255,\.99\)$/.test(T["--dsw-menu-surface-fill"].light));
// The app's own bubble token stays 0 and the skin fills the QUESTION's bubble through its own
// --sk-flow-solid instead. That indirection is the point rather than a detour:
// --dsw-specific-bubble is shared with the /goal command bubble and the agent-question reply
// bubble, so giving IT a value would have filled those too, and this skin only wants the two
// rows a reader comes back to. Module cards stay fill-less for the reason they always were -
// prose inside them rides the illustration.
ok("the app's own bubble and module-card tokens stay fill-less (the skin fills the question instead)",
  /rgba\(255,255,255,0\)/.test(T["--dsw-specific-bubble"].light) &&
  /rgba\(255,255,255,0\)/.test(T["--dsw-alias-bg-module-platform"].light) &&
  /\[class\*="_bubble"\]\{background-color:var\(--sk-flow-solid\)!important\}/.test(css));
ok("'plain' mode restores an opaque table", alphaOf(api.buildTokens({ bg: "plain", veil: 6 })["--dsw-alias-bg-base"].light) === 1);

function hueOf(value) {
  const hex = String(value).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const rgba = String(value).match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  let r, g, b;
  if (hex) { const x = hex[1]; r = parseInt(x.length === 3 ? x[0] + x[0] : x.slice(0, 2), 16); g = parseInt(x.length === 3 ? x[1] + x[1] : x.slice(2, 4), 16); b = parseInt(x.length === 3 ? x[2] + x[2] : x.slice(4, 6), 16); }
  else if (rgba) { r = +rgba[1]; g = +rgba[2]; b = +rgba[3]; } else return null;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  let hh;
  if (max === r) hh = 60 * (((g - b) / d) % 6);
  else if (max === g) hh = 60 * ((b - r) / d + 2);
  else hh = 60 * ((r - g) / d + 4);
  return { hue: (hh + 360) % 360, sat: d / max };
}
const textTokens = Object.keys(T).filter((n) => /label-(primary|secondary|tertiary|caption|dimmed)$|brand-text|menu-icon/.test(n));
const cold = textTokens.filter((n) => ["light", "dark"].some((m) => {
  const info = hueOf(T[n][m]);
  return info && info.sat > 0.18 && !(info.hue >= 18 && info.hue <= 72);
}));
const lum = (value) => {
  const hex = String(value).match(/^#([0-9a-f]{6})$/i);
  const rgba = String(value).match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  let r, g, b;
  if (hex) { r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16); }
  else if (rgba) { r = +rgba[1]; g = +rgba[2]; b = +rgba[3]; } else return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
// readability, not a fixed hue: prose carries a strong ink, captions may be softer.
const prose = textTokens.filter((n) => /label-(primary(-dimmed)?|secondary|tertiary)$|brand-text|menu-icon/.test(n));
const soft = textTokens.filter((n) => /label-(caption|dimmed)$/.test(n));
const weak = (names, lo, hi) => names.filter((n) => {
  const l = lum(T[n].light), d = lum(T[n].dark);
  return l !== null && d !== null && (l > lo || d < hi);
});
const weakProse = weak(prose, 0.5, 0.5);
const weakSoft = weak(soft, 0.62, 0.42);
ok('prose ink is dark on the bright table and light on the dark one (' + prose.length + ' tokens)',
  prose.length >= 5 && weakProse.length === 0,
  weakProse.map((n) => n + '=' + T[n].light + '/' + T[n].dark).join(' '));
ok('caption ink stays legible without competing with prose (' + soft.length + ' tokens)',
  soft.length >= 2 && weakSoft.length === 0,
  weakSoft.map((n) => n + '=' + T[n].light + '/' + T[n].dark).join(' '));

const ui = env.captured.comps.get("settings.section");
ok("settings.section registered", !!ui);
let tree = null;
try { tree = ui.Comp({ t: (k) => k }); } catch (err) { tree = null; }
ok("settings panel renders without throwing", !!tree && tree.type === "div");
ok("panel embeds both artwork previews", (JSON.stringify(tree).match(/data:image\/jpeg;base64/g) || []).length >= 2);

ok("gate applied on <html>, both wallpapers written there, palette selected by CSS",
  env.html.getAttribute("data-dsh-skin") === "durandal" &&
  env.html.getAttribute("data-sk-bg") === "art" &&
  String(env.html.style.getPropertyValue("--sk-art-light")).startsWith('url("data:image/jpeg;base64,') &&
  String(env.html.style.getPropertyValue("--sk-art-dark")).startsWith('url("data:image/jpeg;base64,') &&
  /background-image:var\(--sk-art-light/.test(css) &&
  /\[data-sk-scheme="dark"\]::before\{pointer-events:none;background-image:var\(--sk-art-dark/.test(css));
ok("dimming is off by default and the artwork arrives unveiled",
  env.html.getAttribute("data-sk-showcase") === null &&
  Number(env.html.style.getPropertyValue("--sk-idle")) === 1 &&
  Number(env.html.style.getPropertyValue("--sk-veil-a")) === 0 &&
  api.SPEC.veil.def === 0);

const win = env.sandbox.window;
ok("escape API installed", !!win.durandalSkin && win.durandalSkin.isEnabled() === true);
win.durandalSkin.disable();
ok("disable() drops the gate and releases the token layer",
  env.html.getAttribute("data-dsh-skin") === null && env.captured.layers.length === 0);
win.durandalSkin.enable();
ok("enable() restores gate, artwork and palette",
  env.html.getAttribute("data-dsh-skin") === "durandal" && env.captured.layers.length === 1 &&
  env.html.getAttribute("data-sk-bg") === "art");
ok("artFirst() preset: thinnest chrome, no dimming",
  win.durandalSkin.artFirst().veil === 4 && env.html.getAttribute("data-sk-showcase") === null);

const rect = { left: 100, top: 100, right: 400, bottom: 160, width: 300, height: 60 };
const setProbe = (hit) => {
  env.sandbox.document.querySelector = () => ({ getBoundingClientRect: () => rect });
  env.sandbox.document.elementFromPoint = () => hit;
};
setProbe(makeElement("div"));
ok("self test passes when a control answers", api.__internals.hitTest().ok === true);
const skinLayer = makeElement("div");
skinLayer.closest = (sel) => (sel.includes("data-sk-layer") || sel.includes("data-plugin") ? skinLayer : null);
setProbe(skinLayer);
const definitive = api.__internals.hitTest();
ok("a skin layer covering a control is flagged as definitive",
  definitive.ok === false && definitive.definitive === true, JSON.stringify(definitive));
setProbe(env.html);
ok("one root-only failure does not disable yet", api.__internals.runSelfCheck() === true && api.__internals.prefs().enabled === true);
api.__internals.runSelfCheck();
ok("two consecutive root-only failures disable the skin", api.__internals.prefs().enabled === false && env.html.getAttribute("data-dsh-skin") === null);

win.durandalSkin.enable();
stop();
ok("teardown removes gate, variables and stylesheet",
  env.html.getAttribute("data-dsh-skin") === null &&
  env.html.style.getPropertyValue("--sk-art") === "" &&
  !env.headChildren.some((c) => c.getAttribute && c.getAttribute("data-plugin") === "dsh-client-ui-durandal"));

/* ------------------------------------------------- D. packaging (it must be a plugin) */
// A skin only shows up in the app's 插件 page under 已安�?if it is a *bundle*: app-boot
// composes the tree from the `dsh.bundle.patch` of every package named in the profile's
// `dsh.profile.bundles`, and lists a selection-less dependency nowhere. These checks keep
// the package installable by the plugin page instead of merely copyable into a profile.
section("D. packaging (bundle declaration + loader registration)");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const pkgName = manifest.name;
const declaredPatch = manifest.dsh?.bundle?.patch;
ok("dsh.bundle.patch is declared", typeof declaredPatch === "string", `got ${JSON.stringify(declaredPatch)}`);
ok("dsh.bundle.patch is a package-relative file, not an absolute path or URL",
  typeof declaredPatch === "string" && !/^(?:[a-z]+:|\/|[A-Za-z]:)/.test(declaredPatch), String(declaredPatch));
ok("dsh.client is declared for the web platform", manifest.dsh?.client?.platform === "web");
ok("exports['.'] and exports['./client'] both exist",
  Boolean(manifest.exports?.["."]) && Boolean(manifest.exports?.["./client"]));
ok("main points at the host half", manifest.main === "lib/index.js");

const patchText = typeof declaredPatch === "string"
  ? fs.readFileSync(path.join(root, declaredPatch), "utf8") : "";
const insertIds = [...patchText.matchAll(/^\s*-\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
ok("the bundle patch inserts exactly one row", insertIds.length === 1, `found ${JSON.stringify(insertIds)}`);
ok("that row's id equals the package name (the client host demands exactly this)",
  insertIds[0] === pkgName, `${insertIds[0]} vs ${pkgName}`);
ok("that row's name equals the package name", new RegExp(`name:\\s*['"]${pkgName}['"]`).test(patchText));
ok("the bundle does not ship its own row disabled",
  !/disabled:\s*true/.test(patchText));
ok("the bundle registers the entry id it is served under",
  new RegExp(`__ModuleLoader__\\.load\\(\\s*\\{[^}]*id:\\s*["']${pkgName}["']`).test(bundle));
// `files` globs are npm-style, so compare with the leading "./" stripped.
const shipped = (manifest.files || []).map((f) => f.replace(/^\.\//, ""));
ok("the shipped file list covers what the loader reads",
  ["lib/index.js", "lib/client.js", String(declaredPatch).replace(/^\.\//, ""), "README.md"]
    .every((f) => shipped.includes(f)),
  JSON.stringify(manifest.files));
ok("the package declares no profile-level patch (a bundle layer is applied by app-boot)",
  manifest.dsh?.profile === undefined);

// The installers strip the legacy hand-written insert out of the profile patch on the way in.
// An earlier version advanced the cursor twice per match and silently deleted the next entry's
// `- id:` header, so the neighbouring entries are pinned here with the exact shapes seen in the wild.
const legacyEntry = [
  `- id: ui-settings`,
  `  name: "@deepseek-ai/dsh-client-ui-settings"`,
  `  config:`,
  `    enabled: true`,
  ``,
  `# ${pkgName} - Durandal (Honkai Impact 3rd) client skin.`,
  `# Registered explicitly here. Remove this block, or run tools/uninstall.mjs.`,
  `- insert:`,
  `    - id: ${pkgName}`,
  `      name: '${pkgName}'`,
  `- id: ui-theme`,
  `  name: "@deepseek-ai/dsh-client-ui-theme"`,
  `  config:`,
  `    preference: light`,
  `- id: permission`,
  `  name: "@deepseek-ai/dsh-permission-presets"`,
  ``
].join("\n");
const strippedNoBlank = stripLegacyInsert(legacyEntry, { pkg: pkgName });
ok("the installer strips the legacy insert out of a profile patch", strippedNoBlank.dropped === true);
ok("stripping leaves the entry that follows the legacy block intact",
  strippedNoBlank.text.includes("- id: ui-theme\n  name: \"@deepseek-ai/dsh-client-ui-theme\""),
  "the next top-level entry lost its header");
ok("stripping leaves earlier entries intact", strippedNoBlank.text.includes("- id: ui-settings"));
ok("stripping leaves later entries intact", strippedNoBlank.text.includes("- id: permission"));
ok("stripping removes the legacy comment header too", !strippedNoBlank.text.includes("Registered explicitly here"));
ok("stripping removes the legacy row itself", !strippedNoBlank.text.includes(pkgName));

const withBlank = legacyEntry.replace(`      name: '${pkgName}'\n- id: ui-theme`, `      name: '${pkgName}'\n\n- id: ui-theme`);
ok("a blank line between the legacy block and the next entry still leaves it intact",
  stripLegacyInsert(withBlank, { pkg: pkgName }).text.includes("- id: ui-theme"));

const foreign = [
  `- insert:`,
  `    - id: other-plugin`,
  `      name: 'other-plugin'`,
  `- id: ui-theme`,
  ``
].join("\n");
const untouched = stripLegacyInsert(foreign, { pkg: pkgName });
ok("another plugin's insert is left alone", untouched.dropped === false && untouched.text === foreign);
const absent = stripLegacyInsert("- id: ui-theme\n", { pkg: pkgName });
ok("a patch with no legacy block is returned byte-identical",
  absent.dropped === false && absent.text === "- id: ui-theme\n");

/* ---------------------------------------------------------------- verdict */
section(`verdict: ${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`\n${failures} CHECK(S) FAILED - do not install this build.`); process.exit(1); }
console.log("\nAll checks passed. Safe to install.");