# DXF output specification

## Format

**DXF R12 (AC1009)**, ASCII. R12 is the most widely readable flavour: arcs ride
on polyline bulges, and there are no object handles or class tables to get
wrong. Verified against `ezdxf`.

- Units: millimetres. `$INSUNITS = 4`, `$MEASUREMENT = 1`.
- Coordinates: fixed notation, six decimals. Never exponent form — some
  importers choke on it.
- Origin: bottom-left of the sheet. Y runs up.
- Entities: `POLYLINE`/`VERTEX`/`SEQEND` for contours (group code 42 carries the
  bulge), `CIRCLE` for drilling, `TEXT` for labels.

## Layers

Cut depth is encoded in the layer name, so CAM can assign both the toolpath
strategy and its depth on import. **All upper case** — R12 does not carry lower
case layer names.

| Layer | Contents | Suggested toolpath |
|---|---|---|
| `OUTLINE` | Part profiles, through | Profile, outside, full depth, with tabs |
| `THROUGH` | Interior through cuts: mortises, cut-outs | Profile, inside, full depth |
| `OUTLINE_OPEN` | A tile's stretch of a part profile that crosses a seam — tile files only | Profile, cutter on the **right** of travel, full depth |
| `THROUGH_OPEN` | The same for a through cut | Profile, cutter on the **left** of travel, full depth |
| `POCKET_D<d>` | Grooves, rabbets, notches to depth `<d>` | Pocket to `<d>` |
| `DRILL_<dia>_D<d>` | Blind holes, e.g. shelf pins | Drill, `<d>` deep |
| `DRILL_<dia>_THRU` | Clearance holes | Drill, through |
| `<layer>_FLIP` | Same, but machined after turning the sheet over | See below |
| `TILE_REG` | Registration pin holes | Drill, into the spoilboard |
| `TILE_REG_FLIP` | The same, for the second pass of a tiled sheet that is turned over | Drill, into the spoilboard |
| `LABEL` | Part identifiers, on face A | **Do not machine** (or engrave, in the first pass) |
| `SHEET` | Sheet boundary | **Do not machine** |

One layer per distinct depth, so `POCKET_D6` and `POCKET_D9` arrive separately
and each maps to its own toolpath.

### Safe layer names

Some importers dislike decimal points in layer names. The **safe layer names**
option replaces the point with `P`:

```
POCKET_D6.35   →   POCKET_D6P35
DRILL_4.5_THRU →   DRILL_4P5_THRU
```

### `_FLIP` layers

Geometry on a part's second face. It is mirrored across the sheet, so it lands
correctly once the sheet is turned over **left to right**.

Order of operations: cut every layer without `_FLIP`, turn the sheet over left
to right about its short axis, then cut the `_FLIP` layers. Profile the parts
last, so they stay held in the sheet until everything else is done.

**A sheet with no tiles has no locating holes.** The registration holes
(`TILE_REG`, `TILE_REG_FLIP`) exist to carry a sheet from one tile to the next;
a sheet cut in one setup has none, so its edges are the datum. Square it into
the origin corner — short edge on the stop at X = 0, long edge on the fence at
Y = 0 — for the first pass, and after turning it over left to right the long
edge stays on the fence and the end that was at the far side goes onto the
stop. The output pack draws the two passes as two pictures, because the
mirrored second pass drawn on top of the first looks like machining floating in
the waste, far from any part, when each feature is in fact inside its own part
as it lies once the sheet is turned.

Only parts flagged in the diagnostics produce these layers. With the default
joinery, that is a divider with shelves on both sides, and nothing else. A sheet
whose only second-face work is drilling — shelf-pin rows on both faces of a
divider — still gets the turn-over instruction; 1.0 only looked for grooves.

### `LABEL`

Each part's id, written on face A, which is cut in the first pass on every part,
so the label is never the reason a panel is turned over. Face A is the inside of
a carcass side and the back of a door, but not of every part — a shelf's is its
top — which is one more reason the layer is reference only unless you choose to
engrave it. It reads along the blank's longer side, 12 mm in, at the first
corner where the whole of it lands on the part: a side panel's front-bottom
corner is its toe-kick notch, so its label goes to another corner. It turns with
the part: a part the nester turned a quarter carries its label turned a quarter
too (group code 50 on the `TEXT`). In 1.0 every turned part's label ran some
50 mm off its edge, across the part gap and onto its neighbour.

