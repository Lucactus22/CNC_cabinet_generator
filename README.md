# Cabinet CNC Generator

Parametric cabinet designer that outputs **CNC-ready DXF** for import into CAM
(VCarve/Aspire, Fusion 360, Carveco, Carbide Create), with a live 3D preview,
sheet nesting, and manufacturability checks against your actual machine.

Everything runs in the browser. Nothing is uploaded; your designs never leave
your computer.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # geometry and the web app
npm run test:e2e # builds, serves and drives it in a browser
```

**Version 0.1.** A run of cabinets, cutting real parts. See
[docs/ROADMAP.md](docs/ROADMAP.md) for the path to 1.0, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works inside.

## Using it

The cabinet is the workspace, not a picture next to a form.

**Choices are pictures.** Every option with a visible consequence — how the
boxes go together, how the top meets the sides, how the back goes in, what
fronts a bay — is chosen by looking at what it produces, under a heading that
asks the question rather than naming the field. The pictures are *generated*:
each one is a small cabinet run through the same pipeline as your design, using
your sheet thickness and your cutter, so they cannot drift from what the tool
actually cuts. Where the difference is inside the panels the picture is a real
section through them, with the grooves, slots and hinge cups in it. Hover an
option and it appears on your own cabinet, with what it costs in parts, sheets
and machining written underneath; click to keep it. Options that cannot be used
on the thing you are looking at are shown greyed with the reason, not hidden.

**A new browser opens on five cabinets to start from** — the reference unit, a
run of base units, a wall cabinet, a wardrobe and a bookcase — each shown as a
render of the project it loads, and each keeping the workshop settings you
already have. It is also under the ☰ menu as *Start from a design…*.

**The run strip** along the bottom is the project drawn out: a column per
cabinet, a box per carcass, a cell per bay. Click any of them to work on it,
drag a cabinet to move it along the wall, `+` to add one.

**The inspector** floats at the right and shows only what applies to whatever
is selected — a bay's shelves and drawers, a carcass's size and panels, a
panel's banding and effects. Click a panel in the 3D view and it comes up
there. Nothing selected means the run is selected, which is the project itself:
its name, and the room it has to fit.

**Workshop** holds the machine, the tooling, the sheets, the tape and the
hardware — the shop rather than the cabinet. Save it under a name and the next
design starts already knowing your machine. Applying a saved workshop is an
ordinary undoable change that says what it altered; a project always keeps its
own full parameters, because the sheet thickness a design was cut to sets every
groove in it.

**Output** is the pack you take to the machine: sheet layouts, the cut list,
part drawings, the label sheet and the assembly steps, in one printable run.

**The readiness chip** in the top bar is the single answer to "can this be
cut". Click it for the list, with repeats collapsed and — where one exists — a
fix that has been run through the whole pipeline before being offered, with
what it costs in sheets and yield written on the button.

**Find…** (Ctrl/Cmd+K) searches every setting by name, including the words a
woodworker uses rather than the ones on the labels: *kickboard* finds the toe
kick, *rebate* the rabbet, *knock-down* tab and slot, *beadboard* the grooves.
It also searches the explanations, so *dogbone*, *half lap* and *scribe* find
what they are as well as where they are set.

**What this can make** — under the ☰ menu — is the showroom: every joint,
panel, front, surface and way of fitting a room this tool can cut, each with a
render the pipeline made on *your* sheets and cutter, what it is, why it is
shaped that way, and the numbers off your own project. It changes nothing, so
it is safe to open mid-job. Where a capability genuinely has no shape — edge
banding takes two millimetres off a blank — it says so instead of showing a
picture of something else.

**Selecting a panel says what is cut into it and why.** *Housing for a
divider*, *screw clearance holes*, *hinge cup*: open one and you get a section
through your own cabinet at that joint, its clearances, and a line on the
constraint that shapes it. Every one of those lines is bound to a section of
the documentation, and a test reads that section back, so an explanation cannot
outlive what it explains.

**A quiet line, once.** Where something plainly applies to what you are looking
at — a box on the floor with no toe kick, a plain door that could take a shaker
line — the inspector says so in one sentence at the foot of the panel. Never
more than one, never while you are mid-change, and gone for good once you have
seen it.

## What it makes

A **run of cabinets** standing side by side along a wall. Each cabinet is a
stack of one or more **carcasses** sitting on each other, rear faces flush
against the wall so a shallower box on top steps back at the front and the panel
below it forms a ledge.

The default project is one cabinet of two carcasses — a deep base with a
shallower shelved upper on it, the unit in the reference photographs. Add
cabinets to the run, stack more carcasses, reorder them, and every part is
nested, listed and checked across the lot.

New cabinets start from a **type**: base (toe kick, capped top, doors), wall
(shallower, no toe kick, a hanging rail to screw it up by), tall/pantry (floor
to near ceiling, fixed shelves behind double doors), or the stacked pair above.
A type is only a starting point — every field stays editable afterwards.

Each carcass is fully parametric: integral toe kick on the one standing on the
floor, vertical dividers, and per-bay shelves that are either dadoed in place or
sit on a 32 mm shelf pin ladder.

A carcass's top panel can be **capped**: it laps over the side panels rather
than sitting between them, so the finished ledge reads as one unbroken surface
with no joint line showing from above. The sides run up into shallow dados in
its underside — the face already being machined for the dividers and the back,
so capping costs no extra setup.

A stacked carcass can also be built **without a bottom of its own**, standing
instead in shallow locating dados machined into the top panel below it. One less
panel, one less joint line, and gravity holds it while the glue goes off. The
cost is that the panel below is then machined on both faces, which the
diagnostics say plainly.

Every part carries an ID naming where it came from — `C1-B-SIDE-L` is the left
side of the base carcass of the first cabinet — and that ID is engraved on the
LABEL layer, so a pile of panels off the machine sorts itself.

## Fitting a crooked room

Real walls lean, corners are not 90°, floors slope and plaster bows. **Measure
the room…** walks you through it one page at a time — what to hold a tape
across, where to hold it, and a sketch of each — then works out the largest
**square** box that will fit, shows you the derivation to check against your
tape, and generates the parts that take up the difference.

The corner angle is the one number nobody can measure directly, so it is not
asked for: mark the floor a measured distance out along each wall, read the
diagonal between the marks, and the angle falls out of it. That is the 3-4-5
rule, which is how the trade has always done it. Three readings that cannot be a
triangle get told so rather than turned into a confident wrong angle.

The carcass stays square. Every joint here assumes rectangles, doors and drawer
slides need parallel sides, and it is not how the trade solves it either: a
cabinetmaker builds square and scribes the *interface* to the wall. So the
crookedness comes out as a **scribe strip** or **filler panel** at each end,
**tapered** where the wall leans, with a uniform allowance left on to plane back
to the plaster. A stack that steps back gets one per front plane, so nothing
stands proud of the box behind it. A sloping floor is reported as a levelling
allowance with a recommendation, not silently built into the toe kick.

> The opening is 12 mm narrower at the bottom than at the top. The strips follow
> 6 mm of that; a 20 mm scribe allowance covers the remaining 6 mm with 14 mm to
> spare.

A square opening the run already fills produces nothing at all. See
[docs/OPENING.md](docs/OPENING.md).

## Doors

Doors are switched on per bay: single hinged left or right, or a pair. The
hinge comes from a **catalogue** — IKEA UTRUSTA, Blum CLIP top BLUMOTION or
Hettich Sensys — and every dimension of the boring comes with it: a 35 mm cup
with two 8 mm press-fit dowels 45 mm apart, sitting 9.5 mm behind the cup's
centre line, plus mounting plate holes on the 32 mm system in the carcass. Hinge
count follows door height, and the cup centre is derived from the boring
distance plus the cup radius — the number that ruins doors when it is guessed.

Overlay or inset fit, with an even reveal throughout the run.

Door faces take any surface effect: a **frame** groove for the shaker look in
the reference photographs, beadboard grooves, or plain. Hinge boring on the back
and a design on the front means a door is machined on both faces — the one part
where that is expected rather than avoided. See [docs/DOORS.md](docs/DOORS.md).

Handles are bored on request: a bar or a knob on the door's opening edge, as
clearance holes right through, so they never add a flip. Nothing is drilled
until one is chosen. See [docs/HARDWARE.md](docs/HARDWARE.md).

## Drawers

Turn a bay into a stack of drawers instead of doors and shelves — one or the
other, never both — with each drawer's own front height. The box (two sides,
a sub-front, a back and a bottom) is sized from the bay's opening and the
chosen **slide**: Blum TANDEM plus BLUMOTION 563H or 563F, picked from the
same catalogue a hinge is. The width formula, the running length, the notch
for the locking device and the fitting checks are all the runner's own
published numbers. See [docs/DRAWERS.md](docs/DRAWERS.md).

The drawer front is built exactly like a door — same opening, same overlay
or inset fit, same reveal — and takes any surface effect a door can.

## Surface effects

Decorative machining on a face you choose: evenly spaced grooves give the
beadboard look on a back panel. Pick the surface (by role, or select a single
panel), the face, direction and spacing.

Grooves stay inside the panel's **visible** area, which excludes the tongues
buried in the carcass grooves — so nothing shows at the joint line. If an effect
lands on the face opposite to whatever is already machined, you get a warning,
because that means turning the panel over on the bed.

Effects are a registry: a new one is an applier function plus a line in
`EFFECTS`, with no changes to the builder, nester or exporter. See
[docs/EFFECTS.md](docs/EFFECTS.md).

## The joinery

Two carcass joints, both fully machinable from a flat sheet on a 3-axis router.

**Stopped dado + screws** (default). The groove holds back from the front edge
so the joint does not show on the finished face, and the mating panel's front
corner is automatically notched to clear both the stop *and* the radius the
cutter leaves at the end of the pocket. Groove widths come from your **measured**
sheet thickness, not the nominal size.

Screw clearance holes are drilled straight through the outer panel, on the
centreline of every groove, from the same face as the groove itself — so nothing
gets marked out at assembly and no panel is turned over for them. The hole is
sized to *pass* the threads: one sized to grip would have the screw biting in
the outer panel and jacking the joint apart instead of pulling it together.

**Through tab and slot.** Self-jigging, no fasteners needed. Every slot corner
gets a dogbone or T-bone relief, and so does every tab root — without that, the
cutter's radius holds the shoulder off the mating face.

Plus back panels in a groove or rabbet, and 32 mm shelf pin ladders — 5 mm or
1/4 in holes, whichever pin the project is cut to, with the rows 37 mm in from
each edge.

Dowels and Confirmat are deliberately absent: they need boring into a panel's
edge, which a 3-axis flat-bed router cannot do. See
[docs/JOINERY.md](docs/JOINERY.md) for the geometry and the reasoning.

### One rule worth knowing

**Every part should be machinable from one face.** Flipping panels is where
accuracy goes on a hobby machine. The default joinery achieves this for every
part except a divider with shelves on both sides, which genuinely cannot avoid
it — and that part is flagged in the diagnostics, with its second-face geometry
written to `_FLIP` layers, mirrored so it lands correctly once you turn the
sheet over left to right.

## Edge banding

Plywood edges get taped once they are off the machine, and tape has thickness:
a shelf cut to its full designed depth comes out oversize the moment banding
goes on its front edge. Turn banding on per part role — a shelf's front edge,
every edge of a door — and the panel is cut short by the tape's own thickness
on exactly those edges, so gluing the tape on afterwards brings it back to the
size it was designed at.

Banding tape isn't a sheet good, so it gets its own short list: a name and a
thickness, reported in the cut list by length rather than area. The parts view
marks every banded edge on the drawing, and says which tape it takes.

## Your machine

Enter your travels and which axis the stock feeds through. The tool then checks
what you have actually asked for:

- A part whose **smaller** dimension exceeds the travel on the axis that does
  not feed is impossible, and says so.
- A **sheet** wider than that same travel is impossible too — feeding stock
  through cannot rescue it, because that axis never moves. On a 1 × 1 m machine
  with 2440 × 1220 sheets, this is the first thing you will see.
- Sheets longer than the machine are split into feed-through tiles, and you get
  **one DXF per tile** with coordinates zeroed to that tile's origin.

There is a **Set sheets to machine size** button. On a small machine, nesting
into blanks the size of your bed usually beats tiling: more sheets, but no
registration, no seams, and no chance of drift.

### Sheet stock: sizes and remnants

A material is not one sheet size — it is every size you can put it in the nest
from. A **standard** size carries no quantity: the nester treats it as always
available, because you just order another sheet. A **remnant** carries a fixed
quantity — however many you actually have leaning against the wall — and is
spent before a fresh standard sheet is opened, smallest first so a big offcut
is not wasted on a part a small one would have carried. Once a remnant's
quantity runs out, the nester falls back to the next size that fits.

The nester also tracks what is left once a sheet is full: any leftover space
with a shorter side above the **remnant threshold** is reported as a usable
offcut, sized, so you know what is worth keeping for the next job rather than
sweeping it into the bin. Set the threshold to whatever is too small to bother
storing.

### Nesting: fewest setups, least material, or a panel saw

**Fewest setups** (default) keeps every part inside a single machine tile and
fills the earliest tile first. Nothing is cut across a seam unless the part is
itself larger than the machine. **Least material** packs as tightly as it can
and lets parts fall where they will.

**Guillotine** is for a panel saw rather than a router: every part is placed so
the whole layout can be recovered by a sequence of straight, full-length cuts,
which is the only kind of cut a saw can make. A router mills each part's own
outline regardless of what sits next to it, so the other two strategies can
tuck a part into a pocket a saw could never reach without cutting through its
neighbour first. That guarantee costs yield against the other two — a real
trade, not a bug — so it is worth picking only when you are actually breaking
sheets down on a saw.

The number of setups follows how far the parts actually reach, not the blank's
nominal length, so a half-filled sheet only needs the setups that cover it.

On a typical cabinet fewest-setups and least-material come out at the same
sheet count and the same yield, and fewest-setups still removes every avoidable
seam crossing. Where they do diverge, it is a straight trade: a little more
offcut for a little less time at the machine. Neither makes any difference when
nothing needs tiling.

### Tiling workflow

Each tile cuts a band exactly one step wide, where step = travel − overlap. The
overlap is headroom, not double-cutting; nothing is machined twice.

1. Cut tile 1. It drills the `TILE_REG` holes through the waste into your
   spoilboard.
2. Drop pins in those holes, keep the stock against a fence.
3. Pull the pins, slide the stock forward by one step, re-pin. The holes you
   just drilled land on the same pins.
4. Load the next tile file and cut. Repeat.

## Output

| File | What it is |
|---|---|
| `<name>-sheet<N>.dxf` | One nested sheet, whole |
| `<name>-sheet<N>-tile<M>.dxf` | One tile, zeroed to its own origin |
| `<name>-cutlist.csv` | Every part with sizes, sheet, and hole counts |

DXF is **R12 (AC1009)**, the most widely readable flavour, with arcs on polyline
bulges. Cut depth is encoded in the layer name so your CAM can assign both the
strategy and the depth on import:

| Layer | Toolpath |
|---|---|
| `OUTLINE` | Profile, outside, full depth, with tabs |
| `THROUGH` | Profile, inside, full depth |
| `POCKET_D6` | Pocket to 6 mm |
| `DRILL_5_D12` | Drill 5 mm dia, 12 mm deep |
| `DRILL_4.5_THRU` | Drill 4.5 mm, through |
| `TILE_REG` | Registration pin holes |
| `LABEL`, `SHEET` | Reference only, do not machine |

Layer names are upper case because R12 cannot carry lower case. If your importer
dislikes decimal points, tick **safe layer names** to get `POCKET_D6P35`.

Full spec: [docs/DXF.md](docs/DXF.md).

## Build guide

The **Output** surface is a printable pack: sheet layouts, the cut list, a
drawing of the selected part, a label for every part — id, size, material and
which face is up — and a step-by-step assembly order.

The order is never hand-authored. It falls out of the same joint graph the
builder used to decide what meets what: a panel is only ever scheduled once
everything it houses into is already in place, so a capped top is fitted
before the sides that grow up into it and a back panel waits for the sides
and bottom it is captured between. Doors are hung once their carcass exists,
drawer boxes are mounted on their runners once they are glued up, and a
loose adjustable shelf is dropped in last — each step naming its own
hardware and how it is fixed. A cabinet with no doors gets no door steps; add
drawers and the guide grows steps for them without anyone having written a
line for that case. Print it, or save it as a PDF, straight from the browser.

## Undo, autosave and your projects

Every change is undoable — **Undo**/**Redo** in the topbar, or Ctrl/Cmd+Z and
Ctrl/Cmd+Shift+Z. Dragging a field or typing a number undoes as one step, not
one per keystroke, and **Reset counts as a change too**: a stray click gets you
back in one Undo.

The open project autosaves to this browser as you work, so closing the tab or
reloading picks up exactly where you left off, with nothing to click. The
project menu (**☰**, top left) writes a project file you can put anywhere, and
keeps a shelf of designs in this browser under a name, for the ones you want to
reopen later without hunting through downloads.

## Before you cut

1. **Measure your sheet** with calipers and enter the real thickness. 18 mm ply
   is usually 17.4–17.8 mm, and every groove width is derived from it.
2. **Cut one test joint** before committing a full sheet. If it is tight, raise
   the fit clearance; if sloppy, lower it.
3. Check the readiness chip says *ready to cut* rather than *n blocking*.

## Layout

```
packages/core/   zero-dependency TypeScript: model, joinery, nesting, DXF
apps/web/        React + three.js front end
docs/            architecture, roadmap and the domain references
```

`packages/core` has no runtime dependencies and no UI, so the geometry is
testable on its own and reusable from a CLI or a different front end.

## Documentation

| | |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | How the pipeline fits together, the invariants, where to add things |
| [ROADMAP](docs/ROADMAP.md) | What 1.0 means and the work orders to get there |
| [UX](docs/UX.md) | Who this is for, the journeys measured, and the interface architecture chosen |
| [FEATURE SUGGESTIONS](docs/feature_suggestions.md) | Ideas considered but not committed to |
| [JOINERY](docs/JOINERY.md) | Every joint, with the geometry and the reasoning |
| [DOORS](docs/DOORS.md) | Doors, hinge boring, handles, face designs |
| [DRAWERS](docs/DRAWERS.md) | Drawer boxes, undermount slides, the rear notch |
| [HARDWARE](docs/HARDWARE.md) | The catalogue: hinges, shelf pins, handles, slides, and your own |
| [OPENING](docs/OPENING.md) | Measuring a crooked room and scribing a square run to it |
| [EFFECTS](docs/EFFECTS.md) | Surface decoration and how to add a new kind |
| [DXF](docs/DXF.md) | Output format, layer convention, tiling workflow |
| [CLAUDE.md](CLAUDE.md) | Conventions and definition of done for contributors |

## Known gaps

Honest list, all tracked in the roadmap: the web app's only tests are the ones
that guard every parameter having a control; component and end-to-end coverage
is still to come. A bay can be picked in the run strip, but not by clicking the
cabinet itself.

Millimetres only, deliberately.

## Licence

None
