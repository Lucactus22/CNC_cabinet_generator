# Doors and hinges

Doors are switched on per bay: none, a single leaf hinged left or right, or a
pair. The hinge is chosen from the catalogue by id; the default is **IKEA
UTRUSTA**, which is Blum's pattern, so anything else in the 35 mm cup family
fits the same boring. The numbers below are that entry's — see
[HARDWARE.md](HARDWARE.md) for the others and for how to describe your own.

## Fit

**Overlay** hangs the doors in front of the carcass. Each leaf covers half of
whatever panel it shares with its neighbour and all of an outer side, so the run
reads as one continuous front with an even reveal throughout. Vertically it
stops under the top panel — on a capped carcass that is the visible ledge — and
above the toe kick.

**Inset** sits the door inside the opening with a clearance all round.

A pair splits its bay down the middle with a reveal between, hinged on the
outside edges.

## Frameless or face frame

A carcass is frameless by default: a door fronts the carcass opening
directly, and an overlay door covers a side or divider edge to edge because
there is nothing else there to cover. Set `construction` to face frame
(R-07) and a frame of solid stock — two outer stiles, one more per divider,
a rail top and bottom, see [JOINERY.md](JOINERY.md) for how they are jointed
— stands proud of the carcass front, and every door in that carcass fronts
*it* instead.

Door layout never asks which one it is looking at. Both produce the same
shape, an **opening** — a clear rectangle, plus how far each edge may be
overlaid — and one function turns an opening plus a fit into a door's box.
What changes between them is only how far overlay reaches:

- **Frameless.** An outer edge overlays the full thickness of the side panel
  behind it; a shared edge overlays half the divider. There is nothing
  between "covers it" and "does not," because the panel behind is only as
  thick as the carcass material.
- **Face frame.** A stile or rail is typically 40-60 mm wide, wide enough
  that covering it edge to edge would hide the frame the style exists to
  show. `FaceFrameSpec.overlay` sets a consistent reveal onto every member
  instead — the standard overlay-hinge convention, and what "partial
  overlay" means in practice. Set wider than the member it lands on, it is
  held to that member's own outer edge and the project says so, rather than
  hanging a door edge out over the carcass side with nothing under it.

Inset works the same way against either: the door sits inside the clear
opening plus its own gap, whether that opening is bounded by the carcass
sides or by the stiles and rails standing in front of them.

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

### In a face frame

The same two Ø5 mm holes, 32 mm apart, on the same face — but a stile has no
carcass-panel depth to measure "37 mm in from the front edge" into: its whole
thickness is already spoken for by the half lap at each end (see
[JOINERY.md](JOINERY.md)). The 37 mm is measured instead from the stile's own
edge next to the door, which is the edge that plays the part a carcass panel's
front edge plays for a frameless hinge. It is the same catalogue entry and the
same numbers either way; only the edge they are read from moves.

A stile that also carries this project's default UTRUSTA hinge is bored on
face A — the back, the face looking into the cabinet — which is the same
face the half lap already cuts into at the stile's ends. Nothing about the
stile needs turning over on the bed for either operation.

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

## Handles

Off unless one is chosen, because a handle bores holes right through the front
of a finished door. Fixing centres are multiples of the 32 mm system (96, 128,
160, 320 mm) and the screws are M4, so the clearance hole is 4.5 mm. A handle id
that names nothing bores nothing — it is the one piece of hardware that does not
fall back to a default, because falling back would drill the door.

A vertical bar is referenced to the door's **opening** edge, the one away from
the hinges, so a door hinged left and one hinged right both get their handle
where a hand reaches for it. The holes go right through, so they can be cut from
whichever face the door is already on the bed for: a handle never adds a flip.

Where along that edge it sits is taste, not specification, so it is a setting
with a conventional default and the diagnostics read the result back in
millimetres. See [HARDWARE.md](HARDWARE.md).

## Checks

- A cup deeper than the door material is an **error**; less than 3 mm left
  behind it is a warning.
- A boring distance outside the range the chosen hinge publishes is flagged,
  since the arm cannot reach its own mounting plate — 3–6 mm for UTRUSTA,
  3–7 mm for Blum CLIP top. Only when hinges are actually being bored: a
  project with no doors hears nothing about them.
- A door outside the thickness the hinge is published for is flagged, naming the
  hinge and the limit.
- Plate holes deeper than the carcass panel are an **error**: they come out of
  the outside of the cabinet.
- A handle whose fixing holes fall off the blank is an error; one whose body
  overhangs the end of the door is a warning.
