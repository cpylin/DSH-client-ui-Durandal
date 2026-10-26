/**
 * dsh-client-ui-durandal — Durandal (Honkai Impact 3rd) skin for DeepSeek Harness.
 * One source file: eight sections, one palette function, one stylesheet.
 *
 * DESIGN INTENT
 *   The illustration is the interface: the transcript is transparent and prose rides the
 *   artwork behind a hairline halo (only the question and the answer get a fill); the
 *   sidebar is a light parchment panel; everything elevated - settings, dialogs, menus,
 *   popovers - is solid, so the UI stays usable.
 *
 * HARD RULES (each earned by a real breakage, see README)
 *   1. The wallpaper lives on html::before/::after at NEGATIVE z-index with
 *      pointer-events:none, so no click can land on the skin instead of a control.
 *   2. The skin never paints the document root or the window frame
 *      (--dsw-specific-sidebar-fill is ALSO the Windows frame colour).
 *   3. No -webkit-app-region, no global cursor rule, no window-level pointer listeners,
 *      no preventDefault. One passive keydown escape hatch.
 *   4. No backdrop-filter, no transform/filter on app containers.
 *   5. !important only on colour / border / shadow / token re-binds - and token re-binds
 *      only where a subtree genuinely needs different values, because ui-layout publishes
 *      theme tokens as INLINE styles on <body> (important author beats inline author).
 *   6. A post-apply hit test probes the composer and the sidebar; if the skin itself
 *      answers, the skin disables itself.
 *
 * tools/build.mjs inlines the artwork into the servable bundle, lib/client.js.
 */

