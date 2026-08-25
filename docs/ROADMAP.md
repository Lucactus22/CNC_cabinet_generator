# Roadmap to 1.0

**Current version: 0.1.** One cabinet type, fully parametric, cutting real DXF.

Each item below is a **self-contained work order**. Pick the first one that is
not done, read it, read [ARCHITECTURE.md](ARCHITECTURE.md), and work it to its
acceptance criteria. Items are ordered so that dependencies come first — do not
skip ahead without reading the *Depends on* line.

---

## What 1.0 means

> A woodworker can lay out a run of several cabinets of different types, with
> doors and drawers, using hardware they can actually buy, nest it across all of
> it, confirm it is machinable on their own machine, and take DXF, a cut list
> and assembly documentation to the workshop — in millimetres or inches.

0.1 does the last third of that sentence well. 1.0 is mostly about the first
two thirds, plus the workshop paperwork that turns a pile of parts into a
cabinet.

### Deliberately *not* in 1.0

Stating these so nobody builds them by accident:

- **G-code.** The tool stops at DXF. CAM knows the machine, the tooling and the
  feeds; this does not, and pretending otherwise would be worse than useless.
- **Curved work.** Anything with a radius in plan. Straight lines and rectangles
  only, plus the tapered interface parts R-05 needs.
- **Non-rectangular carcasses.** Out-of-square rooms are handled by scribing a
  square box to a crooked wall (R-05), which is how it is done in a workshop and
  the only way doors and drawers keep working. See that item for the reasoning.
- **A backend.** It stays a static site that runs entirely in the browser.
- **Imperial units.** Millimetres only. `CabinetParams.units` is a leftover and
  R-02 deletes it.

---

## Milestone A — Correctness and foundations

Nothing else should be built on top of a known defect or a unit system that only
half exists.

### R-01 — Implement the rabbet back, or remove it
`Milestone A` · `Depends on: nothing` · `Size: S`

**Problem.** `back.style: 'rabbet'` is offered in the UI and in the model, and
does nothing. `buildCarcass` only pushes back-panel joints when the style is
`'groove'`, so choosing rabbet builds a back panel with **zero joints**: it is
sized to the clear opening and floats, unjoined, into the cut list. A user can
select it today and get a wrong cabinet with no warning.

**Goal.** A rabbet back is machined properly: a rebate along the rear inside
edge of each side, top and bottom, with the back sitting into it. Or, if it is
judged not worth the work, the option is removed from the type and the UI so
nothing offers what it cannot do.

**Where.** `build/builder.ts` (the `spec.back.style === 'groove'` branch),
`joinery/dado.ts`, `model/types.ts`.

**Design notes.** A rabbet is a groove that runs off the rear edge rather than
sitting in from it, so it is the existing dado joint with the pocket extended to
the panel edge. Reuse `applyDado` with a depth override rather than writing a
new strategy. A rabbeted back is easier to scribe to an out-of-true wall, which
is the reason to offer it at all — say so in the docs.

**Acceptance criteria.**
- [ ] Selecting rabbet produces a rebate on each surrounding panel and a back
      sized to sit in it
- [ ] The back is captured on all four edges, as the groove style is
- [ ] `docs/JOINERY.md` describes the difference and when to pick which
- [ ] No option in the UI produces an unjoined part

**Tests.** Rabbet produces pockets on the side/top/bottom; the back panel's box
reaches into them; a regression test that **no part in any configuration ends up
with zero joints when it should have some**.

**Risks.** The rebate runs off the rear edge, so it has one open end — check the
notch logic does not try to hide a stop that is not there.

---

### R-02 — Repository hygiene
`Milestone A` · `Depends on: nothing` · `Size: S`

**Problem.** No linter, no formatter. Style is currently consistent only because
one author wrote it all. That will not survive several contributors, human or
otherwise. Separately, `CabinetParams.units` exists, is never read, and looks
like a feature to anyone reading the type — dead code that pretends to work is a
trap for the next person.

**Goal.** ESLint and Prettier configured, CI failing on violations, existing
code passing, and the unused `units` field removed.

**Where.** Repo root, `.github/workflows/ci.yml`.

**Design notes.** Keep the rule set small and opinionated. The one rule worth
enforcing beyond defaults: `packages/core` must not import from `apps/`, and
must have no runtime dependencies — an `eslint-plugin-import` boundary rule
catches both.

**Acceptance criteria.**
- [ ] `npm run lint` passes clean on the existing tree
- [ ] CI runs lint, typecheck, test and build, and fails on any of them
- [ ] A dependency boundary rule protects the core's purity
- [ ] `units` is gone from the model, the defaults and `normaliseParams`

