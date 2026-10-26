#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Measure how bright the artwork actually is, from rendered screenshots.

This is the independent second method for the "zero films" claim. verify.mjs reads the token
VALUES and asserts they compose to nothing; that is a statement about the stylesheet. This
reads the PIXELS the window actually painted, which is a statement about the result, and the
two can disagree - a token can be right while something else lays a wash on top of it, and
that is exactly how the illustration stayed faint through three revisions of "thin" values.

Usage (pair it with tools/cdp-verify.mjs, which writes the shots and the boxes):
  python tools/sample-pixels.py art/_cdp/*.png --boxes art/_cdp/boxes.json

It samples a grid inside the conversation column and, as a control, inside the sidebar. The
sidebar is painted by --sk-panel, which none of the removed films touch: if the sidebar moves
with them, the change broke the panel rather than lifting a film, and the run says so.

A grid that yields no samples is reported as a FAILURE, never as "nothing to worry about" -
an extraction that silently returns zero rows reads exactly like a clean result.
"""
import argparse
import glob
import json
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: D:\\Anaconda\\envs\\python3.10\\python.exe has it (PIL 12.1.1)")


def mean_region(img, box, cols=6, rows=4, top_frac=0.0, bottom_frac=1.0):
    """Mean RGB over a grid of single pixels well inside `box`.

    Points are taken on a regular grid rather than over every pixel: a few dozen samples is
    plenty to compare two renderings of the SAME page, and it keeps a 1280x800 PNG cheap to
    analyse. Sampling single pixels (not patches) keeps the number honest as a "what is the
    value here" measurement.
    """
    x, y, w, h = box["x"], box["y"], box["width"], box["height"]
    y0 = y + h * top_frac
    y1 = y + h * bottom_frac
    xs = [int(x + w * (i + 1) / (cols + 1)) for i in range(cols)]
    ys = [int(y0 + (y1 - y0) * (i + 1) / (rows + 1)) for i in range(rows)]
    px = img.load()
    iw, ih = img.size
    samples = []
    for yy in ys:
        for xx in xs:
            if 0 <= xx < iw and 0 <= yy < ih:
                samples.append(px[xx, yy])
    if not samples:
        return None, 0
    n = len(samples)
    r = sum(s[0] for s in samples) / n
    g = sum(s[1] for s in samples) / n
    b = sum(s[2] for s in samples) / n
    # Spread of luma across the samples: how much tonal range survived. This is the metric
    # that works in BOTH schemes. Luma alone only tells the truth in dark mode, where the films
    # are dark - in light mode they are WHITE, so removing them lowers luma while making the
    # artwork more vivid, and a luma-only reading would report the opposite of what happened.
    # A film can only flatten dynamic range, whichever colour it is, so a rise in spread is
    # "the artwork is coming through" in either scheme.
    ls = [luma(s) for s in samples]
    mean_l = sum(ls) / n
    spread = (sum((v - mean_l) ** 2 for v in ls) / n) ** 0.5
    return (r, g, b), n, spread


def luma(rgb):
    """Rec. 709 relative luminance: how bright the eye reads it, not the raw channel sum.

    The films are navy, so a plain channel mean would understate what they cost - blue counts
    for very little of perceived brightness, which is why the artwork could still read as
    "dim" while its channel average barely moved.
    """
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+", help="PNG files (globs are fine)")
    ap.add_argument("--boxes", help="boxes.json written by tools/cdp-verify.mjs")
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON only")
    args = ap.parse_args()

    files = sorted({f for pattern in args.images for f in glob.glob(pattern)} or set(args.images))
    files = [f for f in files if f.lower().endswith(".png")]
    if not files:
        sys.exit("FAIL: no PNG files matched - refusing to report 'nothing to worry about'")

    regions = {"column": {"x": 0.25, "y": 0.15, "width": 0.5, "height": 0.35}}
    view = None
    if args.boxes and os.path.exists(args.boxes):
        meta = json.load(open(args.boxes, encoding="utf-8"))
        view = meta.get("view")
        found = {k: v for k, v in (meta.get("boxes") or {}).items() if v}
        if found:
            regions = found
        else:
            sys.exit("FAIL: boxes.json carries no usable box - the sampler has nothing to anchor to")

    results = {}
    problems = []
    for f in files:
        img = Image.open(f).convert("RGB")
        if view and (img.size[0] != view["width"] or img.size[1] != view["height"]):
            problems.append(f"{os.path.basename(f)}: {img.size[0]}x{img.size[1]} does not match the pinned "
                            f"viewport {view['width']}x{view['height']} - the screenshots are not comparable")
        row = {}
        for name, box in regions.items():
            # The column is sampled in its upper half so the composer card, which sits at the
            # bottom now, can never contribute; the sidebar is sampled over the same band for a
            # like-for-like control.
            rgb, n, spread = mean_region(img, box, top_frac=0.05, bottom_frac=0.55)
            if rgb is None:
                problems.append(f"{os.path.basename(f)}: region '{name}' yielded 0 samples")
                continue
            row[name] = {"rgb": [round(v, 1) for v in rgb], "luma": round(luma(rgb), 2),
                         "spread": round(spread, 2), "n": n}
        results[os.path.basename(f)] = row

    if not results or all(not r for r in results.values()):
        sys.exit("FAIL: every region yielded 0 samples - the extraction is broken, not the skin")

    if args.json:
        print(json.dumps({"results": results, "problems": problems}, indent=2))
        sys.exit(1 if problems else 0)

    names = sorted(results)
    # A known order first so a before/after run reads top-to-bottom, then anything else.
    order = [n for n in ["before-all-three.png", "before-no-frame.png", "before-no-table.png", "after.png"] if n in names]
    order += [n for n in names if n not in order]
    base = results.get(order[0], {})
    # Every region in boxes.json gets a column, so this works for an arbitrary question
    # ("is the composer card still readable over the now-brighter art?") and not just the two
    # names the price-out happens to use.
    region_names = sorted({k for r in results.values() for k in r})
    if not region_names:
        sys.exit("FAIL: no region produced a measurement")

    w = max(len(n) for n in order) + 2
    head = f"\n{'screenshot':<{w}}" + "".join(f"{rn + ' rgb':>24}{'luma':>9}{'d':>9}{'spread':>9}{'d':>9}" for rn in region_names)
    print(head)
    print("-" * len(head))
    for n in order:
        r = results[n]
        line = f"{n:<{w}}"
        for rn in region_names:
            m = r.get(rn)
            if not m:
                line += f"{'(none)':>24}{'':>36}"
                continue
            d = m["luma"] - base[rn]["luma"] if base.get(rn) else 0
            ds = m["spread"] - base[rn]["spread"] if base.get(rn) else 0
            line += f"{str(m['rgb']):>24}{m['luma']:>9.2f}{d:>+9.2f}{m['spread']:>9.2f}{ds:>+9.2f}"
        print(line)
    print("\nspread = stddev of per-pixel luma across the region: how much tonal range survived.")
    print("That is the metric to read in BOTH schemes. 'luma' alone is only honest in dark mode:")
    print("the light-mode films are WHITE, so removing them lowers luma while the artwork gets")
    print("MORE vivid - a luma-only reading would report that backwards. A film can only flatten")
    print("dynamic range whatever its colour, so a rise in spread means the artwork came through.")
    print("\nRegions come from boxes.json. In the film price-out, 'column' is the artwork (what")
    print("must get brighter) and 'sidebar' is the control - but note the control is NOT expected")
    print("to be perfectly still: --sk-panel is 0.86 alpha, so 14% of whatever is behind the")
    print("sidebar (including the frame film) shows through it. A few points of movement there is")
    print("that transparency, not a broken panel; a LARGE move is a broken panel.\n")

    for p in problems:
        print(f"WARN  {p}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
