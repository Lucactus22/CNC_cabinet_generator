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

**Screws.** Clearance holes go right through the panel that receives the groove,
landing on the centreline of the mating panel, so at assembly the hole is
already exactly where the screw goes and there is nothing to measure. They are
drilled from the same face as the groove, so the panel never needs turning over.

Size the hole to *clear* the screw's threads, not to grip them. A hole at the
root diameter makes the screw bite in the outer panel, which jacks the joint
apart instead of drawing it together. The default of 4.5 mm suits a 4 mm screw.

There is no countersink: that needs a V or countersink bit working on the
outside face, which would mean turning every side panel over. A hand
countersink after machining takes seconds and costs no setup.

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

## Capped vs inset tops

A **capped** top lies over the side panels and spans the full width of the
carcass. From above you see one unbroken surface. The sides stop at its
underside and run up into shallow locating dados cut there.

Those dados land on the top panel's **underside**, which is already the face
being machined for the dividers and the back groove, so capping adds no setup
and no flip. As everywhere else, the dado stops short of the front edge — that
edge is on show — and the sides get their front top corners notched to clear it.

An **inset** top sits between the sides instead, leaving their end grain flush
with the surface and a joint line either side of the panel. It is the right
choice where the top is hidden, and the default for the shelved upper carcass.

The base carcass defaults to capped, because in this design its top is the
visible ledge.

## Standing one carcass in the top of another

A carcass with a carcass below it can be built without a bottom panel. Its
sides, dividers and back then stand in shallow locating dados cut into the **top
face** of the panel below, which becomes its floor. The carcass actually
standing on the ground always gets a bottom of its own — there is nothing
underneath for it to stand in.

It is the same housing joint as everywhere else, so the sides grow into their
dados and get their front corners notched automatically. That notch matters
here more than usual: the panel below is the visible ledge at the front, so the
dado stops short of it and nothing shows.

```
Locating dado depth = stackDadoDepth, 4 mm by default
Sides, dividers, back all reach down into it
Glue them in; gravity does the rest
```

**The cost.** That top panel already carries grooves on its underside for its
own carcass's dividers and back. Adding locating dados to its top face means it
has to be turned over on the bed, and the diagnostics say so.

The two sets of pockets also **cross**, near the back where the lower carcass's
back groove runs under the upper one's side dados. That is why the locating dado
is shallow by default: 6 mm underneath plus 4 mm on top leaves 7.8 mm of a 17.8 mm
panel. There is a check for exactly this — pockets on opposite faces that
overlap are measured, and you get a warning below 4 mm of remaining material and
an error if they meet through the panel.

## Back panels

Captured on all four sides — sides, top and bottom or floor — using the same
dado logic as everywhere else, running through at both ends since there is no
front edge to hide it on. A back always sits in a plain housing joint, whatever
the carcass joint is set to: tabs through a back panel would be pointless work.

Two styles, both built from `applyDado`, differing only in whether the pocket
stops short of the true rear edge or is deliberately grown out to meet it.

**Groove (default).** The pocket stops `back.inset` short of the panel's true
rear edge, leaving a shoulder of solid material behind it. The back is fully
hidden: nothing shows from the rear, and the sides', top's and bottom's own
true edges stay untouched, which is what makes them scribable to a wall
independently of the back.

**Rabbet.** The pocket is grown out to the panel's true rear edge instead of
being stopped short of it — the same joint, with no notch needed, since unlike
a stopped front there is no solid material ahead of an open end to hide. With
`back.inset` at zero the back's own outer face lands flush with that edge too,
so the sides' rear edges and the back present one continuous flat plane. That
is the reason to offer a rabbet at all: it can be scribed or planed to an
out-of-true wall in one pass, where a recessed groove back would leave the
back's face stepped behind the sides and awkward to reach.

Pick groove to keep the back invisible from behind; pick rabbet when the back
of the carcass has to meet a wall that is not flat.

## Hanging rail

A wall cabinet's own back panel is thin by default (12 mm) and is not something
to trust with the cabinet's weight, its contents, and every knock it takes over
the years. Cabinetmaking guides solve this the same way: rip a strip of full
carcass-thickness material in behind the top and screw through *that* instead.
Rockler's own build guide for upper kitchen cabinets rips its mounting cleats
about 4 in (100 mm) wide, captured between the sides the same way this rail is;
general cabinet-installation advice is to drive the screw through a ¾ in
plywood rail into at least two studs.

It is the same housing joint as the toe kick rail, just at the top instead of
the bottom, and — like a shelf, not like the toe kick rail — **one segment per
bay** rather than one piece spanning the outer sides:

```
Each segment spans one bay, captured in a plain dado in whatever bounds it
A divider always reaches the top regardless of the rail: it is jointed there
So a rail spanning the full width would run straight through every divider
Its rear face sits flush against the back panel's own inner face
Its top face sits flush under the top panel
The storage interior below gives up hangingRail.height of ceiling height,
the same way it gives up floor height to a toe kick
```

Positioning it flush against the back and flush under the top means it never
has to compete with either for the same space, and a screw driven forward from
inside the cabinet reaches straight through the rail into the wall behind. The
rail's own screw holes run **through its face**, not into its edge, so unlike
every other joint here there is no depth to guess: `depth: 'thru'`.

Screw positions are spread along each segment with both ends held in and never
more than `screwSpacing` apart (400 mm by default, comfortably under a stud's
usual 16 in / 406 mm), and never fewer than two per segment — this is the one
part in the whole generator sized against something the machine cannot see:
the studs behind the wall.

Only a wall cabinet turns this on; every other type leaves `hangingRail`
disabled, because nothing else in this generator is hung rather than stood.

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

## Not a joint: the scribe strip

The strip or filler that fits a run to a crooked wall carries **no machined
fixings at all**, and that is on purpose. Where it finally lands is decided
against the plaster with a pencil and a block, not on the screen, so a hole
drilled for it here would be a hole in the wrong place. Screw it through the
cabinet side, or pocket-screw it from behind, once it is scribed. See
[OPENING.md](OPENING.md).