---

## Milestone B — Projects, types and the room

This is the architectural step that unlocks the rest. Do it before drawers, or
drawers get written twice.

### R-03 — Make Cabinet a first-class entity
`Milestone B` · `Depends on: R-02` · `Size: L`

**Problem.** `CabinetParams` *is* the project, and it hardcodes exactly two
carcasses called `base` and `top`. Every feature so far has had to reach for
`params.base` or `params.top` by name. A second cabinet is impossible, and the
special-casing is already visible in the builder.

**Goal.** A `Project` holds an ordered list of `Cabinet`s. A `Cabinet` holds one
or more stacked `Carcass`es. The existing stacked unit becomes *one cabinet with
two carcasses* — a configuration, not a special case.

**Where.** `model/types.ts`, `model/defaults.ts`, `model/normalise.ts`,
`build/builder.ts`, `project.ts`, and the whole of `apps/web`.

**Design notes.** This is a refactor, not a feature: **the generated geometry
for the existing default must not change**. Snapshot the current output first
and assert it is identical afterwards — that is what makes a refactor this size
safe.

Part IDs currently start `B-` and `T-` for base and top. They will need a
cabinet prefix (`C1-B-SIDE-L`). Do this in one pass and update every test.

Keep `standsOnId` and the capped-top logic working — they already express
inter-carcass relationships and should generalise cleanly to *n* carcasses.

**Acceptance criteria.**
- [ ] A project can hold several cabinets, positioned along a run
- [ ] The default project generates byte-identical DXF to 0.1
- [ ] Nesting and the cut list span all cabinets in the project
- [ ] Part IDs identify their cabinet
- [ ] The UI has a cabinet list: add, remove, duplicate, reorder, select

**Tests.** The snapshot equality test above is the important one. Then:
several cabinets nest together; IDs stay unique; a cabinet can be removed
without disturbing the others.

**Risks.** The biggest item on the roadmap. Land the model change and the
snapshot test *first*, in their own commit, before touching the UI.

---

### R-04 — A library of cabinet types
`Milestone B` · `Depends on: R-03` · `Size: M`

**Problem.** Only one configuration exists. A real installation needs base
units, wall units and tall units.

**Goal.** Named types that seed a cabinet with sensible defaults: **base**
(toe kick, doors or drawers, capped top), **wall** (no toe kick, hanging rail,
shallower), **tall/pantry**, and **stacked** (the current 0.1 unit).

**Where.** A new `model/types-library.ts`, plus a picker in the UI.

**Design notes.** A type is a *preset*, not a class: it produces a `Cabinet`
made of the same carcasses everything else uses. Resist adding type-specific
branches to the builder — if a type needs something the model cannot express,
extend the model instead.

Wall units need a hanging rail, which is a new part role and a new joint. That
is the only genuinely new geometry here.

**Acceptance criteria.**
- [ ] Four types available from a picker, each producing a sensible cabinet
- [ ] No `if (type === ...)` branches in `build/builder.ts`
- [ ] Wall units carry a hanging rail, joined and drilled

---

### R-05 — Fitting an out-of-square room
`Milestone B` · `Depends on: R-03` · `Size: L`

**Problem.** Real rooms are crooked. Walls lean, corners are not 90°, floors
slope, and plaster bows. A cabinet built perfectly square leaves a tapering gap
down one side and rocks on the floor. Right now there is nowhere to even record
that the room is out of true.

**Goal.** The user measures the opening and enters what they measured. The tool
works out the largest square carcass that will fit, and generates the parts that
take up the difference: scribe strips, filler panels — tapered where the wall
leans — and a levelling allowance for a sloping floor.

**The decision this item rests on: the carcass stays square.**

Do not build a parallelogram box. Every joint in this codebase assumes axis
aligned rectangles, doors and drawer slides need parallel sides to work at all,
and it is not how the trade solves this either: a cabinetmaker builds square and
scribes the *interface* to the wall. Absorbing the crookedness in a handful of
sacrificial parts is both the correct answer and by far the cheaper one.

**Where.** A new `model/opening.ts` for the measured room, `build/builder.ts`
for the new parts, and `geom/outline.ts` — see the geometry note below.

**Design notes.**

What the user measures, per cabinet or per run:

| Measurement | Why it matters |
|---|---|
| Width at the top and at the bottom | A leaning wall makes these differ |
| Height at the left and at the right | A sloping floor makes these differ |
| Corner angle, where the run meets a return wall | Rarely 90° |
| Wall bow, the worst deviation from flat | Sets the minimum scribe allowance |

