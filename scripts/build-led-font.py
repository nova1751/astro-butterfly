"""
Build src/assets/fonts/unidream-led.woff2 for the aside clock.

  pip install fonttools brotli
  python scripts/build-led-font.py

- Subsets UnidreamLED (free LED font, scripts/assets/UnidreamLED.ttf) to the
  characters the clock prints.
- Makes the digits tabular: the font has proportional figures (`1` is 344
  units, the rest 948) and no `tnum` feature, so the ticking clock changed
  width every time a 1 appeared. `1` is widened to the common advance and its
  outline centred in it (standard tabular-figure behaviour).
  The colon and space keep their width (they never swap with a digit).
"""
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/assets/UnidreamLED.ttf"
OUT = ROOT / "src/assets/fonts/unidream-led.woff2"
TEXT = "0123456789:-./ %APMSUNMOTUEWEDTHUFRISAT"

font = TTFont(SRC)
cmap = font.getBestCmap()
glyf, hmtx = font["glyf"], font["hmtx"]

digits = [cmap[ord(c)] for c in "0123456789"]
advance = max(hmtx[g][0] for g in digits)
for name in digits:
    adv, lsb = hmtx[name]
    dx = (advance - adv) // 2  # centre the narrow `1` in the common advance
    if not dx:
        continue
    glyph = glyf[name]
    if glyph.isComposite():
        for comp in glyph.components:
            comp.x += dx
    else:
        coords = glyph.coordinates
        coords.translate((dx, 0))
    glyph.recalcBounds(glyf)
    hmtx[name] = (advance, lsb + dx)

options = Options()
options.flavor = "woff2"
options.layout_features = []
options.name_IDs = [1, 2]
subsetter = Subsetter(options)
subsetter.populate(text=TEXT)
subsetter.subset(font)
OUT.parent.mkdir(parents=True, exist_ok=True)
font.flavor = "woff2"
font.save(OUT)
print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes, digit advance {advance}")
