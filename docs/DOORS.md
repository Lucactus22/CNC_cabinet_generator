# Doors and hinges

Doors are switched on per bay: none, a single leaf hinged left or right, or a
pair. Hardware is **IKEA UTRUSTA**, which is Blum's pattern, so anything else in
the 35 mm cup family fits the same boring.

## Fit

**Overlay** hangs the doors in front of the carcass. Each leaf covers half of
whatever panel it shares with its neighbour and all of an outer side, so the run
reads as one continuous front with an even reveal throughout. Vertically it
stops under the top panel — on a capped carcass that is the visible ledge — and
above the toe kick.

**Inset** sits the door inside the opening with a clearance all round.

A pair splits its bay down the middle with a reveal between, hinged on the
outside edges.

## Hinge boring

| | Value | Where it comes from |
|---|---|---|
| Cup diameter | 35 mm | The European standard |
| Cup depth | 13 mm | Leaves 4.8 mm behind it in 17.8 mm ply |
| Boring distance | 5 mm | Door edge to the **edge** of the cup. Blum publishes 3–6 mm |
| Cup centre | boring distance + 17.5 mm | The radius; **this is the number people get wrong** |
| Dowels | 2 × Ø8 mm | UTRUSTA is press-fit, not screwed |
| Dowel spacing | 45 mm | Centre to centre, along the door edge |
| Dowel offset | 9.5 mm | Behind the cup's centre line, into the door |
| Cup from door end | 76.2 mm | Three inches, the trade standard |

Hinges per door follow the usual rule: two up to 900 mm, three to 1600 mm, four
to 2100 mm, five beyond. The end pair sit at the fixed offset and any others are
spread evenly between them.

The cup is emitted as a **pocket**, not a drilled hole. A 35 mm Forstner does it
in one plunge if you have one in the spindle, but every 3-axis router can clear
a 35 mm circle with the cutter already fitted, so pocketing is what the file
assumes. Assign a drill operation to it instead if you would rather bore it.

### In the carcass

The mounting plates get two Ø5 mm holes on the 32 mm system: 37 mm in from the
front edge, 32 mm apart, centred on each hinge. They land on the panel's inner
face, which is already the face being machined, so they cost no extra setup.

## Door designs, and the flip

A door is the one part that is *meant* to be machined on both faces. The hinge
cups and dowels go on the back; the design goes on the front. There is no way
round it and it is worth the setup.

Designs come from the surface effects system, so a door takes any of them:

- **Frame** — a rectangular groove run round the face, the shaker line in the
  reference photographs. Set the inset from the edge, the groove width and its
  depth.
- **Grooves** — beadboard, vertical or horizontal.
- Or leave it plain.

Add one under **Surface effects**, target *Doors*, face *Outside*.

The diagnostics call this out in the door's own terms rather than suggesting you
move the design to the back:

> Base door, bay 1: hinge boring on the back and the frame design on the front
> means this door is machined on both faces. Cut the front, turn the sheet over
> left to right, then cut the _FLIP layers.

Back-face geometry lands on `_FLIP` layers, mirrored across the sheet so it is
correct once the sheet is turned. See [DXF.md](DXF.md).

## Checks

- A cup deeper than the door material is an error; less than 3 mm left behind it
  is a warning.
- A boring distance outside 3–8 mm is flagged, since the hardware will not sit.
- Plate holes deeper than the carcass panel are flagged.