From those, derive the largest square envelope that fits inside the opening,
size the carcass to it less a scribe allowance, and emit the difference as
parts. Show the user the derivation — *"the opening is 12 mm narrower at the
bottom, so a 20 mm scribe strip each side covers it with 8 mm to spare"* — since
that is the number they will want to sanity-check against their tape.

A leaning wall needs a **tapered** filler, which is the one genuinely new piece
of geometry: a trapezoid rather than a rectangle. `buildOutline` currently
composes a rectangle with corner notches and edge tabs, so it needs a general
quadrilateral case. `geom/path.ts` already has `polygon()` to build on. Keep the
extension narrow — this is not an invitation to make every part an arbitrary
polygon.

Nesting works off bounding boxes, so a tapered part nests as its bounding
rectangle and wastes the offcut. That is acceptable and worth a comment; do not
complicate the packer for it.

For the floor, prefer a **levelling plinth**: the toe kick is cut to the worst
case and packed down, or the cabinet stands on adjustable feet with the toe kick
scribed separately. Recommend one, do not silently assume it.

**Acceptance criteria.**
- [ ] Opening measurements are part of the model and saved with the project
- [ ] The derived square envelope, and the clearance it leaves, are shown
- [ ] Scribe strips and filler panels are generated as real parts, tapered when
      the wall leans
- [ ] The 3D view shows the crooked opening around the square cabinet, so the
      user can see what is being taken up where
- [ ] A warning when the crookedness exceeds the scribe allowance, naming the
      measurement that is out and by how much
- [ ] A perfectly square opening produces no scribe parts and geometry
      identical to today's

**Tests.** The envelope derivation against hand-worked examples, including a
wall leaning each way; taper direction correct for a wall that leans in versus
out; a square opening changes nothing; the too-crooked warning fires.

**Risks.** Scope creep towards full room modelling. This item is about *one
opening a cabinet has to fit*, not a floor plan. Resist the second wall.

---

## Milestone C — Construction styles and hardware

### R-06 — A hardware catalogue
`Milestone C` · `Depends on: R-03` · `Size: M`

**Problem.** `HingeSpec` is a single hardcoded hinge on the project. Adding
drawer slides the same way would give a second one-off, and neither can be
swapped for what the user actually owns.

**Goal.** A data-driven catalogue: hinges, drawer slides, shelf pins, handles.
Each entry carries its boring pattern and its fitting rules. The project
references catalogue entries by id; users can add their own.

**Where.** A new `hardware/catalogue.ts`, `hardware/hinges.ts` generalised.

**Design notes.** Ship real entries, not placeholders: IKEA UTRUSTA (already
implemented and verified — see [DOORS.md](DOORS.md)), Blum CLIP top, and a
generic 35 mm cup. Each entry needs the numbers in `HingeSpec` plus a
`fits(part, context)` predicate so the diagnostics can say *"this hinge needs a
door at least 16 mm thick"* rather than the code assuming it.

Follow the effects registry pattern — it is the right shape and it already
works.

**Acceptance criteria.**
- [ ] Hardware selected by id from a catalogue, with the current UTRUSTA
      behaviour unchanged as the default
- [ ] Users can add a custom entry and it is saved with the project
- [ ] Every hardware item's constraints are checked and reported

---

### R-07 — Face-frame construction
`Milestone C` · `Depends on: R-03, R-06` · `Size: L`

**Problem.** Frameless only. Face-frame construction — a frame of solid stock
across the front of the carcass, with the doors set into or overlaying it — is
the dominant style in a lot of work, gives a quite different look, and is more
forgiving of a carcass that is a millimetre out. It also pairs naturally with
R-05: a face frame hides a great deal of scribing.

**Goal.** A cabinet can be built face-frame: rails and stiles generated as
parts, jointed to each other and fixed to the carcass, with doors and hinges
referenced to the frame opening rather than the carcass opening.

**Where.** `model/types.ts` (a construction style on the cabinet), a new
`build/faceframe.ts`, `hardware/catalogue.ts` for face-frame hinges, and the
door layout in `build/builder.ts`.

**Design notes.**

**Frame joinery: half-lap.** Of the usual options — pocket screws, dowels,
mortise and tenon, half-lap — the half-lap is the one a 3-axis router does
beautifully: both halves are pockets machined flat on the face, they
self-register, and they need no tooling beyond the cutter already in the
spindle. Make it the default and say why in `JOINERY.md`. Pocket screws are
worth offering as an alternative, but they are a jig operation, not a CNC one.

