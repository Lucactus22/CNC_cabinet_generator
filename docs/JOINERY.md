# Joinery reference

Why each joint is shaped the way it is, and the arithmetic behind it.

Everything here assumes the real constraint of a 3-axis flat-bed router: the
cutter arrives perpendicular to a flat sheet, it has a finite radius, and it
cannot reach the edge of a panel at all.

## The two constraints that shape everything

**1. A round cutter cannot cut a sharp inside corner.**
It leaves a fillet of one tool radius. Wherever a square-cornered part has to
seat into a machined feature, that fillet is in the way.

**2. A 3-axis router cannot bore into a panel's edge.**
This rules out dowels, Confirmat screws and Domino tenons without a horizontal
drilling unit. They are not offered, rather than offered and quietly wrong.

## Stopped dado (default)

The receiving panel gets a groove; the mating panel drops into it.

```
Groove width  = measured panel thickness + fit clearance
Groove depth  = dado depth, clamped to 60% of the receiving panel
Groove length = full depth, less the front stop
```

The groove stops short of the front edge — 10 mm by default — so nothing shows
on the finished face. That leaves solid material in front of the groove, so the
mating panel's front corner is notched away:

```
Notch depth  = groove depth
Notch length = front stop + tool radius + fit clearance
```

The tool radius term is the part that matters. A pocket keeps a fillet of one
radius in each of its stopped-end corners, so the tongue has to start past that
or it will never seat. Working it through, with the front edge at zero:

- Solid material ahead of the groove: `0 … stop`
- Fillets left in the groove's end corners: `stop … stop + toolR`
- Tongue begins at: `stop + toolR + clearance` ✔ clear of both

The notch creates one inside corner on the mating panel too. The cutter fillets
it, leaving a little extra material at `notchLength − toolR = stop + clearance`,
which is inside the groove and therefore harmless. No relief needed.

Set the front stop to zero for a through dado, visible on the front edge; the
notch then disappears on its own.

**Screws.** Clearance holes go through the receiving panel into the edge of the
mating one, drilled from the same face as the groove so the panel never needs
turning over.

## Through tab and slot

Tenons on one panel pass right through mortises in the other. Self-jigging and
needs no fasteners, at the cost of being visible on the outside face.

```
Slot   = panel thickness + clearance,  by  tab width + clearance
Tenon  = female panel thickness long, so it comes through flush
```

Tabs are spread along the shared edge, held in from both ends so the joint
cannot break out, and never wider than 60% of the pitch they are allotted.

Both the slots **and** the tab roots are relieved. The slot reliefs give the
tenon's square corners somewhere to go. The tab-root reliefs matter just as much
and are easy to forget: at the root, the outline turns concave, so the cutter
leaves material sticking out past the shoulder line, which holds the joint open
by up to one tool radius.

## Corner reliefs

### Dogbone

The relief circle sits on the corner bisector, pushed out into the material, so
it bites equally into both walls.

With the corner at the origin and the void occupying the `+x/+y` quadrant, for a
cutter of radius `r`:

```
centre C   = -(r/√2) · bisector        →  (-r/2, -r/2)
|CV|       = r/√2 ≈ 0.707 r            →  the circle covers the corner
wall hits  = r(√3 - 1)/2 ≈ 0.366 r     →  from the corner, along each wall
sweep      = 330°                      →  bulge = tan(82.5°) ≈ 7.596
```

The arc goes the long way round, out into the material. Taking the short way
would cut a shortcut across the void instead of a relief into the corner.

The offset factor of `1/√2` is the classic construction: far enough out that the
circle comfortably covers the corner, close enough in that the relief stays
small. It is exposed as a parameter and clamped to keep `|CV| < r`, since a
circle that no longer reaches the corner reliefs nothing.

### T-bone

The circle slides along one wall instead, past the corner, so the overcut runs
in a single direction and a shoulder can hide it. On a slot the relief follows
the **long** axis, which lengthens the slot slightly and leaves the width — the
dimension that has to stay exact — untouched. The circle still sweeps one tool
radius either side of its centre; that is the T.

### Choosing

Dogbone is the default: tighter to the corner, and stronger because the material
removed is balanced across both walls. T-bone is worth it when the relief would
otherwise be visible and a shoulder can cover it.

`none` is for the case where you would rather round the mating part's corners by
hand. The joints will not close otherwise.

## Back panels

Captured in a groove on all four sides, set in from the rear edge so there is
room to scribe the carcass to a wall that is not flat. The groove uses the same
dado logic and runs through at both ends — there is no front edge to hide it on.

A back always sits in a plain groove, whatever the carcass joint is set to. Tabs
through a back panel would be pointless work.

## Shelf pins (32 mm system)

| Setting | Default | Why |
|---|---|---|
| Diameter | 5 mm | The universal shelf pin |
| Depth | 12 mm | Deep enough to hold, short of breaking through 18 mm |
| Pitch | 32 mm | The European standard |
| Rows from front / back | 37 mm | Standard, and clear of hinge plates |

The ladder is anchored to the bottom of the opening rather than centred, so both
sides of a bay — and both rows on a side — always line up. If a hole would break
through the panel, you get a warning rather than a hole.

## The one-face rule

Every part should be machinable without turning it over. Flipping is the main
source of error and lost time on a hobby machine, and the default joinery gets
every part there except one: **a divider with shelves on both sides**, which
genuinely needs dados on both faces.

That part is flagged in the diagnostics. Its second-face geometry is written to
`_FLIP` layers, mirrored across the sheet, so it lands correctly when the sheet
is turned over left to right. Cut everything else first, flip, then cut the
`_FLIP` layers.

## Tolerances

| Setting | Default | Raise it when |
|---|---|---|
| Fit clearance | 0.15 mm | Joints need a mallet |
| Measured thickness | 17.8 mm | Always: measure your own sheet |
| Dado depth | 6 mm | You want a stronger housing |
| Front stop | 10 mm | — |
| Cutter diameter | 6 mm | It must match the bit you actually use |

The cutter diameter is not cosmetic. It sets every relief size, the notch
lengths, and the spacing between nested parts.
