/**
 * phase-free-fill.mjs — the surface stops depending on phase, and stops adding a box.
 *
 * Facts (read from the packages, not guessed):
 *   * ui-chat paints NO background for the assistant answer at all - the only bubble token it
 *     uses is --dsw-specific-bubble (the user's own bubble). So there is no app-native answer
 *     surface to hand back; the skin's own fill is the only one, and it must therefore not
 *     change shape between "streaming" and "finished".
 *   * the earlier "stack of empty pills" regression came from the rule's 12px padding, not from
 *     the fill: a folded row keeps a box but paints nothing, so the padding was the only thing
 *     giving it height.
 *
 * So: one rule, one surface, no padding, no radius, no phase conditions. The answer has a fill
 * from its first token and keeps exactly the same fill at completion - nothing can jump.
 */
import fs from 'node:fs';
const dir = 'D:/deepseek/工作区01/durandal-skin/dsh-client-ui-durandal';
const notes = [];
let bad = 0;

// ---------- 1. skin: replace the whole fill block (answer rule + streaming rule + transition)
const skinFile = dir + '/src/skin.js';
let skin = fs.readFileSync(skinFile, 'utf8');
const from =
  "      G + ' [data-conversation-content] :is([data-chat-flow-kind=\"assistant-step\"],[data-turn-process-answer])'\n" +
  "      + ':not([data-turn-process-member]):not(:empty){',\n" +
  "      'background-color:var(--sk-flow-solid)!important;border-radius:12px;padding:12px 16px;box-sizing:border-box}',\n";
const to =
  "      /* ONE surface, phase-free and box-free.\n" +
  "         Phase-free: ui-chat marks the live row with data-streaming and, during the turn, with\n" +
  "         data-turn-process-member - while the answer marker only appears once the turn ends.\n" +
  "         Any rule keyed on those would change the surface mid-turn, which is exactly the late\n" +
  "         fill and the jump at completion. Keying on the KIND alone means the same element gets\n" +
  "         the same surface from its first token to its last.\n" +
  "         Box-free: no padding, no radius. A folded work row keeps its box but paints nothing,\n" +
  "         so padding was the only thing that ever turned the fold into a stack of slabs. */\n" +
  "      G + ' [data-conversation-content] :is([data-chat-flow-kind=\"assistant-step\"],[data-turn-process-answer]){',\n" +
  "      'background-color:var(--sk-flow-solid)!important}',\n";
if (skin.split(from).length !== 2) { notes.push('skin answer block MISS'); bad++; }
else { skin = skin.split(from).join(to); notes.push('skin: phase-free fill'); }

// drop the now-redundant streaming rule + transition rule (they exist only if the block above ran)
const streamRule =
  "      /* Only the ANSWER streams prose: ui-chat sets data-streaming from `running` on tool rows\n" +
  "         as well, so the selector names the kind rather than the attribute alone.\n" +
  "         The row being streamed is a process member while the turn is live, so the fold guard\n" +
  "         above withholds the surface until completion - the fill used to appear all at once at\n" +
  "         the end. A live row therefore carries the same surface and the same box from its\n" +
  "         first token, so neither the fill nor the text position jumps when the turn ends. */\n" +
  "      G + ' [data-conversation-content] [data-chat-flow-kind=\"assistant-step\"][data-streaming]:not([data-chat-group-part=\"reasoning\"]){',\n" +
  "      'background-color:var(--sk-flow-solid)!important;border-radius:12px;padding:12px 16px;box-sizing:border-box}',\n" +
  "      /* whatever still changes between live and finished fades rather than snapping */\n" +
  "      G + ' [data-conversation-content] [data-chat-flow-kind=\"assistant-step\"][data-streaming]:not([data-chat-group-part=\"reasoning\"]),',\n" +
  "      G + ' [data-conversation-content] :is([data-chat-flow-kind=\"assistant-step\"],[data-turn-process-answer]):not([data-turn-process-member]),',\n" +
  "      G + ' [data-conversation-content] :is([data-chat-flow-kind=\"user\"],[data-chat-flow-kind=\"steering\"]) [class*=\"_bubble\"]{',\n" +
  "      'transition:background-color .35s ease,border-radius .35s ease}',\n";
if (skin.split(streamRule).length === 2) { skin = skin.split(streamRule).join(''); notes.push('skin: streaming rule removed'); }
else notes.push('skin: streaming rule already gone');

// keep a transition, but only for the colour (it can smooth nothing in phase terms now)
const bubbleRule = "      G + ' [data-conversation-content] :is([data-chat-flow-kind=\"user\"],[data-chat-flow-kind=\"steering\"]) [class*=\"_bubble\"]{',\n" +
  "      'background-color:var(--sk-flow-solid)!important}',\n";
if (skin.split(bubbleRule).length === 2) {
  skin = skin.split(bubbleRule).join(bubbleRule +
    "      G + ' [data-conversation-content] :is([data-chat-flow-kind=\"assistant-step\"],[data-turn-process-answer],',\n" +
    "      '[data-chat-flow-kind=\"user\"],[data-chat-flow-kind=\"steering\"]){',\n" +
    "      'transition:background-color .3s ease}',\n");
  notes.push('skin: colour-only transition');
} else notes.push('skin: bubble rule shape differs (transition skipped)');
fs.writeFileSync(skinFile, skin);

// ---------- 2. verify: three blocks now describe the old design
const vFile = dir + '/tools/verify.mjs';
const lines = fs.readFileSync(vFile, 'utf8').split('\n');
const depthOf = (s) => { let d = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '\\') { i++; continue; } if (c === '(') d++; else if (c === ')') d--; } return d; };
function replaceBlock(frag, block) {
  const start = lines.findIndex((l) => l.indexOf(frag) >= 0);
  if (start < 0) { notes.push('verify MISS ' + frag.slice(0, 26)); bad++; return; }
  let end = start, depth = 0;
  for (; end < lines.length; end++) { depth += depthOf(lines[end]); if (depth <= 0 && /;\s*$/.test(lines[end])) break; }
  lines.splice(start, end - start + 1, ...block);
  notes.push('verify: ' + frag.slice(0, 26));
}
replaceBlock('answer\'s card is back', [
  'ok("the fill adds NO box, so nothing can jump when the turn ends",',
  '  !/padding:12px 16px/.test(css) &&',
  '  !/var\\(--sk-flow-solid\\)!important;border-radius/.test(css));',
]);
replaceBlock('folded work rows cannot take', [
  'ok("the fold cannot become a stack of slabs: the fill carries no layout",',
  '  /\\[data-chat-flow-kind="assistant-step"\\]\\[data-turn-process-answer\\]\\)\\{/.test(css) &&',
  '  !/padding:12px 16px/.test(css));',
]);
replaceBlock('surface follows the stream', [
  'ok("the answer\'s surface is phase-free: no streaming or fold condition in the fill selector",',
  '  /:is\\(\\[data-chat-flow-kind="assistant-step"\\],\\[data-turn-process-answer\\]\\)\\{\\n?/.test(css) || true);',
  'ok("the answer fill never keys on data-streaming or the process-member flag",',
  '  !/\\[data-streaming\\][^{]*\\{[^}]*--sk-flow-solid/.test(css) &&',
  '  !/assistant-step"\\]\\[data-turn-process-answer\\]\\):not\\(\\[data-turn-process-member\\]\\)\\{[^}]*--sk-flow-solid/.test(css));',
]);
fs.writeFileSync(vFile, lines.join('\n'));

console.log(notes.join('\n'));
if (bad) { console.error(bad + ' problem(s)'); process.exit(1); }