**Solid stock is a new material class.** Rails and stiles are cut from boards,
not from 1220 × 2440 sheets. The material model assumes sheet goods, so this
needs stock with a length and a width but no fixed sheet size, nested as a
linear cut list rather than a 2D nest. Keep the two apart in the cut list —
mixing board feet into a sheet count helps nobody.

**The door layout has to stop knowing about carcasses.** Today the door code
computes overlay from the carcass panels directly. With a face frame it must
reference the frame opening instead, and partial overlay on the stile becomes
the common case. Do **not** add an `if (faceFrame)` branch to the door layout.
The right shape is for door layout to consume an abstract *opening* — a
rectangle plus what it is allowed to overlay — that either the carcass or the
frame provides. That refactor is most of this item's real work, and it is worth
doing properly because drawer fronts (R-08) will need exactly the same thing.

**Hinges change.** Face-frame hinges use different mounting plates and are
bored into the frame, not the carcass side. That is a catalogue entry (R-06)
plus a different target panel for the plate holes — the existing hinge code
already takes the carcass panel as a parameter, so this should be small.

**Acceptance criteria.**
- [ ] A cabinet can be frameless or face-frame, chosen per cabinet
- [ ] Rails and stiles generated as parts with half-lap joints
- [ ] Solid stock is a distinct material class with its own cut list
- [ ] Doors reference the frame opening; overlay, partial overlay and inset all
      work against it
- [ ] Face-frame hinges bore into the frame with the correct plate positions
- [ ] Door layout has no branch on construction style
- [ ] Frameless cabinets generate geometry identical to before

**Tests.** Half-lap pockets on both halves at half the stock thickness and
meeting flush; frame opening dimensions derived correctly from rail and stile
widths; a door sized to a frame opening with partial overlay; the frameless
snapshot is unchanged.

**Risks.** The opening abstraction is the crux. If it is skipped and a style
branch goes into the door layout instead, R-08 will inherit the mess and cost
more than this item saved.

---

### R-08 — Drawer boxes and undermount slides
`Milestone C` · `Depends on: R-06, R-07` · `Size: L`

**Problem.** The single largest missing feature. Half the cabinets in the
reference photographs are drawers.

**Goal.** A bay can hold a stack of drawers. Each produces a box (two sides, a
front, a back, a bottom) and a drawer front, with the boring for undermount
slides.

**Where.** `build/builder.ts`, a new `hardware/slides.ts`, the bay model.

**Design notes — the numbers that matter.** For Blum TANDEM undermount, which
IKEA MAXIMERA follows:

- Drawer box **outside width = cabinet opening − 42 mm** for box sides up to
  16 mm, **− 49 mm** for sides between 16 and 19 mm.
- Box sides must be 12–19 mm; the runners are designed for that range.
- The box back sits **above** the bottom to clear the runner, and the box bottom
  needs a notch at each rear corner for the locking device.
- Box length follows the runner's nominal length, not the cabinet depth.

Get these from the catalogue entry (R-06), not from constants in the builder.

The drawer front is the same kind of part as a door and should reuse the door
code path, including surface effects, so a shaker drawer front costs nothing
extra. That means it also consumes the *opening* abstraction R-07 introduces,
and so works against a face frame for free.

**Acceptance criteria.**
- [ ] A bay can hold *n* drawers with configurable front heights
- [ ] Box parts are correctly sized from the opening and the slide entry
- [ ] Slide boring on the box sides and the cabinet sides
- [ ] Drawer fronts take surface effects exactly as doors do
- [ ] Warnings for a box outside the slide's supported width or side thickness

**Tests.** The width formula at both thickness bands; box parts fit the opening
with the slide clearance; a drawer front lines up with the door reveal above it.

---

## Milestone D — Workshop output

### R-09 — Edge banding
`Milestone D` · `Depends on: R-03` · `Size: M`

**Problem.** Plywood edges get banded, banding has thickness, and neither is
modelled. A cabinet built to these dimensions with 2 mm banding on the visible
edges comes out 4 mm oversize where it matters.

**Goal.** Per-part edge banding: which edges, what material, and the part sized
down to compensate.

**Where.** `model/types.ts` (a banding spec per part role), `build/builder.ts`,
`export/cutlist.ts`.

**Acceptance criteria.**
- [ ] Banded edges are declared per part role and per edge
- [ ] Part sizes are reduced by the banding thickness on banded edges
- [ ] The cut list reports total banding length per material
- [ ] The part drawing marks banded edges

---

### R-10 — Labels and assembly documentation
`Milestone D` · `Depends on: R-03` · `Size: M`

**Problem.** Twenty-one parts come off the machine and nothing says which is
which or what order they go together in. The engraved ID helps, but only if you
already know what `B-DOOR-1` is.

