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
| `POCKET_D<d>` | Grooves, rabbets, notches to depth `<d>` | Pocket to `<d>` |
| `DRILL_<dia>_D<d>` | Blind holes, e.g. shelf pins | Drill, `<d>` deep |
| `DRILL_<dia>_THRU` | Clearance holes | Drill, through |
| `<layer>_FLIP` | Same, but machined after turning the sheet over | See below |
| `TILE_REG` | Registration pin holes | Drill, into the spoilboard |
| `LABEL` | Part identifiers | **Do not machine** |
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

Only parts flagged in the diagnostics produce these layers. With the default
joinery, that is a divider with shelves on both sides, and nothing else.

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

## Tiles

A sheet whose **parts reach** further than the machine is split along the feed
axis. The count follows the parts, not the blank: half a sheet of parts needs
only the setups that cover them.

With the nester set to **fewest setups**, no part crosses a seam unless it is
larger than the machine, so most tiles cut whole parts. Each tile covers a
band exactly `travel − overlap` wide. The overlap is headroom so no cut lands at
the extreme limit of travel — **nothing is machined twice**.

Geometry that straddles a seam is clipped to the tile. A contour that falls
wholly inside keeps its exact arcs; only a straddling contour is flattened, and
the flattening error is bounded by 0.02 mm, well under anything a router
resolves.

Registration holes are spaced exactly one step apart, so after the stock slides
forward, the previous tile's holes drop onto the same pins. They are placed in
the sheet margin, which is waste.

A drilled hole that would land on a seam is **left out** rather than cut in two
setups, and you get a warning naming it. Nudge the nesting or the tile overlap
and it moves off the seam.