## Cut order

1. Drilling — the panel is at its most rigid.
2. Pockets.
3. Through cuts.
4. Profiles last, with onion skin or tabs so parts stay put.

Holding tabs are left to your CAM: it knows your material, your hold-down and
your feeds, and it can place them better than a file can.

## Files

| File | Contents |
|---|---|
| `<name>-sheet<N>.dxf` | One nested sheet, whole |
| `<name>-sheet<N>-tile<M>.dxf` | One tile, coordinates zeroed to that tile |
| `<name>-cutlist.csv` | Part list with sizes, sheet numbers, hole counts |
| `<name>-before-you-cut.txt` | The export's instructions: tiles, turning over, seams — see below |
| `<part id>.dxf` | One part on its own, downloaded separately — see below |

### One part on its own

R-22's answer to the workshop's most common accident, a ruined panel:
download the one blank again without opening the whole sheet zip in another
program to find and extract it. Origin is the part's own local machining
frame, not a sheet — this is the one file in this generator's output that is
not in sheet space. A face-B feature is mirrored across the blank's own
centre rather than a sheet's length, so `_FLIP` still means the same thing:
cut everything else first, turn the blank over left to right, then cut the
`_FLIP` layers.

## Tiles

A sheet whose **machining reaches** further than the machine is split along the
feed axis. The count follows the work, not the blank: half a sheet of parts
needs only the setups that cover them. Work on a part's second face counts
where it is cut — mirrored about the blank's full length, so a divider nested
at the start of a half-filled sheet has its second face cut near the far end —
and the tiles reach that far. 1.0 tiled only as far as the first face reached,
and second-face work beyond that was in no tile file at all.

With the nester set to **fewest setups**, no part crosses a seam unless it is
larger than the machine, so most tiles cut whole parts. Each tile covers a
band exactly `travel − overlap` wide. The overlap is headroom so no cut lands at
the extreme limit of travel — **nothing is machined twice**.

Geometry that straddles a seam is clipped to the tile. A contour that falls
wholly inside keeps its exact arcs; only a straddling contour is flattened, and
the flattening error is bounded by 0.02 mm, well under anything a router
resolves.

**A pocket and a profile are clipped differently.** A pocket is an area, so each
tile gets its share of the area and clears it. CAM keeps the cutter a radius
inside a pocket's edge, so two shares meeting exactly at the seam would leave a
rib one cutter wide across the groove — the back groove of every long side
panel crosses a seam. The tile before a seam therefore reaches one cutter
diameter past it, into the tile overlap; if the overlap is narrower than the
cutter, the instructions say how wide a rib is left. A profile
is a line the cutter follows: each tile gets the stretch of that line inside it,
**open** where it meets the seam, on `OUTLINE_OPEN` or `THROUGH_OPEN`. Closed
along the seam it would be a full-depth cut straight across the part — 1.0 did
exactly that, and a side panel longer than one tile came off the machine in two
pieces. Every open piece runs counter-clockwise round its part, so the part is
always on the left of travel: cut an outline with the cutter on the right, a
cut-out with it on the left. The instructions name every part that crosses a
seam.

Registration holes are spaced exactly one step apart, so after the stock slides
forward, the previous tile's holes drop onto the same pins. They are placed in
the sheet margin, which is waste.

A drilled hole that would land on a seam is **left out** rather than cut in two
setups, and the instructions say which part it is in, which layer, and where on
the full sheet, so it can be drilled by hand. Nudge the nesting or the tile
overlap and it moves off the seam.

A tiled sheet that is also turned over is worked twice: every layer without
`_FLIP` on each tile in turn, then the sheet turned over left to right — its
far end to the origin — and the tiles again from tile 1 for the `_FLIP`
layers. Turning it end for end moves the first pass's registration holes, so
the second pass pins on its own, `TILE_REG_FLIP`, at the same tile positions.

## The instructions

None of the above can be said inside a DXF, so the export writes it out:
**Before you cut** in the export preview, and the same list as
`<name>-before-you-cut.txt` in the zip. Each sheet's tiling steps, whether it is
turned over and how, every part that crosses a seam, and every hole left off
one. In 1.0 these were computed and thrown away.