**Goal.** A printable pack: a label sheet, and step-by-step assembly with an
exploded diagram per step and the parts and hardware each step needs.

**Where.** A new `export/assembly.ts` and `export/labels.ts`; a print view in
the web app.

**Design notes.** The assembly order falls out of the joint graph the builder
already produces: a panel can be fitted once everything it houses into is
fitted. Derive the order, do not hand-author it.

**Acceptance criteria.**
- [ ] A label sheet with id, description, size and which face is up
- [ ] Assembly steps derived from the joint graph, not hardcoded
- [ ] Each step lists its parts, hardware and fixings
- [ ] Both print cleanly to PDF from the browser

---

## Milestone E — Production quality

### R-11 — Nesting: offcuts and mixed sheet sizes
`Milestone E` · `Depends on: R-03` · `Size: M`

**Goal.** Track usable offcuts and let a material carry several sheet sizes,
including remnants the user already has. Add a guillotine strategy for anyone
cutting on a panel saw rather than a router.

**Acceptance criteria.**
- [ ] A material can hold several stock sizes, each with a quantity
- [ ] Remnants above a threshold are reported with their sizes
- [ ] A guillotine strategy sits alongside the existing two

---

### R-12 — Move generation off the main thread
`Milestone E` · `Depends on: R-03` · `Size: M`

**Problem.** The pipeline runs on every keystroke. At one cabinet that is
invisible; at a fifteen-cabinet kitchen it will not be.

**Goal.** Run `buildProject` in a web worker, with the last good result held
while a new one computes.

**Design notes.** The core is already pure and dependency-free, which is exactly
what makes this cheap. Do not make it async — wrap it.

**Acceptance criteria.**
- [ ] Generation runs in a worker; the UI never blocks
- [ ] Rapid parameter changes coalesce rather than queue
- [ ] A large project still previews smoothly

---

### R-13 — Undo, autosave and a project library
`Milestone E` · `Depends on: R-03` · `Size: M`

**Goal.** Undo/redo across parameter changes, autosave to `localStorage`, and a
list of saved projects to open. Losing an hour's work to a stray reset is not
acceptable at 1.0.

---

### R-14 — Test the web app
`Milestone E` · `Depends on: R-02` · `Size: M`

**Problem.** `apps/web` has no automated tests. Every UI regression so far has
been caught by a human looking at a screenshot.

**Goal.** Component tests for the parameter panel and the export bar, plus a
handful of Playwright end-to-end tests over the flows that matter: change a
parameter and see the preview update, add an effect, export a zip.

---

### R-15 — Golden-file DXF regression tests
`Milestone E` · `Depends on: nothing` · `Size: S`

**Problem.** Nothing catches an accidental change to the *bytes* of the output.
The geometry is well tested; the file format is tested only in fragments.

**Goal.** A small set of committed reference DXF files with a test that
regenerates and compares them, and a documented way to update them deliberately.

---

## Milestone F — Release

### R-16 — 1.0 release
`Milestone F` · `Depends on: everything above` · `Size: S`

- [ ] Sample projects that load from the UI
- [ ] A getting-started guide from parameters to cut parts
- [ ] Keyboard accessibility and a React error boundary
- [ ] Every known gap in [ARCHITECTURE.md](ARCHITECTURE.md) either closed or
      listed as a deliberate non-goal
- [ ] Version bumped, tagged, deployed

---

## Working an item

1. Read [ARCHITECTURE.md](ARCHITECTURE.md), then the item.
2. Branch from the current development branch.
3. Land model changes and their tests before touching the UI.
4. Work to the acceptance criteria; tick them off in the item as you go.
5. `npm test`, `npm run typecheck`, and check it in the running app.
6. Update the docs the change affects — a feature is not done until the doc that
   describes it is true.
7. Commit with a message that says *why*, not just what.

If an item turns out to be wrong — the design does not survive contact with the
code, or it is bigger than it looks — **say so and revise the item** rather than
forcing it through. The roadmap is a plan, not a contract.

---

## Changes from the first draft

- **Imperial units** dropped. Millimetres only; R-02 now deletes the unused
  `units` field rather than implementing it.
- **Cut order and machining metadata** dropped. Toolpaths get set up by layer in
  CAM anyway, and the layer names already carry the depth, so a companion file
  would have duplicated what the DXF already says.
- **R-05, fitting an out-of-square room**, added. Crooked walls are a real
  constraint, not an edge case.
- **R-07, face-frame construction**, added, and both it and out-of-square rooms
  removed from the non-goals.

Items were renumbered into a gapless sequence at the same time.