window.__ModuleLoader__.load({
  id: "dsh-client-ui-durandal",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    /* ================================================================ 1. platform */

    var React = null;
    try {
      var r = require("react");
      React = r && r.useState ? r : (r && r.default && r.default.useState ? r.default : null);
    } catch (err) { React = null; }
    var jsxRuntime = null;
    try { jsxRuntime = require("react/jsx-runtime"); } catch (err) { jsxRuntime = null; }

    /** Minimal element factory: React.createElement when present, jsx() otherwise. */
    function h(type, props) {
      var children = Array.prototype.slice.call(arguments, 2);
      if (React && React.createElement) return React.createElement.apply(null, [type, props].concat(children));
      if (jsxRuntime) {
        var p = {};
        if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) p[k] = props[k];
        if (children.length === 1) p.children = children[0];
        else if (children.length > 1) p.children = children;
        return (jsxRuntime.jsx || jsxRuntime.jsxs)(type, p);
      }
      return null;
    }

    /* ================================================================ 2. assets */

    var ART = { light: "__DURANDAL_ART_LIGHT__", dark: "__DURANDAL_ART_DARK__" };

    /** Every motif below is an inline SVG data URL, built the same way. */
    function svgUrl(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

    /**
     * Her palette is two colours and one rule: LIGHT reads blue, DARK reads gold.
     *
     * Every motif is generated from ONE template with its tones injected - never by
     * string-splitting one variant into the other, which was silently a no-op (it searched for
     * literals the source no longer contained, so both palettes shipped the same warm crest).
     */
    var TONE = {
      /* The light tones are a DEEP periwinkle, not a pale one: as hairlines on the parchment
         the old #8C9BC4 read as a whisper and disappeared on a bright screen. Still the same
         hue family, just carried at a weight that holds its line. */
      light: { rim: "#687CB4", blade: "#8394C4", rose: "#2F5FD0", spark: "#F4F7FD" },
      dark: { rim: "#D9AE45", blade: "#E0BC55", rose: "#F0D691", spark: "#FBE7A0" }
    };

    /** Watermark strength: the panel ornaments. */
    function crestMarkSvg(t) {
      return svgUrl(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" opacity="0.40">' +
        '<path d="M24 3 43 9v15c0 11-8 18-19 21C13 42 5 35 5 24V9z" fill="none" stroke="' + t.rim + '" stroke-width="1.1"/>' +
        '<path d="M24 8v30" stroke="' + t.rim + '" stroke-width=".9"/>' +
        '<path d="M24 5.5l2.6 4.6L24 15l-2.6-4.9z" fill="' + t.rim + '"/>' +
        '<g fill="' + t.rose + '" fill-opacity=".85"><circle cx="24" cy="31" r="3"/><circle cx="20.4" cy="34" r="2.4"/>' +
        '<circle cx="27.6" cy="34" r="2.4"/><circle cx="21.4" cy="28" r="2.2"/><circle cx="26.6" cy="28" r="2.2"/></g></svg>');
    }

    /** Knight crest at full strength: shield rim, lance, her rose. The settings header. */
    function crestPanelSvg(t) {
      return svgUrl(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">' +
        '<title>Durandal crest</title>' +
        '<path d="M24 3 43 9v15c0 11-8 18-19 21C13 42 5 35 5 24V9z" fill="' + t.rim + '" fill-opacity=".16"/>' +
        '<path d="M24 3 43 9v15c0 11-8 18-19 21C13 42 5 35 5 24V9z" fill="none" stroke="' + t.rim + '" stroke-width="1.6" stroke-opacity=".92"/>' +
        '<path d="M24 8v30" stroke="' + t.blade + '" stroke-width="1.4" stroke-opacity=".85"/>' +
        '<path d="M24 5.5l2.6 4.6L24 15l-2.6-4.9z" fill="' + t.blade + '" fill-opacity=".92"/>' +
        '<g fill="' + t.rose + '" fill-opacity=".88"><circle cx="24" cy="31" r="3.3"/><circle cx="20.2" cy="34.2" r="2.7"/>' +
        '<circle cx="27.8" cy="34.2" r="2.7"/><circle cx="21.2" cy="27.8" r="2.5"/><circle cx="26.8" cy="27.8" r="2.5"/></g>' +
        '<circle cx="24" cy="31" r="1.3" fill="' + t.spark + '" fill-opacity=".92"/></svg>');
    }

    /**
     * One inlay motif, repeated along ONE direction only (vertical, every 46px): a slim
     * diamond, a hairline link and a bead. Deliberately NOT a texture - nothing tiles across
     * the panel and nothing crosses anything.
     */
    function inlaySvg(c) {
      return svgUrl(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 46" width="10" height="46">' +
        '<path d="M5 1.5 7.6 5 5 8.5 2.4 5z" fill="' + c + '" fill-opacity=".7"/>' +
        '<path d="M5 10v22" stroke="' + c + '" stroke-opacity=".42" stroke-width="1"/>' +
        '<circle cx="5" cy="37" r="1.5" fill="' + c + '" fill-opacity=".6"/>' +
        '<path d="M5 40.5v4" stroke="' + c + '" stroke-opacity=".3" stroke-width="1"/></svg>');
    }

    /** The same crest at watermark strength, and the settings-header crest, in both palettes. */
    var CREST_MARK = crestMarkSvg(TONE.light);
    var CREST_MARK_GOLD = crestMarkSvg(TONE.dark);
    var CREST_SVG = crestPanelSvg(TONE.light);
    var CREST_SVG_GOLD = crestPanelSvg(TONE.dark);
    var INLAY_SVG = inlaySvg("#9AA9CE");
    var INLAY_SVG_GOLD = inlaySvg("#D9AE45");

    /**
     * The trim inscription: her name, set as a nameplate down the sidebar's right edge.
     *
     * Letters are placed one at a time rather than with writing-mode - the stack is then
     * exact at any size and does not depend on how an engine orients Latin in vertical text.
     * The separator is a drawn diamond (identical to the inlay motif) rather than a glyph, so
     * no font has to be trusted for it; a short rule closes the plate at both ends.
     *
     * The face is a system serif on purpose: this SVG is rendered as an IMAGE (a background
     * layer), and an SVG used as an image can never reach the host's @font-face, so the
     * platform's Montserrat is out of reach here. An inscription wants a serif anyway.
     */
    function inscriptionSvg(fill) {
      var SEP = "◆";
      var chars = "BIANKA ATAEGINA".split("").concat([SEP], "DURANDAL".split(""));
      var W = 18, STEP = 18, CAP = 14.5, PAD = 20, CX = W / 2;
      var H = PAD * 2 + chars.length * STEP;
      var glyphs = chars.map(function (c, i) {
        var y = PAD + i * STEP + STEP / 2;
        if (c === SEP) return '<path d="M' + CX + ' ' + (y - 5.5) + 'l3.6 5.5-3.6 5.5-3.6-5.5z" fill="' + fill + '" fill-opacity=".55"/>';
        return '<text x="' + CX + '" y="' + y + '" text-anchor="middle" dominant-baseline="central"' +
          ' font-family="Georgia,serif" font-size="' + CAP + '" font-weight="600" fill="' + fill + '">' + c + '</text>';
      }).join("");
      /* The plate closes with a diamond at each end - the same mark that separates her two
         names, so the inscription reads as one nameplate rather than a run of letters. */
      var endMark = function (y) {
        return '<path d="M' + CX + ' ' + (y - 4.4) + 'l3.6 4.4-3.6 4.4-3.6-4.4z" fill="' + fill + '" fill-opacity=".55"/>';
      };
      return svgUrl(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
        '<g fill-opacity=".6">' + glyphs + '</g>' +
        endMark(PAD - 8) + endMark(H - PAD + 8) + '</svg>');
    }
    var INSCRIPTION = { light: inscriptionSvg(TONE.light.rim), dark: inscriptionSvg(TONE.dark.rim) };

    /**
     * A horizontal rule broken by a centred diamond - the divider the design language keeps
     * reaching for (the old crest lines, the row markers, the inlay all use the same mark).
     * Drawn wide and thin so it can be scaled to any panel width with background-size.
     */
    function dividerSvg(fill) {
      var W = 240, H = 11, MY = 5.5;
      return svgUrl(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
        '<path d="M2 ' + MY + 'H92" stroke="' + fill + '" stroke-width="1" stroke-opacity=".42"/>' +
        '<path d="M120 ' + (MY - 5) + 'l5 5-5 5-5-5z" fill="' + fill + '" fill-opacity=".7"/>' +
        '<path d="M120 ' + (MY - 2.2) + 'l2.2 2.2-2.2 2.2-2.2-2.2z" fill="none" stroke="' + fill + '" stroke-opacity=".5"/>' +
        '<path d="M148 ' + MY + 'H238" stroke="' + fill + '" stroke-width="1" stroke-opacity=".42"/>' +
        '<path d="M6 ' + MY + 'h4M230 ' + MY + 'h4" stroke="' + fill + '" stroke-width="1.6" stroke-opacity=".6"/></svg>');
    }
    var DIVIDER = { light: dividerSvg(TONE.light.rim), dark: dividerSvg(TONE.dark.rim) };

    /* ================================================================ 3. preferences */

    var SOURCE = "dsh-client-ui-durandal";     // theme override layer identity
    var GATE = "data-dsh-skin";
    var GATE_ON = "durandal";
    var LAYER = "data-sk-layer";
    var NS = "durandal";

    /** key -> { def, kind } — one table for defaults, storage and the UI. */
    var SPEC = {
      enabled: { def: true, kind: "bool" },
      bg: { def: "art", kind: "enum", values: ["art", "plain"] },
      veil: { def: 0, kind: "int", min: 0, max: 90 },      // wallpaper veil strength
      blur: { def: 0, kind: "int", min: 0, max: 24 },      // wallpaper blur (px)
      showcase: { def: false, kind: "bool" },             // opt-in idle dimming
      idleDim: { def: 0, kind: "int", min: 0, max: 90 },
      motif: { def: true, kind: "bool" }                  // trim hairlines + crest details
    };
    var LS = {};
    for (var key in SPEC) LS[key] = "dsh-durandal." + key;

    var prefs = loadPrefs();
    var subscribers = [];
    var themeRef = null;
    var host = null;

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function ls() { try { return window.localStorage; } catch (err) { return null; } }

    function loadPrefs() {
      var store = ls(), out = {};
      for (var k in SPEC) {
        var spec = SPEC[k], raw = null;
        try { raw = store ? store.getItem(LS[k]) : null; } catch (err) { raw = null; }
        if (raw === null) { out[k] = spec.def; continue; }
        if (spec.kind === "bool") out[k] = raw === "1" || raw === "true";
        else if (spec.kind === "int") {
          var n = parseInt(raw, 10);
          out[k] = isFinite(n) ? clamp(n, spec.min, spec.max) : spec.def;
        } else out[k] = spec.values.indexOf(raw) >= 0 ? raw : spec.def;
      }
      return out;
    }
    function savePrefs() {
      var store = ls();
      if (!store) return;
      for (var k in SPEC) {
        if (!Object.prototype.hasOwnProperty.call(prefs, k)) continue;
        var v = prefs[k];
        try { store.setItem(LS[k], typeof v === "boolean" ? (v ? "1" : "0") : String(v)); } catch (err) { /* private mode */ }
      }
    }
    function notify() {
      for (var i = 0; i < subscribers.length; i++) {
        try { subscribers[i](); } catch (err) { /* a bad subscriber never breaks the skin */ }
      }
    }
    function subscribe(fn) {
      subscribers.push(fn);
      return function () { var i = subscribers.indexOf(fn); if (i >= 0) subscribers.splice(i, 1); };
    }

    /* ================================================================ 4. palette */

    /**
     * Alias-token overrides for both palettes, under ONE rule: LIGHT reads blue, DARK reads
     * gold, and every line, border and motif obeys it. In light the table stays clean and cool
     * (the artwork supplies the colour); in dark the gold is the ceremony. Only bg-base is
     * translucent - every elevated surface is opaque.
     *
     * bg-base carries NO constant. At veil 0 the conversation table is fully transparent, so
     * the illustration arrives at the strength its file was composed at and the whole depth of
     * the veil belongs to the slider; the fixed films that used to sit here and on html::after
     * are gone (see THE FRAME GUARD).
     */
    function buildTokens(p) {
      var v = clamp(p.veil, 0, 90) / 100;
      var base = p.bg === "art" ? clamp(v * 0.50, 0, 0.55) : 1;
      function rgba(rgb, a) { return "rgba(" + rgb + "," + Math.round(a * 1000) / 1000 + ")"; }

      return {
        /* --- surfaces: one translucent table, opaque elevations --- */
        "--dsw-alias-bg-base": { light: rgba("249,251,255", base), dark: rgba("11,17,32", base) },
        "--dsw-alias-bg-layer-1": { light: "#FFFFFF", dark: "#141C2F" },
        "--dsw-alias-bg-layer-2": { light: "#FFFFFF", dark: "#18213A" },
        "--dsw-alias-bg-layer-3": { light: "#FFFFFF", dark: "#1D2742" },
        "--dsw-alias-bg-overlay": { light: "#F4F7FD", dark: "#18213A" },
        "--dsw-alias-bg-module-platform": { light: rgba("255,255,255", 0), dark: rgba("20,28,47", 0) },
        "--dsw-alias-bg-skeleton": { light: "#EDF2FA", dark: "#1E2942" },
        "--dsw-alias-bg-mask-1": { light: "rgba(20,30,54,.30)", dark: "rgba(4,8,18,.6)" },
        "--dsw-alias-bg-multi-select": { light: "rgba(104,124,180,.18)", dark: "rgba(217,174,69,.16)" },

        /* --- text: navy-slate ink on white, champagne on navy --- */
        "--dsw-alias-label-primary": { light: "#111A2E", dark: "#F1E7D2" },
        "--dsw-alias-label-primary-dimmed": { light: "#19233C", dark: "#E6DBC2" },
        /* The one ink that is an ACCENT rather than body text: deep blue in light, the
           ceremony gold in dark. (It was cool blue in both, so the composer's placeholder,
           hint and secondary labels stayed cold on the navy panel.) */
        "--dsw-alias-label-primary-bluish": { light: "#17409F", dark: "#F0D691" },
        "--dsw-alias-label-primary-inverted": { light: "#FFFFFF", dark: "#101828" },
        "--dsw-alias-label-primary-foreground": { light: "#FFFFFF", dark: "#101828" },
        /* The ink ramp, and the whole reason this file has ONE rule: light is a cool navy
           slate ladder, so dark has to be its warm counterpart - a champagne ladder of the
           same steps. It was not: primary was warm while every other step stayed cool blue,
           which is what made secondary text and placeholders read blue in dark mode. */
        "--dsw-alias-label-secondary": { light: "#2A3750", dark: "#DCC9A4" },
        "--dsw-alias-label-tertiary": { light: "#47587A", dark: "#C4AE86" },
        "--dsw-alias-label-caption": { light: "#647395", dark: "#A89070" },
        "--dsw-alias-label-dimmed": { light: "#525F80", dark: "#B49C78" },

        /* --- borders: one ladder, two palettes. LIGHT is the same cool silver-blue as the trim
           family below (same alpha steps, only the hue moves); DARK is the ceremony gold. --- */
        "--dsw-alias-border-l1": { light: "rgba(104,124,180,.24)", dark: "rgba(232,197,106,.14)" },
        "--dsw-alias-border-l2": { light: "rgba(104,124,180,.36)", dark: "rgba(232,197,106,.20)" },
        "--dsw-alias-border-l2-darkmode-thin": { light: "rgba(104,124,180,.36)", dark: "rgba(232,197,106,.14)" },
        "--dsw-alias-border-l3": { light: "rgba(104,124,180,.48)", dark: "rgba(232,197,106,.28)" },
        "--dsw-alias-border-l4": { light: "rgba(104,124,180,.60)", dark: "rgba(232,197,106,.38)" },
        "--dsw-alias-border-inverted": { light: "rgba(255,255,255,.6)", dark: "rgba(16,24,40,.62)" },
        "--dsw-alias-border-inverted2": { light: "rgba(0,0,0,0)", dark: "rgba(255,247,230,.08)" },

        /* --- brand + buttons: the same one rule. LIGHT is royal blue for every action,
           DARK is the ceremony gold for every action - actions included, not only trim. --- */
        "--dsw-alias-brand-primary": { light: "#2F5FD0", dark: "#E0BC55" },
        "--dsw-alias-brand-primary-new-colorprimary-new-color": { light: "#2F5FD0", dark: "#E0BC55" },
        "--dsw-alias-brand-text": { light: "#1B3781", dark: "#F0D691" },
        "--dsw-alias-brand-primary-invert": { light: "#FFFFFF", dark: "#101828" },
        "--dsw-alias-button-primary-fill": { light: "#2F5FD0", dark: "#E0BC55" },
        "--dsw-alias-button-primary-hover": { light: "#3D6EDE", dark: "#EBCB6B" },
        "--dsw-alias-button-primary-dimmed": { light: "#C9D8F5", dark: "#3A3218" },
        /* The composer's SEND button reads this pair, and the skin had never overridden it -
           which is exactly why the input area stayed DeepSeek blue in dark mode. */
        "--dsw-alias-button-info-fill": { light: "#2F5FD0", dark: "#E0BC55" },
        "--dsw-alias-button-info-hover": { light: "#3D6EDE", dark: "#EBCB6B" },
        "--dsw-alias-button-ghost-active-fill": { light: "rgba(47,95,208,.14)", dark: "rgba(217,174,69,.18)" },
        "--dsw-alias-button-ghost-active-border": { light: "rgba(47,95,208,.34)", dark: "rgba(217,174,69,.40)" },
        "--dsw-alias-interactive-bg-hover": { light: "rgba(47,95,208,.08)", dark: "rgba(217,174,69,.10)" },
        "--dsw-alias-interactive-bg-active": { light: "rgba(47,95,208,.15)", dark: "rgba(217,174,69,.17)" },
        "--dsw-alias-interactive-bg-hover-accent": { light: "rgba(104,124,180,.20)", dark: "rgba(217,174,69,.16)" },
        "--dsw-alias-interactive-bg-hover-solid": { light: "#EEF3FD", dark: "#1B2440" },

        /* --- code: readable panels by default; the transcript clears them via CSS --- */
        "--dsw-alias-markdown-code-block": { light: "rgba(255,255,255,.92)", dark: "rgba(12,20,36,.92)" },
        "--dsw-alias-markdown-code-block-banner": { light: "rgba(244,247,253,.98)", dark: "rgba(24,33,58,.98)" },
        "--dsw-alias-markdown-inline-code": { light: "rgba(238,243,253,.6)", dark: "rgba(30,41,68,.6)" },
        "--dsw-alias-markdown-tag": { light: "rgba(230,238,252,.62)", dark: "rgba(38,51,84,.62)" },
        "--dsw-alias-markdown-citation": { light: "#2F5FD0", dark: "#F0D691" },
        "--dsw-alias-markdown-placeholder": { light: "#C9D6EE", dark: "#4A4029" },

        /* --- scrollbars, states, menus --- */
        "--dsw-alias-scrollbar-bg-l1": { light: "rgba(47,95,208,.24)", dark: "rgba(217,174,69,.22)" },
        "--dsw-alias-scrollbar-hover-l1": { light: "rgba(47,95,208,.44)", dark: "rgba(217,174,69,.44)" },
        "--dsw-alias-scrollbar-bg-l2": { light: "rgba(47,95,208,.30)", dark: "rgba(217,174,69,.28)" },
        "--dsw-alias-scrollbar-hover-l2": { light: "rgba(47,95,208,.52)", dark: "rgba(217,174,69,.52)" },
        /* The composer's caret, its pending dot and the workspace-trigger outline all read
           this token, so it is an accent in practice - gold in dark. */
        "--dsw-alias-state-business-primary": { light: "#2F5FD0", dark: "#F0D691" },
        "--dsw-alias-state-success-primary": { light: "#1F8A5B", dark: "#5FD0A0" },
        "--dsw-alias-state-warn-primary": { light: "#B08A22", dark: "#E8C56A" },
        "--dsw-alias-state-warn-label": { light: "#8A5E0A", dark: "#E8A93A" },
        "--dsw-alias-state-error-primary": { light: "#C0392B", dark: "#FF8A7A" },
        "--dsw-alias-toast-bg": { light: "#1E2A44", dark: "#141C2F" },
        "--dsw-alias-toast-label": { light: "#F7F2E4", dark: "#F7F2E4" },
        "--dsw-alias-tooltip-bg": { light: "#17223A", dark: "#141C2F" },
        "--dsw-alias-tooltip-key-bg": { light: "#26344F", dark: "#26344F" },
        "--dsw-alias-menu-icon": { light: "#2A3750", dark: "#E6DBC2" },
        "--dsw-alias-menu-group-header-fill": { light: "rgba(255,255,255,.99)", dark: "rgba(24,33,58,.99)" },
        "--dsw-alias-switch-thumb": { light: "#FFFFFF", dark: "#E8C56A" },
        "--dsw-menu-surface-fill": { light: "rgba(255,255,255,.99)", dark: "rgba(22,30,52,.99)" },
        "--dsw-alias-label-shimmer": { light: "rgba(30,42,68,.30)", dark: "rgba(255,247,230,.42)" },
        "--dsw-alias-label-deep-diving": { light: "#1F4FBF", dark: "#F0D691" },
        "--dsw-alias-label-deep-diving-shimmer": { light: "rgba(31,79,191,.36)", dark: "rgba(240,214,145,.46)" },
        "--dsw-alias-label-document-preview": { light: "#2A3750", dark: "#DCC9A4" },
        "--dsw-alias-bg-document-preview": { light: "#F4F7FD", dark: "#141C2F" },

        /* --- THE FRAME GUARD -------------------------------------------------------
           On Windows the shell paints the whole window frame with this token
           ([data-windows-titlebar] .BynINW_frame), so any non-zero value here lays a film
           over the artwork everywhere: at 0.80 it covered the illustration outright, and the
           "thin" 0.26/0.30 that replaced it still cost the art a fifth of its light. It is
           now zero - the frame and the titlebar strip show the illustration directly.
           Safe because this token does NOT own the sidebar: it is also bound to
           .BynINW_sidebarCol, but the stylesheet overrides [class*="_sidebarCol"] with the
           skin-owned --sk-panel (0.86) at higher specificity, so the column keeps its own
           opaque panel. Do not delete this key - dropping it would let the app's own
           opaque default back in. --- */
        "--dsw-specific-sidebar-fill": { light: rgba("255,255,255", 0), dark: rgba("16,22,38", 0) },
        "--dsw-specific-input-major": { light: rgba("255,255,255", clamp(0.78 + v * 0.18, 0.78, 0.96)), dark: rgba("20,28,48", clamp(0.78 + v * 0.18, 0.78, 0.96)) },
        "--dsw-specific-bubble": { light: rgba("255,255,255", 0), dark: rgba("20,28,47", 0) },
        "--dsw-specific-bubble-highlight": { light: "rgba(47,95,208,.12)", dark: "rgba(217,174,69,.14)" },
        "--dsw-specific-selector": { light: "#F4F7FD", dark: "#18213A" },
        "--dsw-specific-menu": { light: "#FFFFFF", dark: "#161F36" },

        /* --- skin-owned variables --- */
        "--dsw-focus-ring-color": { light: "#2F5FD0", dark: "#F0D691" },
        "--sk-gold": { light: "#5C72AE", dark: "#E0BC55" },
        "--sk-gold-soft": { light: "rgba(104,124,180,.62)", dark: "rgba(217,174,69,.55)" },
        /* The trim family: LIGHT reads cool silver-blue (a bright gold simply vanishes on the
           pale parchment), DARK reads the ceremony gold - the one rule, applied to every line
           in the set, so the four-layer trim, the inlay and the inscription always agree. */
        "--sk-edge": { light: "rgba(104,124,180,.74)", dark: "rgba(217,174,69,.60)" },
        "--sk-accent-line": { light: "rgba(84,106,168,.58)", dark: "rgba(232,197,106,.45)" },
        "--sk-edge-soft": { light: "rgba(104,124,180,.34)", dark: "rgba(217,174,69,.22)" },
        /* The skin's OWN panel controls (the preset button, the segmented control, the range
           and switch accents) follow the same rule as the CTA banner: the palette's action
           blue in light, the ceremony gold in dark. The app's own brand tokens are left
           alone - a gold focus ring or scrollbar would be worse, not more coherent. */
        "--sk-control": { light: "#2F5FD0", dark: "#F5D877" },
        "--sk-control-ink": { light: "#FFFFFF", dark: "#2B2416" },
        /* Neutral translucent whites, not accents: the sidebar's small control tiles and the
           white companion line inside the 镶边. On the navy panel they have to fall to a faint
           wash - hardcoded white tiles were the one thing that still looked pasted on in dark. */
        "--sk-tile": { light: "rgba(255,255,255,.6)", dark: "rgba(255,255,255,.07)" },
        "--sk-tile-hover": { light: "rgba(255,255,255,.92)", dark: "rgba(255,255,255,.13)" },
        "--sk-trim-companion": { light: "rgba(255,255,255,.55)", dark: "rgba(255,255,255,.12)" },
        /* --- surfaces + artwork as {light,dark} pairs ------------------------------------
           These used to be written by JS from an isDark() guess, which once flipped the whole
           light UI to the dark veil. As tokens the app itself picks the value, and the
           stylesheet only has to ask "is this a dark session?" via :has(). --- */
        "--sk-panel": { light: "rgba(255,255,255,.86)", dark: "rgba(14,20,36,.86)" },
        "--sk-panel-sheen": {
          light: "linear-gradient(165deg,rgba(255,255,255,.70),rgba(232,240,252,.35))",
          dark: "linear-gradient(165deg,rgba(34,46,76,.55),rgba(12,18,32,.20))"
        },
        "--sk-surface": { light: "#FFFFFF", dark: "#0F1626" },
        /* The one place prose stops riding the illustration and sits on a fill: the user's
           question and the assistant's own prose (the final answer among it). Everything
           between them - reasoning, tool calls, results - stays transparent, so the art is
           only ever interrupted where there is something to read. A SURFACE, so it is
           deliberately absent from the palette-polarity set. */
        "--sk-flow-solid": { light: rgba("255,255,255", .62), dark: rgba("14,20,36", .58) },
        "--sk-halo": { light: "rgba(255,255,255,.5)", dark: "rgba(4,8,18,.62)" },
        "--sk-crest": { light: 'url("' + CREST_MARK + '")', dark: 'url("' + CREST_MARK_GOLD + '")' },
        "--sk-panel-crest": { light: 'url("' + CREST_SVG + '")', dark: 'url("' + CREST_SVG_GOLD + '")' },
        "--sk-inlay": { light: 'url("' + INLAY_SVG + '")', dark: 'url("' + INLAY_SVG_GOLD + '")' },
        "--sk-inscription": { light: 'url("' + INSCRIPTION.light + '")', dark: 'url("' + INSCRIPTION.dark + '")' },
        "--sk-divider": { light: 'url("' + DIVIDER.light + '")', dark: 'url("' + DIVIDER.dark + '")' },
        /* NOTE: the artwork URLs are NOT tokens. Tokens land on <body>, and the wallpaper is
           html::before - not a descendant of body - so it could never read them. applyVars()
           writes both URLs on <html> and CSS picks one with :has(). */
        /* the sidebar's own nav-item states: this is what paints the ACTIVE session row */
        "--dsw-specific-sidebar-nav-item-hover": { light: "rgba(104,124,180,.14)", dark: "rgba(217,174,69,.14)" },
        "--dsw-specific-sidebar-nav-item-active": { light: "rgba(104,124,180,.20)", dark: "rgba(16,24,42,.88)" },
        "--dsw-specific-sidebar-nav-item-active-accent": { light: "#24479E", dark: "#F0D691" }
      };
    }

    /* ================================================================ 5. stylesheet */

    var G = 'html[' + GATE + '="' + GATE_ON + '"]';
    var CSS = [

      /* ---- wallpaper: behind everything, never interactive ---- */
      G + '::before,' + G + '::after{content:"";position:fixed;inset:-40px;z-index:-1;pointer-events:none;background-repeat:no-repeat}',
      G + '::before{z-index:-2;pointer-events:none;background-image:var(--sk-art-light,none);background-size:cover;',
      'background-position:var(--sk-pos,58% center);filter:blur(var(--sk-blur,0px))}',
      /* the palette is picked from the app's own attribute: CSS cannot disagree with the app */
      G + '[data-sk-scheme="dark"]::before{pointer-events:none;background-image:var(--sk-art-dark,none)}',
      /* The veil is a PREFERENCE, not a constant. There used to be a fixed .12 (light) / .05
         (dark) wash sitting under the slider, so the illustration never arrived at the
         strength its own file was composed at. That constant is gone. At veil 0 the wallpaper
         IS the illustration; the slider still lays the whole wash on demand. */
      G + '::after{pointer-events:none;background:rgba(255,255,255,calc(var(--sk-veil-a,0) * .95))}',
      G + '[data-sk-scheme="dark"]::after{pointer-events:none;background:rgba(6,10,20,calc(var(--sk-veil-a,0) * 1.15))}',
      G + '[data-sk-bg="plain"]::before,' + G + '[data-sk-bg="plain"]::after{display:none;pointer-events:none}',

      /* ---- empty state: no hero chrome, and the composer docks at the bottom --------------
         A fresh conversation is the ONE screen where the illustration has nothing to say
         against, and the app fills it: HeroShell (the whale, the "探索未至之境" headline, the
         preview badge) plus a hero-only workspace chip row, stacked in the middle with the
         input card centred underneath. We want the art alone, and the card at the bottom.

         In the hero phase the composer stack's children are exactly
         [HeroShell, heroWorkspaceRow, dock?, inputBar], so HeroShell is the FIRST child - and
         hitting it by position is deliberate: the app's own class carries a build hash
         (Hqq-bq_root) and private internals, whereas the position in the stack is the part
         the two phases actually differ by. Hide the whole root, not just the headline:
         HeroShell's root is height:100%, so a hidden headline would leave an empty block
         filling the stack.

         The card docks with margin-top:auto, NOT position:sticky. Sticky only stops a box
         scrolling off the top of its container - it never pushes one down, so it is inert in
         a short scrollport and, paired with justify-content:flex-start, would park the card
         at the TOP. An auto margin absorbs the free space before justify-content is consulted.

         No fill is added to the seat: the app scopes its dock gradient to [data-phase=active],
         and leaving that alone is what keeps this a floating card instead of a bottom bar. */
      G + ' [data-phase="hero"] [class*="_composerStack"] > :first-child{display:none}',
      G + ' [data-phase="hero"] [class*="_heroWorkspaceRow"]{display:none}',
      G + ' [data-phase="hero"] [class*="_composerSeat"]{margin-top:auto}',
      G + ' [class*="_composerHero"]{padding-bottom:0}',

      /* ---- sidebar: light parchment, cool hairlines, one solid tile for the CTA ---- */
      G + ' [class*="_sidebarCol"]{background-color:var(--sk-panel,rgba(255,255,255,.8));',
      /* Ornament, in ONE layer list: the crest watermark, the panel sheen, then the rim
         inscription down the right edge. Background layers are inert by nature - nothing here
         is hit-testable - which is also why the inscription is a drawn SVG plate rather than
         live text: the app's own sidebar rule is `position:static` (it declares no position),
         so a positioned pseudo-element would have no containing block to anchor to, and the
         column clips at `overflow:hidden` regardless. */
      'background-image:var(--sk-divider,none),var(--sk-crest,none),var(--sk-panel-sheen,none);',
      'background-repeat:no-repeat,no-repeat,no-repeat;',
      'background-position:center bottom 226px,center bottom 34px,center center;',
      'background-size:62% auto,156px 156px,auto;',
      'border-right-color:var(--dsw-alias-border-l3);',
      /* 镶边: cool hairline, a white companion, one whisper of accent, soft inner line */
      'box-shadow:inset -1px 0 0 0 var(--sk-edge,rgba(104,124,180,.74)),',
      'inset -2px 0 0 0 var(--sk-trim-companion,rgba(255,255,255,.55)),',
      'inset -3px 0 0 0 var(--sk-accent-line,rgba(84,106,168,.58)),',
      'inset -4px 0 0 0 var(--sk-edge-soft,rgba(104,124,180,.34))}',
      /* DARK MODE: every sidebar label is ceremony gold, matching the rest of the skin. Scoped
         to the column, and the banner's own button-scoped re-bind still outranks it. */
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"]{',
      '--dsw-alias-label-primary:#F0D691!important;--dsw-alias-label-primary-dimmed:#E8C56A!important;',
      '--dsw-alias-label-secondary:#DCC08A!important;--dsw-alias-label-tertiary:#C9A96A!important;',
      '--dsw-alias-label-caption:#B08F52!important;--dsw-alias-label-dimmed:#C2A468!important;',
      '--dsw-alias-label-quaternary:#B08F52!important;--dsw-alias-label-quinary:#C9A96A!important;',
      '--dsw-alias-menu-icon:#E8C56A!important;--dsw-alias-brand-text:#E8C56A!important;',
      '--dsw-alias-link:#F0D691!important;--dsw-alias-state-business-primary:#E8C56A!important;',
      '--dsw-specific-sidebar-nav-item-active-accent:#F0D691!important}',
      /* The session list is a SEPARATE component (ui-workspace) with its own classes, and its
         selected row is painted with --dsw-alias-link. Name those classes and force the ink.
         One selector list, not two: this block used to spell the identical :where() twice.
         `_panelRow` is gone - it does not exist in the current DSH build. */
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"] :where([class*="_sessionRow"],[class*="_sessionRow"] *,',
      '[class*="_projectRow"],[class*="_projectRow"] *,[class*="_sectionLabel"],[class*="_title"],',
      '[class*="_titleIcon"],[class*="_rowActions"] *){',
      'color:#F0D691!important}',


      G + ' [class*="_sidebarCol"] :where(button,[role="button"],[role="treeitem"],a[href]){',
      'border-radius:8px;transition:box-shadow .15s ease,background-color .15s ease}',
      G + ' [class*="_sidebarCol"] :where(button,[role="button"],[role="treeitem"],a[href]):hover{',
      'box-shadow:inset 0 0 0 1px var(--sk-gold-soft)}',
      G + '[data-sk-motif] [class*="_sidebarCol"] :where([class*="tabActive"],[aria-selected="true"],[aria-current]){',
      'background-color:rgba(104,124,180,.30);box-shadow:inset 3px 0 0 0 var(--sk-gold),inset 0 0 0 1px var(--sk-edge,rgba(104,124,180,.74))}',
      /* the selected row's wash follows the same rule as everything else: cool in light, warm in dark */
      G + '[data-sk-scheme="dark"][data-sk-motif] [class*="_sidebarCol"] :where([class*="tabActive"],[aria-selected="true"],[aria-current]){',
      'background-color:rgba(217,174,69,.20)}',
      /* Section headings in the sidebar take the same diamond as the inlay motif and the row
         markers, so the list reads as an engraved index rather than a stack of labels. */
      G + '[data-sk-motif] [class*="_sidebarCol"] [class*="_sectionLabel"]::before{content:"\\25C6 ";',
      'color:var(--sk-gold);font-size:7px;vertical-align:1px;pointer-events:none}',
      /* the primary action: a solid ceramic tile in the palette's own action colour - blue in
         light, ceremony gold in dark. The text re-bind is scoped to the BUTTON only -
         re-binding it on the whole column once turned the brand badge into dark text on a
         dark fill. */
      /* A ceremony banner, not a rounded rectangle: the ends are cut to points and a hairline
         frame follows the silhouette. clip-path only affects this button's own hit area.
         LIGHT: the palette's own action blue. DARK: the ceremony gold (a blue tile would fight
         the navy + gold sidebar). One gate decides, and it is the scheme attribute. */
      G + ' [class*="_sidebarCol"] button[class*="_newSession"],',
      G + ' [class*="_sidebarCol"] [class*="_newSession"] button{',
      'position:relative;letter-spacing:.04em;',
      'clip-path:polygon(15px 0,calc(100% - 15px) 0,100% 50%,calc(100% - 15px) 100%,15px 100%,0 50%);',
      'background-color:var(--sk-control,#3A69DC)!important;',
      'background-image:linear-gradient(180deg,#5480E8 0%,var(--sk-control,#3A69DC) 44%,#2C5ACB 100%)!important;',
      'border:0!important;',
      '--dsw-alias-label-primary:#FFFFFF!important;--dsw-alias-label-secondary:#EDF3FF!important;',
      '--dsw-alias-label-tertiary:#DCE7FF!important;--dsw-alias-label-primary-inverted:#FFFFFF!important;',
      '--dsw-alias-menu-icon:#FFFFFF!important;',
      'box-shadow:none!important}',
      G + ' [class*="_sidebarCol"] button[class*="_newSession"]:hover,',
      G + ' [class*="_sidebarCol"] [class*="_newSession"] button:hover{',
      'background-image:linear-gradient(180deg,#6A91F0 0%,#4A78E4 44%,#3767D8 100%)!important}',
      G + ' [class*="_sidebarCol"] button[class*="_newSession"]::before,',
      G + ' [class*="_sidebarCol"] [class*="_newSession"] button::before{content:"";position:absolute;inset:3px;',
      'pointer-events:none;border:1px solid rgba(255,255,255,.45);',
      'clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 50%,calc(100% - 13px) 100%,13px 100%,0 50%)}',
      /* DARK: the same banner in ceremony gold, with espresso lettering */
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"] button[class*="_newSession"],',
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"] [class*="_newSession"] button{',
      'background-color:var(--sk-control,#F5D877)!important;',
      'background-image:linear-gradient(180deg,#FFF6CE 0%,#FBE7A0 44%,#F2D264 100%)!important;',
      '--dsw-alias-label-primary:#2B2416!important;--dsw-alias-label-secondary:#332A18!important;',
      '--dsw-alias-label-tertiary:#3E3319!important;--dsw-alias-label-primary-inverted:#2B2416!important;',
      '--dsw-alias-menu-icon:#2B2416!important}',
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"] button[class*="_newSession"]:hover,',
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"] [class*="_newSession"] button:hover{',
      'background-image:linear-gradient(180deg,#FFFCE8 0%,#FDF0BE 44%,#F7DD82 100%)!important}',
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"] button[class*="_newSession"]::before,',
      G + '[data-sk-scheme="dark"] [class*="_sidebarCol"] [class*="_newSession"] button::before{',
      'pointer-events:none;border-color:rgba(122,88,16,.42)}',
      G + ' [class*="_sidebarCol"] button[class*="_newSession"] *{background-color:transparent!important;background-image:none!important}',
      /* small controls: tiles that are white on the parchment and a faint wash on the navy */
      G + ' [class*="_sidebarCol"] [class*="_iconButton"],',
      G + ' [class*="_sidebarCol"] [class*="_footerActions"] :where(button,[role="button"]){',
      'background-color:var(--sk-tile,rgba(255,255,255,.6))!important;border:1px solid var(--dsw-alias-border-l2)!important;border-radius:8px!important}',
      G + ' [class*="_sidebarCol"] [class*="_iconButton"]:hover,',
      G + ' [class*="_sidebarCol"] [class*="_footerActions"] :where(button,[role="button"]):hover{background-color:var(--sk-tile-hover,rgba(255,255,255,.92))!important;border-color:var(--sk-gold-soft,rgba(104,124,180,.62))!important}',
      /* The build badge / brand chip is a dark tile so its text stays readable on either
         panel. Its INK follows the palette rule - cool on the tile in light, gold in dark -
         instead of sitting at gold in both, which read as a stray warm speck on the
         parchment. */
      G + ' [class*="_buildVersion"],' + G + ' [class*="_localBuildBrand"],' + G + ' [class*="_localBuildTitle"],',
      G + ' [data-slot="sidebar.toggle.badge"]{',
      'background:#1E2A44!important;color:#DCE7FF!important;border-color:rgba(104,124,180,.45)!important;border-radius:4px!important}',
      G + ' [class*="_buildVersion"] *,' + G + ' [data-slot="sidebar.toggle.badge"] *{color:#DCE7FF!important;background:transparent!important}',
      G + '[data-sk-scheme="dark"] [class*="_buildVersion"],' + G + '[data-sk-scheme="dark"] [class*="_localBuildBrand"],',
      G + '[data-sk-scheme="dark"] [class*="_localBuildTitle"],',
      G + '[data-sk-scheme="dark"] [data-slot="sidebar.toggle.badge"]{',
      'color:#F0D691!important;border-color:rgba(232,197,106,.4)!important}',
      G + '[data-sk-scheme="dark"] [class*="_buildVersion"] *,' + G + '[data-sk-scheme="dark"] [data-slot="sidebar.toggle.badge"] *{color:#F0D691!important}',

      /* ---- transcript: no fills anywhere, prose rides on the artwork ---- */
      G + ' [data-chat-flow-kind],' + G + ' [data-chat-flow],' + G + ' [data-chat-turn],' + G + ' [data-chat-group-part],',
      G + ' [data-step-process-body],' + G + ' [data-step-process-content],' + G + ' [data-turn-process-inline],',
      G + ' [data-turn-process-answer],' + G + ' [data-submission-echo],' + G + ' [data-chat-anchor-key],',
      G + ' [data-conversation-content] [class*="_bubble"],',
      /* :not([data-composer-card]) is load-bearing, not tidiness. [data-conversation-content] is
         the element the app calls _body, and in the hero phase the composer seat is one of ITS
         children - so this blanket, which is about the transcript, also reaches the input card.
         The card's class is <hash>_card, which the [class*="_card"] substring matches, and the
         !important below then erased both the app's own fill (--dsw-specific-input-major) and
         the corner ticks this very stylesheet draws on it. That went unnoticed for as long as
         the artwork was dim enough that a see-through card still looked dark; the moment the
         films came off, the placeholder text was sitting on the illustration. */
      G + ' [data-conversation-content] [class*="_card"]:not([data-composer-card]),',
      G + ' [data-conversation-content] [class*="_panel"],' + G + ' [data-conversation-content] [class*="_quote"],',
      G + ' [data-conversation-content] [class*="_citation"],' + G + ' [data-conversation-content] blockquote,',
      G + ' [data-presented-file],' + G + ' [data-presented-files-row],' + G + ' [data-presented-description],' + G + ' [data-changed-files],',
      G + ' :has(> [data-presented-file]):not(body){',
      'background-color:transparent!important;background-image:none!important;box-shadow:none;border-color:transparent!important}',
      G + ' [data-conversation-content] pre,' + G + ' [data-conversation-content] [data-code-block-banner],',
      G + ' [data-conversation-content] [class*="_code"],' + G + ' [data-diff-code],' + G + ' [data-diff-hunk-header],',
      G + ' [data-diff-line],' + G + ' [data-diff-note],' + G + ' [data-review-wrap],' + G + ' [data-review-tool],',
      G + ' [data-review-view],' + G + ' [data-review-file],' + G + ' [data-changes-review]{',
      'background-color:transparent!important;background-image:none!important;box-shadow:none;border-color:transparent!important}',
      G + ' [data-diff-line][class*="_added"]{box-shadow:inset 2px 0 0 0 rgba(47,125,90,.6)}',
      G + ' [data-diff-line][class*="_deleted"]{box-shadow:inset 2px 0 0 0 rgba(178,58,46,.6)}',

      /* ---- the two rows that ONCE stopped riding the artwork ----------------------------
         Everything above is transparent so the illustration reads through it; the question and
         the assistant's answer are the exceptions, being the two things a reader comes back to
         read. Both need the [data-conversation-content] ancestor: the blanket rule matches
         [data-chat-flow-kind], [data-chat-anchor-key] and [data-turn-process-answer] on the
         SAME element, so an equal-specificity exception would lose to it.

         The question is filled on its BUBBLE - that carries the app's own radius and padding,
         and hugs the text; the answer takes a radius and padding of its own, the one place
         this skin takes layout space inside the transcript.

         THE FOLD GUARD. `assistant-step` does not mean "the answer": every row of the turn's
         work fold is one too (reasoning, the narration between tool calls). Filling them all
         drew the folded-away work as a stack of EMPTY navy pills - a turn with a dozen steps
         stacked into ~300px of slab down the middle of the transcript. What makes such a row
         invisible-but-sized is hidden="until-found", which the UA maps to
         content-visibility:hidden: the CONTENT goes, the BOX stays, and the app gives a folded
         row no height of its own - so this rule's 12px of padding was the only thing making it
         24px tall. `:not(:empty)` cannot catch that: the row keeps its text, it is merely not
         painted. The guard has to be an attribute, and `data-turn-process-member="true"` is
         the only one that holds in BOTH fold states (collapsed, work rows also carry `hidden`
         and `data-turn-process-hidden`; expanded, they carry neither). The answer is matched
         by kind as well, because [data-turn-process-answer] is rendered only while the fold is
         collapsed (compactAnswer && !processOpen). */
      G + ' [data-conversation-content] :is([data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]) [class*="_bubble"]{',
      'background-color:var(--sk-flow-solid)!important}',
      G + ' [data-conversation-content] :is([data-chat-flow-kind="assistant-step"],[data-turn-process-answer],',
      '[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]){',
      'transition:background-color .3s ease}',
      /* No comma at the end of the line above: this element is ONE expression, and a comma
         there would leave the continuation as an array element of its own - `+ '...'`, a unary
         plus on a string, i.e. NaN spliced into the selector, which parses and never matches. */
      /* ONE surface, phase-free and box-free.
         Phase-free: ui-chat marks the live row with data-streaming and, during the turn, with
         data-turn-process-member - while the answer marker only appears once the turn ends.
         Any rule keyed on those would change the surface mid-turn, which is exactly the late
         fill and the jump at completion. Keying on the KIND alone means the same element gets
         the same surface from its first token to its last.
         Box-free: no padding, no radius. A folded work row keeps its box but paints nothing,
         so padding was the only thing that ever turned the fold into a stack of slabs. */
      G + ' [data-conversation-content] :is([data-chat-flow-kind="assistant-step"],[data-turn-process-answer]){',
      'background-color:var(--sk-flow-solid)!important}',
      /* Legibility on a busy illustration: a hairline halo, no block. Only the WORK rows need
         it - the question and the answer sit on fills - and the fold guard is repeated here,
         or this exemption would strip the halo off the one kind of row still riding the art. */
      G + ' [data-chat-flow-kind] [class*="_markdown_"],' + G + ' [data-chat-flow-kind] p,' + G + ' [data-chat-flow-kind] li,',
      G + ' [data-chat-flow-kind] pre,' + G + ' [data-chat-flow-kind] code,' + G + ' [data-diff-code]{',
      'text-shadow:0 1px 1px var(--sk-halo)}',
      /* the two rows that sit on the wash are exempt: a halo over a surface only muddies */
      G + ' [data-conversation-content] :is([data-chat-flow-kind="user"],[data-chat-flow-kind="steering"],',
      '[data-chat-flow-kind="assistant-step"]:not([data-turn-process-member]),[data-turn-process-answer]) :is(p,li,pre,code,[class*="_markdown_"]){',
      'text-shadow:none}',

      /* ---- wide tables stay INSIDE the answer card ------------------------------------
         The app widens a table of four columns or more ON PURPOSE, and against a transparent
         answer nobody can see it: ui-chat's AssistantMarkdown.module.css gives .md-table-wide
         --dsh-table-spare (half the gutter the message column leaves in the chat container)
         and --dsh-table-lead, then sets width:calc(100% + lead + spare) with a negative left
         margin and a matching padding-left, so the table bleeds sideways and stops at the
         container's right edge while its content stays aligned with the prose.
         Against THIS skin's solid answer that bleed is the whole bug: measured off the
         screenshot, the card ran x852-1700 while the table's hairlines ran 871-1834 - the
         last column, its header and four row rules painted straight over the illustration.
         Zeroing both tokens is enough: lead and spare go to 0, so the app's own calc()
         resolves to width:100% with no offset, and the app's hover-to-scroll behaviour is
         left alone because overflow-x is not touched. No !important here - the G prefix plus
         [data-conversation-content] outranks the app's `.v5IAXa_body .md-table-wide`, and
         verify's lint reserves !important for colour work anyway. */
      G + ' [data-conversation-content] .md-table-wide{',
      '--dsh-table-spare:0px;--dsh-table-lead:0px;width:100%;max-width:100%;margin-left:0;padding-left:0}',
      /* ...and the table may come down to the card instead of holding its max-content width
         (the app pins it to exactly that). The auto layout then hands each column what it
         needs, with the app's own 100px cell floor as the limit; a table too wide even for
         that - enough columns that their floors add up past the card - overflows the wrapper
         and scrolls on hover, which is what the app wants for that case. */
      G + ' [data-conversation-content] .md-table-wide>table{max-width:100%}',

      /* ---- elevated surfaces: settings, dialogs, menus, popovers stay SOLID ---- */
      G + ' [aria-modal="true"] [class*="_panel"],' + G + ' [aria-modal="true"] [class*="_section"],',
      G + ' [aria-modal="true"] [class*="_content"],' + G + ' [data-modal-autofocus],',
      G + ' [role="menu"],' + G + ' [role="listbox"],' + G + ' [class*="_popover"],' + G + ' [data-changes-hover-preview]{',
      'background-color:var(--sk-surface,#FFFFFF)!important}',

      /* ---- trim accents (motif gate) ---- */
      /* The conversation column carries the same trim, so both panels read as one frame.
         NOTE: this rule and the next one are TWO rules. They used to share one declaration
         block with a comma between them, which left a selector sitting inside the box-shadow
         value - the block never parsed, and the centre trim, its inlay, the code-block banner
         and the composer focus ring all silently disappeared. Keep each rule whole. */
      G + '[data-sk-motif] [class*="_centerCol"]{box-shadow:inset 0 0 0 1px var(--sk-edge-soft,rgba(104,124,180,.34))}',
      /* The nameplate lives HERE now, not on the sidebar. A background layer sits UNDER the
         panel's own content, so on the sidebar the session rows painted over the letters; the
         conversation column's left gutter is empty at every height, and it is directly across
         the frame line - the other side of the 右边线. */
      G + ' [class*="_centerCol"]{',
      'background-image:var(--sk-inscription,none),var(--sk-inlay,none);',
      'background-repeat:no-repeat,repeat-y;',
      'background-position:left 14px center,right 4px top 0;',
      'background-size:auto,14px 62px}',

      G + '[data-sk-motif] [data-code-block-banner]{border-left:3px solid var(--sk-gold)}',
      G + '[data-sk-motif] [data-composer-card]:focus-within{box-shadow:0 0 0 1px var(--sk-gold-soft)}',
      /* The input card carries one seal: a hairline that gathers in the middle and fades at
         both ends, laid on its top edge. It is the only ornament on a solid surface here, and
         it is safe to position because the app's own rule for the card is position:relative
         and leaves ::before unused. */
      G + ' [data-composer-card]::before{content:"";position:absolute;top:-1px;left:50%;width:180px;height:3px;',
      'transform:translateX(-50%);pointer-events:none;border-radius:2px;',
      'background-image:linear-gradient(90deg,transparent,var(--sk-gold) 50%,transparent),',
      'linear-gradient(90deg,transparent,var(--sk-edge,rgba(104,124,180,.74)) 16%,',
      'transparent 34%,transparent 66%,var(--sk-edge,rgba(104,124,180,.74)) 84%,transparent);',
      'background-repeat:no-repeat;background-position:center,center;background-size:24px 3px,100% 1px}',
      /* and the four corners of the input card take the same ticks the panels carry */
      G + ' [data-composer-card]{',
      'background-image:',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34)));',
      'background-repeat:no-repeat;',
      'background-position:left 9px top 9px,left 9px top 9px,right 9px top 9px,right 9px top 9px,',
      'left 9px bottom 9px,left 9px bottom 9px,right 9px bottom 9px,right 9px bottom 9px;',
      'background-size:20px 1px,1px 20px,20px 1px,1px 20px,20px 1px,1px 20px,20px 1px,1px 20px}',
      /* The composer card's own fill is NOT set here: the app already paints it with
         --dsw-specific-input-major, which the skin owns and which is already a scheme-aware
         pair. A hardcoded white here (there used to be one, ungated) would have made the
         input a white slab on the navy panel. */
      G + ' [role="tab"][aria-selected="true"],' + G + ' [role="treeitem"][aria-selected="true"]{',
      'color:var(--dsw-specific-sidebar-nav-item-active-accent,#24479E)!important}',

      /* ---- opt-in showcase dimming: pure :hover / :focus-within, no listeners ---- */
      G + '[data-sk-showcase] [data-chat-flow-kind]{opacity:var(--sk-idle,1);filter:blur(var(--sk-idle-blur,0px));',
      'transition:opacity .4s ease,filter .4s ease}',
      G + '[data-sk-showcase] [data-chat-flow-kind]:hover,' + G + '[data-sk-showcase] [data-chat-flow-kind]:focus-within,',
      G + '[data-sk-showcase] [data-conversation-content]:hover [data-chat-flow-kind],',
      G + '[data-sk-showcase] [data-chat-flow-kind][data-streaming],',
      G + '[data-sk-showcase] :has([data-streaming]) [data-chat-flow-kind]{opacity:1;filter:none}',

      /* ---- settings panel (skin-owned, only rendered while the plugin is loaded) ---- */
      '.sk-root{display:flex;flex-direction:column;gap:14px;padding:2px 0 18px}',
      /* The panel is the one surface the skin owns outright, so the ornament can be a little
         more formal here: a rule that fades out at both ends closes the header, the title
         takes a diamond (the motif the row markers and the inlay already use), and each card
         gets four corner ticks. */
      '.sk-head{display:flex;align-items:flex-start;gap:12px;padding-bottom:12px;',
      'background-image:linear-gradient(90deg,var(--sk-edge,rgba(104,124,180,.74)),transparent);',
      'background-repeat:no-repeat;background-position:bottom left;background-size:100% 1px}',
      /* the header crest is a token-pair background, not an <img>: one element then follows
         the palette on its own (cool in light, gold in dark) with no JS branch */
      '.sk-crest{flex:0 0 auto;width:34px;height:34px;background-image:var(--sk-panel-crest,none);',
      'background-repeat:no-repeat;background-position:center;background-size:contain}',
      '.sk-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.sk-title::before{content:"\\25C6";color:var(--sk-gold);font-size:12px;margin-right:9px;',
      'vertical-align:2px;pointer-events:none}',
      '.sk-sub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin-top:4px}',
      '.sk-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px;',
      'background-color:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:10px;',
      'background-image:',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(90deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34))),',
      'linear-gradient(180deg,var(--sk-edge-soft,rgba(104,124,180,.34)),var(--sk-edge-soft,rgba(104,124,180,.34)));',
      'background-repeat:no-repeat;',
      'background-position:left 7px top 7px,left 7px top 7px,right 7px top 7px,right 7px top 7px,',
      'left 7px bottom 7px,left 7px bottom 7px,right 7px bottom 7px,right 7px bottom 7px;',
      'background-size:18px 1px,1px 18px,18px 1px,1px 18px,18px 1px,1px 18px,18px 1px,1px 18px}',
      '.sk-row{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.sk-label{font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.sk-hint{font-size:11px;color:var(--dsw-alias-label-caption);margin-top:2px}',
      '.sk-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;overflow:hidden}',
      '.sk-seg button{font-size:12px;padding:5px 12px;background:transparent;border:0;cursor:pointer;color:var(--dsw-alias-label-secondary)}',
      '.sk-seg button[aria-pressed="true"]{background:var(--sk-control);color:var(--sk-control-ink)}',
      '.sk-range{display:flex;align-items:center;gap:10px;width:220px}',
      '.sk-range input[type=range]{flex:1;accent-color:var(--sk-control)}',
      '.sk-val{font-variant-numeric:tabular-nums;font-size:12px;color:var(--dsw-alias-label-tertiary);width:44px;text-align:right}',
      '.sk-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.sk-switch input{accent-color:var(--sk-control)}',
      '.sk-preset{border:1px solid var(--sk-gold-soft);border-radius:8px;background:var(--sk-control);color:var(--sk-control-ink);',
      'font-size:12px;font-weight:600;padding:6px 16px;cursor:pointer}',
      '.sk-previews{display:flex;gap:10px}',
      '.sk-preview{flex:1;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}',
      '.sk-preview img{display:block;width:100%;height:auto}',
      '.sk-note{font-size:11px;color:var(--dsw-alias-label-caption)}',
      '.sk-warn{font-size:11px;color:var(--dsw-alias-state-error-primary)}'
    ].join("");

    var styleTag = null;
    function ensureStyle() {
      if (styleTag || typeof document === "undefined") return;
      styleTag = document.createElement("style");
      styleTag.setAttribute("data-plugin", SOURCE);
      styleTag.setAttribute(LAYER, "style");
      styleTag.textContent = CSS;
      document.head.appendChild(styleTag);
    }

    /* ================================================================ 6. runtime */

    var layerDispose = null;
    var check = { ok: true, detail: "not-run", at: 0 };
    var failStreak = 0;
    var schemeWatch = null;

    /**
     * The one place the skin looks at the colour scheme: the app's own attribute on <body>
     * (ui-layout sets/removes data-ds-dark-theme when the snapshot changes). It is mirrored
     * onto <html> as data-sk-scheme and kept in sync with a MutationObserver, so it always
     * describes the scheme that is actually applied - never an inferred one.
     */
    function currentScheme() {
      if (typeof document === "undefined" || !document.body) return "light";
      return document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
    }
    function syncScheme() {
      if (!host) return;
      var scheme = currentScheme();
      if (host.getAttribute("data-sk-scheme") !== scheme) host.setAttribute("data-sk-scheme", scheme);
    }
    function watchScheme() {
      if (schemeWatch || typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.body) return;
      schemeWatch = new MutationObserver(function () { syncScheme(); notify(); });
      schemeWatch.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
    }

    /**
     * Runtime variables: PREFERENCE NUMBERS ONLY. Every colour or image lives in the token
     * layers as a {light,dark} pair, because the app picks the palette - a JS guess here once
     * flipped the light UI onto the dark veil and washed the whole window grey.
     */
    function applyVars() {
      if (!host) return;
      var v = clamp(prefs.veil, 0, 90) / 100;
      var idle = clamp(prefs.idleDim, 0, 90) / 100;
      var set = function (name, value) { host.style.setProperty(name, value); };

      host.setAttribute("data-sk-bg", prefs.bg === "art" ? "art" : "plain");
      syncScheme();
      // both wallpapers, always on <html>; the stylesheet selects the palette, never JS
      set("--sk-art-light", 'url("' + ART.light + '")');
      set("--sk-art-dark", 'url("' + ART.dark + '")');
      set("--sk-pos", "58% center");
      set("--sk-veil-a", String(Math.round(clamp(v * 0.85, 0, 0.8) * 1000) / 1000));
      set("--sk-blur", prefs.blur + "px");
      set("--sk-idle", String(Math.round((1 - idle * 0.75) * 100) / 100));
      set("--sk-idle-blur", (idle * 1.4).toFixed(2) + "px");
    }

    var VAR_NAMES = ["--sk-art-light", "--sk-art-dark", "--sk-pos", "--sk-veil-a",
      "--sk-blur", "--sk-idle", "--sk-idle-blur"];
    function clearVars() {
      if (!host) return;
      host.removeAttribute("data-sk-bg");
      for (var i = 0; i < VAR_NAMES.length; i++) host.style.removeProperty(VAR_NAMES[i]);
    }

    function applyGates() {
      if (!host) return;
      if (prefs.enabled) {
        host.setAttribute(GATE, GATE_ON);
        if (prefs.motif) host.setAttribute("data-sk-motif", ""); else host.removeAttribute("data-sk-motif");
        if (prefs.showcase) host.setAttribute("data-sk-showcase", ""); else host.removeAttribute("data-sk-showcase");
      } else {
        host.removeAttribute(GATE);
        host.removeAttribute("data-sk-motif");
        host.removeAttribute("data-sk-showcase");
      }
    }

    function applyTokens() {
      if (!themeRef || typeof themeRef.overrideTokens !== "function") return;
      if (layerDispose) { layerDispose(); layerDispose = null; }
      try { layerDispose = themeRef.overrideTokens(SOURCE, buildTokens(prefs)); }
      catch (err) {
        layerDispose = null;
        if (typeof console !== "undefined") console.warn("[durandal] token override rejected:", err && err.message);
      }
    }

    function refresh() {
      if (!host) return;
      applyGates();
      if (prefs.enabled) { applyVars(); applyTokens(); }
      else {
        clearVars();
        if (layerDispose) { layerDispose(); layerDispose = null; }
      }
      notify();
    }

    /**
     * Click-through self test. A skin layer answering a probe, or every probe resolving to
     * the app root, means the UI is being covered - disable rather than leave it broken.
     */
    function hitTest() {
      if (typeof document === "undefined" || !document.elementFromPoint) return { ok: true, definitive: false, detail: "no-dom" };
      var probes = [
        ["composer", '[data-composer-card],[data-composer-input],textarea,[contenteditable="true"]'],
        ["sidebar", '[class*="_sidebarCol"] button,[class*="_sidebarCol"] [role="button"],nav button']
      ];
      var probed = 0, rootHits = 0, detail = "nothing to probe yet";
      for (var i = 0; i < probes.length; i++) {
        var el = null;
        try { el = document.querySelector(probes[i][1]); } catch (err) { el = null; }
        if (!el || !el.getBoundingClientRect) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) continue;
        var vh = (typeof window !== "undefined" && window.innerHeight) || 0;
        if (r.bottom < 0 || (vh && r.top > vh)) continue;
        var hit = null;
        try { hit = document.elementFromPoint(Math.round(r.left + Math.min(30, r.width / 2)), Math.round(r.top + r.height / 2)); } catch (err) { hit = null; }
        probed++;
        if (!hit) { detail = "probe returned nothing"; continue; }
        if (hit.closest && (hit.closest("[" + LAYER + "]") || hit.closest("[data-plugin='" + SOURCE + "']"))) {
          return { ok: false, definitive: true, detail: probes[i][0] + " is covered by a skin layer" };
        }
        if (hit === document.documentElement || hit === document.body) { rootHits++; detail = probes[i][0] + " resolved to the app root"; }
        else detail = "controls reachable";
      }
      if (!probed) return { ok: true, definitive: false, detail: "nothing to probe yet" };
      if (rootHits >= probed) return { ok: false, definitive: false, detail: "every probe resolved to the app root" };
      return { ok: true, definitive: false, detail: detail };
    }

    var checkTimer = null;
    function runSelfCheck() {
      var result = hitTest();
      if (result.ok) { failStreak = 0; check = { ok: true, detail: result.detail, at: Date.now() }; notify(); return true; }
      failStreak++;
      var giveUp = result.definitive || failStreak >= 2;
      check = { ok: !giveUp, detail: result.detail + (giveUp ? "" : " (watching)"), at: Date.now() };
      if (giveUp) {
        if (typeof console !== "undefined") {
          console.warn("[durandal] self test failed (" + result.detail + "); skin disabled so the UI stays usable. Re-enable: window.durandalSkin.enable()");
        }
        setPref("enabled", false, true);
        return false;
      }
      notify();
      return true;
    }
    function scheduleSelfCheck() {
      if (typeof window === "undefined") return;
      if (checkTimer) { window.clearTimeout(checkTimer); checkTimer = null; }
      var run = function () { runSelfCheck(); };
      if (window.requestAnimationFrame) window.requestAnimationFrame(run); else run();
      checkTimer = window.setTimeout(run, 1600);
    }

    /** The single write path for the UI, the global API and the hotkey. */
    function setPref(k, value, silentCheck) {
      if (!Object.prototype.hasOwnProperty.call(SPEC, k)) return prefs;
      var spec = SPEC[k];
      if (spec.kind === "bool") prefs[k] = !!value;
      else if (spec.kind === "int") prefs[k] = clamp(Math.round(Number(value) || 0), spec.min, spec.max);
      else prefs[k] = spec.values.indexOf(value) >= 0 ? value : spec.def;
      savePrefs();
      refresh();
      if (k === "enabled" && prefs[k] && !silentCheck) scheduleSelfCheck();
      return prefs;
    }

    /** One-click "artwork first": thinnest chrome, no dimming. */
    function artFirst() {
      /* From SPEC, not a literal: a key added later must not vanish from the preset
         (savePrefs only writes keys that exist in prefs). Today the defaults are exactly
         the values the literal carried, so the behaviour is unchanged. */
      var next = {};
      for (var k in SPEC) next[k] = SPEC[k].def;
      next.enabled = true;
      next.bg = "art";
      next.veil = 4;
      prefs = next;
      savePrefs();
      refresh();
      return prefs;
    }

    function installApi() {
      if (typeof window === "undefined") return;
      window.durandalSkin = {
        version: "2.0.0",
        enable: function () { return setPref("enabled", true); },
        disable: function () { return setPref("enabled", false); },
        toggle: function () { return setPref("enabled", !prefs.enabled); },
        isEnabled: function () { return prefs.enabled; },
        set: function (k, v) { return setPref(k, v); },
        get: function () { return JSON.parse(JSON.stringify(prefs)); },
        artFirst: function () { return artFirst(); },
        status: function () {
          return {
            enabled: prefs.enabled, prefs: JSON.parse(JSON.stringify(prefs)),
            selfCheck: { ok: check.ok, detail: check.detail, at: check.at },
            gate: !!(host && host.getAttribute(GATE) === GATE_ON)
          };
        },
        reset: function () {
          setPref("enabled", false, true);
          var store = ls();
          for (var k in LS) { try { if (store) store.removeItem(LS[k]); } catch (err) { /* ignore */ } }
          prefs = loadPrefs();
          refresh();
          return prefs;
        },
        _hitTest: hitTest
      };
    }

    /** Passive keydown escape hatch: no preventDefault, the app keeps every keystroke. */
    function installHotkey() {
      if (typeof window === "undefined" || !window.addEventListener) return function () {};
      var onKey = function (event) {
        if (event.ctrlKey && event.altKey && event.shiftKey && (event.key === "D" || event.key === "d")) {
          setPref("enabled", !prefs.enabled);
        }
      };
      window.addEventListener("keydown", onKey, { passive: true });
      return function () { window.removeEventListener("keydown", onKey); };
    }

    /* ================================================================ 7. settings UI */

    function usePrefs() {
      if (!React || !React.useState) return null;
      var pair = React.useState(0), bump = pair[1];
      React.useEffect(function () {
        return subscribe(function () { bump(function (n) { return n + 1; }); });
      }, []);
      return prefs;
    }
    function Row(props) {
      return h("div", { className: "sk-row" },
        h("div", null,
          h("div", { className: "sk-label" }, props.label),
          props.hint ? h("div", { className: "sk-hint" }, props.hint) : null),
        props.children);
    }
    function Seg(props) {
      return h("div", { className: "sk-seg" }, props.options.map(function (o) {
        return h("button", {
          key: o.value, type: "button", "aria-pressed": props.value === o.value,
          onClick: function () { props.onChange(o.value); }
        }, o.label);
      }));
    }
    function Slider(props) {
      return h("div", { className: "sk-range" },
        h("input", {
          type: "range", min: props.min, max: props.max, value: props.value,
          onChange: function (e) { props.onChange(Number(e.target.value)); }
        }),
        h("span", { className: "sk-val" }, props.value + (props.unit || "")));
    }
    function Toggle(props) {
      return h("label", { className: "sk-switch" },
        h("input", { type: "checkbox", checked: !!props.checked, onChange: function (e) { props.onChange(e.target.checked); } }),
        props.text);
    }
    function Panel(props) {
      var t = (props && props.t) || function (k) { return k; };
      var state = usePrefs();
      var L = function (k, fallback) { var v = t(k); return v === k ? fallback : v; };
      if (!state) return h("div", { className: "sk-root" }, h("div", { className: "sk-sub" }, "React unavailable - use window.durandalSkin"));
      var p = prefs;
      return h("div", { className: "sk-root" },
        h("div", { className: "sk-head" },
          h("div", { className: "sk-crest", role: "img", "aria-label": "Durandal" }),
          h("div", null,
            h("div", { className: "sk-title" }, L("durandal.title", "幽兰黛尔 · 圣痕礼装")),
            h("div", { className: "sk-sub" }, L("durandal.desc", "立绘即界面：对话通透、文字直贴立绘，侧栏为浅色羊皮纸，设置与弹窗保持实底。")))),

        h("div", { className: "sk-card" },
          h(Row, { label: L("durandal.preset", "立绘优先"), hint: L("durandal.presetHint", "一键：界面最透、不虚化，立绘占满画面") },
            h("button", { type: "button", className: "sk-preset", onClick: function () { artFirst(); } }, L("durandal.apply", "应用"))),
          h(Row, { label: L("durandal.enabled", "启用皮肤"), hint: L("durandal.enabledHint", "关闭即恢复原生界面；快捷键 Ctrl+Alt+Shift+D") },
            h(Toggle, { checked: p.enabled, text: p.enabled ? L("durandal.on", "已开启") : L("durandal.off", "已关闭"), onChange: function (v) { setPref("enabled", v); } }))),

        h("div", { className: "sk-card" },
          h(Row, { label: L("durandal.bg", "对话背景") },
            h(Seg, {
              value: p.bg, onChange: function (v) { setPref("bg", v); },
              options: [{ value: "art", label: L("durandal.bgArt", "立绘") }, { value: "plain", label: L("durandal.bgPlain", "纯净") }]
            })),
          h(Row, { label: L("durandal.veil", "背景明暗"), hint: L("durandal.veilHint", "越高立绘越沉，正文越稳") },
            h(Slider, { min: 0, max: 90, value: p.veil, unit: "%", onChange: function (v) { setPref("veil", v); } })),
          h(Row, { label: L("durandal.blur", "背景模糊") },
            h(Slider, { min: 0, max: 24, value: p.blur, unit: "px", onChange: function (v) { setPref("blur", v); } }))),

        h("div", { className: "sk-card" },
          h(Row, { label: L("durandal.showcase", "展示模式"), hint: L("durandal.showcaseHint", "默认关闭；开启后指针离开正文时正文淡出") },
            h(Toggle, { checked: p.showcase, text: p.showcase ? L("durandal.on", "已开启") : L("durandal.off", "已关闭"), onChange: function (v) { setPref("showcase", v); } })),
          h(Row, { label: L("durandal.idleDim", "正文虚化") },
            h(Slider, { min: 0, max: 90, value: p.idleDim, unit: "%", onChange: function (v) { setPref("idleDim", v); } })),
          h(Row, { label: L("durandal.motif", "金色细节"), hint: L("durandal.motifHint", "选中态色块、代码块金线、聚焦金边") },
            h(Toggle, { checked: p.motif, text: p.motif ? L("durandal.on", "已开启") : L("durandal.off", "已关闭"), onChange: function (v) { setPref("motif", v); } }))),

        h("div", { className: "sk-card" },
          h("div", { className: "sk-label" }, L("durandal.preview", "预览（浅色 / 深色）")),
          h("div", { className: "sk-previews" },
            h("div", { className: "sk-preview" }, h("img", { src: ART.light, alt: "light" })),
            h("div", { className: "sk-preview" }, h("img", { src: ART.dark, alt: "dark" })))),

        h("div", { className: check.ok ? "sk-note" : "sk-warn" },
          check.ok ? L("durandal.checkOk", "点击自检通过：") + " " + check.detail
                   : L("durandal.checkBad", "点击自检未通过，皮肤已自动关闭：") + " " + check.detail),
        h("div", { className: "sk-note" }, L("durandal.api", "命令面板：window.durandalSkin.artFirst() / disable() / set(\"veil\", 20) / reset()"))
      );
    }

    /* ================================================================ 8. copy + apply */

    var zh = {
      "durandal.nav": "幽兰黛尔",
      "durandal.title": "幽兰黛尔 · 圣痕礼装",
      "durandal.desc": "立绘即界面：对话通透、文字直贴立绘，侧栏为浅色羊皮纸，设置与弹窗保持实底。",
      "durandal.preset": "立绘优先",
      "durandal.presetHint": "一键：界面最透、不虚化，立绘占满画面",
      "durandal.apply": "应用",
      "durandal.enabled": "启用皮肤",
      "durandal.enabledHint": "关闭即恢复原生界面；快捷键 Ctrl+Alt+Shift+D",
      "durandal.bg": "对话背景",
      "durandal.bgArt": "立绘",
      "durandal.bgPlain": "纯净",
      "durandal.veil": "背景明暗",
      "durandal.veilHint": "越高立绘越沉，正文越稳",
      "durandal.blur": "背景模糊",
      "durandal.showcase": "展示模式",
      "durandal.showcaseHint": "默认关闭；开启后指针离开正文时正文淡出",
      "durandal.idleDim": "正文虚化",
      "durandal.motif": "金色细节",
      "durandal.motifHint": "选中态色块、代码块金线、聚焦金边",
      "durandal.preview": "预览（浅色 / 深色）",
      "durandal.on": "已开启",
      "durandal.off": "已关闭",
      "durandal.checkOk": "点击自检通过：",
      "durandal.checkBad": "点击自检未通过，皮肤已自动关闭：",
      "durandal.api": "命令面板：window.durandalSkin.artFirst() / disable() / set(\"veil\", 20) / reset()"
    };
    var en = {
      "durandal.nav": "Durandal",
      "durandal.title": "Durandal - ceremonial skin",
      "durandal.desc": "The artwork is the interface: a transparent conversation, a light parchment sidebar, and solid settings.",
      "durandal.preset": "Artwork first",
      "durandal.presetHint": "One click: thinnest chrome, no dimming",
      "durandal.apply": "Apply",
      "durandal.enabled": "Enable skin",
      "durandal.enabledHint": "Turning this off restores the stock UI; hotkey Ctrl+Alt+Shift+D",
      "durandal.bg": "Chat background",
      "durandal.bgArt": "Artwork",
      "durandal.bgPlain": "Plain",
      "durandal.veil": "Background depth",
      "durandal.veilHint": "Higher calms the artwork and steadies prose",
      "durandal.blur": "Background blur",
      "durandal.showcase": "Showcase mode",
      "durandal.showcaseHint": "Off by default; fades idle prose when on",
      "durandal.idleDim": "Idle dimming",
      "durandal.motif": "Gold details",
      "durandal.motifHint": "Selected pill, code rule, focus ring",
      "durandal.preview": "Preview (light / dark)",
      "durandal.on": "On",
      "durandal.off": "Off",
      "durandal.checkOk": "Click-through self test passed:",
      "durandal.checkBad": "Self test failed; skin auto-disabled:",
      "durandal.api": "Console: window.durandalSkin.artFirst() / disable() / set(\"veil\", 20) / reset()"
    };

    function apply(ctx) {
      host = typeof document !== "undefined" ? document.documentElement : null;
      try { themeRef = ctx.get ? ctx.get("theme") : null; } catch (err) { themeRef = null; }

      // the skin itself never depends on React, slots or locale
      ensureStyle();
      refresh();
      installApi();

      var disposers = [installHotkey()];

      /* The scheme mirror must run whether or not the settings slot exists: every
         [data-sk-scheme="dark"] rule depends on it (sidebar gold ink, gold banner, gold
         motifs, the dark wallpaper). It used to be inside the slots branch below. */
      watchScheme();

      try {
        if (ctx.slots && ctx.slots.inject) {
          var t = null;
          try { t = ctx.locale && ctx.locale.bind ? ctx.locale.bind(NS) : null; } catch (errT) { t = null; }
          try {
            if (ctx.locale && ctx.locale.register) {
              ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "durandal: settings strings");
            }
          } catch (errLocale) { /* labels fall back to the inline strings */ }

          var panel = function (props) { return Panel({ t: (props && props.t) || t }); };

      disposers.push(ctx.slots.inject("settings.section", function () {
            return ctx.slots.register({
              name: "settings.section", id: "durandal", order: 7,
              label: function () { return t ? t("durandal.nav") : zh["durandal.nav"]; }, locale: NS
            }, panel);
          }));
        }
      } catch (errUi) {
        if (typeof console !== "undefined") console.warn("[durandal] settings UI unavailable:", errUi && errUi.message);
      }

      if (prefs.enabled) scheduleSelfCheck();

      return function () {
        for (var i = 0; i < disposers.length; i++) { try { disposers[i](); } catch (err) { /* ignore */ } }
        subscribers = [];
        if (schemeWatch) { schemeWatch.disconnect(); schemeWatch = null; }
        if (layerDispose) { layerDispose(); layerDispose = null; }
        clearVars();
        if (host) {
          host.removeAttribute(GATE);
          host.removeAttribute("data-sk-motif");
          host.removeAttribute("data-sk-showcase");
          host.removeAttribute("data-sk-scheme");
        }
        if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
        styleTag = null;
        try { delete window.durandalSkin; } catch (err) { window.durandalSkin = undefined; }
      };
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "theme"];
    exports.SPEC = SPEC;
    exports.buildTokens = buildTokens;
    exports.CSS = CSS;
    exports.NS = NS;
    exports.GATE = GATE;
    exports.__internals = {
      hitTest: hitTest, runSelfCheck: runSelfCheck, installApi: installApi,
      setPref: setPref, prefs: function () { return prefs; }, ensureStyle: ensureStyle,
      getStyleTag: function () { return styleTag; }, applyVars: applyVars, clearVars: clearVars
    };
    return module.exports;
  }
});
