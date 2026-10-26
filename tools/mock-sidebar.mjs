/**
 * mock-sidebar.mjs — render the sidebar in a headless browser so the skin's real CSS can be
 * LOOKED AT before the user restarts. Deliberately adversarial: DSH's own rules are
 * reproduced, the theme tokens are INLINE styles on <body> exactly as ui-layout publishes
 * them, and dark mode is expressed the way the app expresses it (body[data-ds-dark-theme]),
 * so the stylesheet's `:has()` palette switch is exercised for real.
 *
 * The probe panel prints computed values - a silent CSS failure shows up as text instead of
 * being mistaken for a design problem.
 *
 * usage: node tools/mock-sidebar.mjs [--clean] [--dark] [--out name.html]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const art = path.resolve(root, '..', 'art');
const clean = process.argv.includes('--clean');
const dark = process.argv.includes('--dark');
const outArg = process.argv.indexOf('--out');
const outName = outArg >= 0 && process.argv[outArg + 1] ? process.argv[outArg + 1] : '_mock.html';

// ---- the skin's real stylesheet
const src = fs.readFileSync(path.join(root, 'src', 'skin.js'), 'utf8');
const a = src.indexOf('var CSS = [');
const b = src.indexOf('].join', a);
const skinCss = new Function('GATE', 'GATE_ON', 'G',
  `return ${src.slice(a + 'var CSS = '.length, b + 1)}.join("");`)(
  'data-dsh-skin', 'durandal', 'html[data-dsh-skin="durandal"]');

// ---- the two pieces of artwork, straight out of the bundle the skin ships
const bundle = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8');
const artUrls = [...bundle.matchAll(/"(data:image\/jpeg;base64,[A-Za-z0-9+/=]+)"/g)].map((m) => m[1]);
const artFor = (kind) => (kind === 'dark' ? artUrls[1] || artUrls[0] : artUrls[0]);

// ---- the motif tokens (crest, panel crest, inlay, inscription) come from the SAME generator
// functions the skin uses, evaluated out of src/skin.js - never re-drawn here. (They cannot be
// read out of the built bundle: the build inlines the artwork only, and every motif is still a
// live expression such as 'url("' + INSCRIPTION.light + '")' at runtime.) A hand-copied crest
// is exactly how this mock drifted before: it kept painting a warm rim in light mode long
// after light mode had gone blue.
const assetSlice = (() => {
  const a = src.indexOf('function svgUrl(');
  const b = src.indexOf('var DIVIDER = {');
  if (a < 0 || b < 0) throw new Error('mock: could not locate the asset helpers in src/skin.js');
  return src.slice(a, b);
})();
const { TONE, crestMarkSvg, crestPanelSvg, inlaySvg, inscriptionSvg, dividerSvg } =
  new Function(`${assetSlice}; return { TONE, crestMarkSvg, crestPanelSvg, inlaySvg, inscriptionSvg, dividerSvg };`)();
const tone = dark ? TONE.dark : TONE.light;
const motifs = {
  '--sk-crest': crestMarkSvg(tone),
  '--sk-panel-crest': crestPanelSvg(tone),
  '--sk-inlay': inlaySvg(dark ? '#D9AE45' : '#9AA9CE'),
  '--sk-inscription': inscriptionSvg(tone.rim),
  '--sk-divider': dividerSvg(tone.rim)
};
const motif = (name) => `url("${motifs[name] || ""}")`;

const alias = dark ? [
  '--dsw-alias-label-primary:#F1E7D2', '--dsw-alias-label-primary-dimmed:#E6DBC2',
  '--dsw-alias-label-primary-bluish:#F0D691', '--dsw-alias-label-primary-inverted:#101828',
  '--dsw-alias-label-secondary:#DCC9A4', '--dsw-alias-label-tertiary:#C4AE86',
  '--dsw-alias-label-caption:#A89070', '--dsw-alias-label-dimmed:#B49C78',
  '--dsw-alias-menu-icon:#E6DBC2', '--dsw-alias-brand-primary:#E0BC55', '--dsw-alias-brand-text:#F0D691',
  '--dsw-specific-sidebar-fill:rgba(16,22,38,0)',
  '--dsw-alias-interactive-bg-hover:rgba(217,174,69,.10)',
  '--dsw-alias-interactive-bg-active:rgba(217,174,69,.17)',
  '--dsw-alias-bg-layer-1:#141C2F', '--dsw-alias-bg-layer-2:#18213A',
  '--dsw-alias-border-l1:rgba(232,197,106,.14)', '--dsw-alias-border-l2:rgba(232,197,106,.20)',
  '--dsw-alias-border-l3:rgba(232,197,106,.28)', '--dsh-scrollbar-thumb:rgba(217,174,69,.22)',
  '--dsw-alias-link:#F0D691', '--dsw-alias-label-quaternary:#B49C78'
] : [
  '--dsw-alias-label-primary:#111A2E', '--dsw-alias-label-primary-dimmed:#19233C',
  '--dsw-alias-label-primary-bluish:#17409F', '--dsw-alias-label-primary-inverted:#FFFFFF',
  '--dsw-alias-label-secondary:#2A3750', '--dsw-alias-label-tertiary:#47587A',
  '--dsw-alias-label-caption:#647395', '--dsw-alias-label-dimmed:#525F80',
  '--dsw-alias-menu-icon:#2A3750', '--dsw-alias-brand-primary:#2F5FD0', '--dsw-alias-brand-text:#1B3781',
  '--dsw-specific-sidebar-fill:rgba(255,255,255,0)',
  '--dsw-alias-interactive-bg-hover:rgba(47,95,208,.08)',
  '--dsw-alias-interactive-bg-active:rgba(47,95,208,.15)',
  '--dsw-alias-bg-layer-1:#FFFFFF', '--dsw-alias-bg-layer-2:#FFFFFF',
  '--dsw-alias-border-l1:rgba(104,124,180,.24)', '--dsw-alias-border-l2:rgba(104,124,180,.36)',
  '--dsw-alias-border-l3:rgba(104,124,180,.48)', '--dsh-scrollbar-thumb:rgba(47,95,208,.24)',
  '--dsw-alias-link:#2F5FD0', '--dsw-alias-label-quaternary:#7A87A6'
];
const skinTokens = dark ? [
  '--sk-gold:#E0BC55', '--sk-gold-soft:rgba(217,174,69,.55)',
  '--sk-edge:rgba(217,174,69,.60)', '--sk-accent-line:rgba(232,197,106,.45)',
  '--sk-edge-soft:rgba(217,174,69,.22)',
  '--sk-panel:rgba(14,20,36,.86)', '--sk-panel-sheen:linear-gradient(165deg,rgba(34,46,76,.55),rgba(12,18,32,.20))',
  '--sk-surface:#0F1626', '--sk-flow-solid:rgba(14,20,36,.58)', '--sk-halo:rgba(4,8,18,.62)',
  '--sk-control:#F5D877', '--sk-control-ink:#2B2416',
  '--sk-tile:rgba(255,255,255,.07)', '--sk-tile-hover:rgba(255,255,255,.13)',
  '--sk-trim-companion:rgba(255,255,255,.12)',
  '--dsw-specific-sidebar-nav-item-hover:rgba(217,174,69,.14)',
  '--dsw-specific-sidebar-nav-item-active:rgba(16,24,42,.88)',
  '--dsw-specific-sidebar-nav-item-active-accent:#F0D691'
] : [
  '--sk-gold:#5C72AE', '--sk-gold-soft:rgba(104,124,180,.62)',
  '--sk-edge:rgba(104,124,180,.74)', '--sk-accent-line:rgba(84,106,168,.58)',
  '--sk-edge-soft:rgba(104,124,180,.34)',
  '--sk-panel:rgba(255,255,255,.86)', '--sk-panel-sheen:linear-gradient(165deg,rgba(255,255,255,.70),rgba(232,240,252,.35))',
  '--sk-surface:#FFFFFF', '--sk-flow-solid:rgba(255,255,255,.62)', '--sk-halo:rgba(255,255,255,.5)',
  '--sk-control:#2F5FD0', '--sk-control-ink:#FFFFFF',
  '--sk-tile:rgba(255,255,255,.6)', '--sk-tile-hover:rgba(255,255,255,.92)',
  '--sk-trim-companion:rgba(255,255,255,.55)',
  '--dsw-specific-sidebar-nav-item-hover:rgba(104,124,180,.14)',
  '--dsw-specific-sidebar-nav-item-active:rgba(104,124,180,.20)',
  '--dsw-specific-sidebar-nav-item-active-accent:#24479E'
];
const MOTIFS = ['--sk-crest', '--sk-panel-crest', '--sk-inlay', '--sk-inscription', '--sk-divider'];
const inlineTokens = alias.concat(skinTokens, MOTIFS.map((n) => `${n}:${motif(n)}`)).join(';');
// applyVars writes these on <html>, because the wallpaper is html::before (not a body child)
const runtimeVars = [
  '--sk-pos:58% center', '--sk-veil-a:0', '--sk-art-opacity:1', '--sk-blur:0px',
  '--sk-idle:1', '--sk-idle-blur:0px',
  `--sk-art-light:url('${artFor("light")}')`, `--sk-art-dark:url('${artFor("dark")}')`
].join(';');

const html = `<!doctype html>
<html data-dsh-skin="durandal" data-sk-scheme="${dark ? 'dark' : 'light'}" data-sk-bg="art" data-sk-motif
      style="${runtimeVars}">
<head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%}
  body{ ${inlineTokens};
    background:${dark ? 'linear-gradient(160deg,#0B1120,#111A2E 60%,#16203A)' : 'linear-gradient(160deg,#FCFDFF,#EFF4FD 60%,#E7EEFA)'};
    font-family:"Segoe UI","Microsoft YaHei",sans-serif }
  /* --- the app's own rules that matter here (reproduced, not guessed) --- */
  .m_sidebarCol{ background:var(--dsw-specific-sidebar-fill); border-right:.5px solid var(--dsw-alias-border-l3);
    width:272px; height:100%; display:flex; flex-direction:column; gap:2px; padding:10px 12px; box-sizing:border-box;
    overflow:hidden }
  .m_brand{ display:inline-flex; align-items:center; gap:8px; padding:6px 4px 14px; color:var(--dsw-alias-label-primary) }
  .m_brandName{ font-size:18px; font-weight:600; display:inline-flex; align-items:center; gap:6px }
  .m_newSession{ display:flex; align-items:center; justify-content:center; gap:8px; width:100%;
    padding:9px 12px; margin:12px 0 16px; background:var(--dsw-alias-interactive-bg-hover);
    border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); font-size:14px; cursor:pointer }
  .m_newSessionContent{ display:flex; align-items:center; gap:8px; padding:2px 6px;
    background:rgba(47,95,208,.10); border-radius:999px }
  .m_panelRow{ display:block; padding:7px 10px 7px 14px; color:var(--dsw-alias-label-primary); font-size:13px }
  /* ui-workspace: session rows carry label-primary, the SELECTED one carries the link colour */
  .m_projectRow, .m_sessionRow{ display:flex; align-items:center; gap:6px; height:32px; padding:0 8px;
    border-radius:8px; color:var(--dsw-alias-label-primary); font-size:14px }
  .m_sessionRow.m_active{ color:var(--dsw-alias-link); background:var(--dsw-specific-sidebar-nav-item-active) }
  .m_title{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  /* the ACTIVE row: the app paints it with its own sidebar tokens, and colours the text with
     the accent - exactly the element that stayed blue-white instead of gold */
  .m_panelRow.m_active{ background:var(--dsw-specific-sidebar-nav-item-active) }
  .m_panelRow.m_active .m_rowLabel{ color:var(--dsw-specific-sidebar-nav-item-active-accent) }
  .m_sectionLabel{ padding:16px 4px 4px; font-size:12px; color:var(--dsw-alias-label-tertiary) }
  .m_iconButton{ width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center;
    background:transparent; border:0; color:var(--dsw-alias-menu-icon); font-size:14px }
  .m_footerActions button{ width:30px; height:30px; background:transparent; border:0; color:var(--dsw-alias-menu-icon) }
  .m_buildVersion{ height:14px; padding:0 6px; font-size:10px; letter-spacing:.12em;
    color:var(--dsw-alias-label-primary-inverted); background:var(--dsw-alias-label-primary); border-radius:3px }
</style>
</head>
<body${dark ? ' data-ds-dark-theme' : ''}>
  <div class="m_sidebarCol">
    <div class="m_brand">
      <span style="font-size:20px">🐳</span>
      <span class="m_brandName">deepseek <span class="m_buildVersion" data-slot="sidebar.toggle.badge">HARNESS</span></span>
    </div>
    <button class="m_newSession"><span class="m_newSessionContent">＋ 新会话</span></button>
    <div class="m_panelRow">插件</div>
    <div class="m_sectionLabel">工作区</div>
    <div class="m_projectRow"><span class="m_title">默认工作区</span></div>
    <div class="m_sessionRow m_active"><span class="m_title">幽兰黛尔主题皮肤设计</span><span style="float:right;font-size:11px">8分钟</span></div>
    <div class="m_sessionRow"><span class="m_title">另一个会话名称</span></div>
    <div class="m_iconButton">🔍</div>
    <div class="m_iconButton">⇄</div>
    <div style="margin-top:auto" class="m_footerActions"><button>⚙</button><button>?</button></div>
  </div>
  <div id="probe" style="${clean ? 'display:none;' : ''}position:fixed;left:290px;top:8px;width:700px;
       font:11px/1.5 Consolas,monospace;background:#fff;color:#111;padding:10px;border:1px solid #999;white-space:pre-wrap"></div>
  <script>
    var rootEl = document.documentElement;
    var cs = getComputedStyle(document.querySelector('.m_sidebarCol'));
    var after = getComputedStyle(rootEl, '::after');
    var before = getComputedStyle(rootEl, '::before');
    document.getElementById('probe').textContent = JSON.stringify({
      mode: ${dark ? '"dark"' : '"light"'},
      artLayer: before.backgroundImage.slice(0, 26),
      veilLayer: after.backgroundColor,
      panel: cs.backgroundColor,
      // How many background layers actually resolved on the sidebar, and whether the
      // inscription is among them. A CSS failure then reads as "0" or "false" in the
      // screenshot instead of being mistaken for a design choice.
      // (crest + inscription are the two url() layers; the panel sheen is a gradient, and
      // the word "central" only ever appears in the inscription's dominant-baseline.)
      motifLayers: (cs.backgroundImage.match(/url\(/g) || []).length,
      inscription: cs.backgroundImage.indexOf('central') >= 0,
      layerSizes: cs.backgroundSize,
      sessionText: getComputedStyle(document.querySelector('.m_sessionRow .m_title')).color,
      activeText: getComputedStyle(document.querySelector('.m_sessionRow.m_active .m_title')).color,
      labelText: getComputedStyle(document.querySelector('.m_panelRow')).color,
      ctaClip: getComputedStyle(document.querySelector('.m_newSession')).clipPath.slice(0, 30),
      badge: getComputedStyle(document.querySelector('.m_buildVersion')).color
    }, null, 2);
  </script>
</body></html>`;

fs.writeFileSync(path.join(art, '_skin.css'), skinCss);
fs.writeFileSync(path.join(art, outName), html.replace('<head>', '<head><link rel="stylesheet" href="_skin.css">'));
console.log(`skin css ${skinCss.length} B -> art/_skin.css`);
console.log(`mock (${dark ? 'dark' : 'light'}) -> art/${outName}`);
