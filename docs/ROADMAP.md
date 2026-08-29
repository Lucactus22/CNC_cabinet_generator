# Roadmap to 1.0

**Current version: 0.1.** A run of cabinets, fully parametric, cutting real DXF.

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
- [x] Selecting rabbet produces a rebate on each surrounding panel and a back
      sized to sit in it
- [x] The back is captured on all four edges, as the groove style is
- [x] `docs/JOINERY.md` describes the difference and when to pick which
- [x] No option in the UI produces an unjoined part

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
- [x] `npm run lint` passes clean on the existing tree
- [x] CI runs lint, typecheck, test and build, and fails on any of them
- [x] A dependency boundary rule protects the core's purity
- [x] `units` is gone from the model, the defaults and `normaliseParams`

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

**Revised while working it.** Two criteria as first written could not both be
true, and one of them was wrong:

- *Byte-identical DXF* and *part IDs identify their cabinet* contradict each
  other, because the part ID is engraved on the LABEL layer. Prefixing IDs
  changes those bytes and always will. The criterion below now says what is
  actually worth pinning — identical geometry — and `golden.test.ts` proves it
  by exporting the default project with labels off and comparing byte for byte
  against files the 0.1 code wrote. The prefixing is pinned separately.
- The cut list gained a **Cabinet** column, so its CSV is deliberately not
  identical to 0.1's. Sorting a kitchen's worth of panels back into piles needs
  it.

**Acceptance criteria.**
- [x] A project can hold several cabinets, positioned along a run
- [x] The default project generates geometry identical to 0.1, byte for byte in
      the sheet DXF, differing only by the cabinet prefix in the engraved IDs
- [x] Nesting and the cut list span all cabinets in the project
- [x] Part IDs identify their cabinet
- [x] The UI has a cabinet list: add, remove, duplicate, reorder, select

**Tests.** The snapshot equality test above is the important one. Then:
several cabinets nest together; IDs stay unique; a cabinet can be removed
without disturbing the others.

**Risks.** The biggest item on the roadmap. Land the model change and the
snapshot test *first*, in their own commit, before touching the UI.

**What it cost, for the items that follow.** `CabinetParams` is now
`ProjectParams`; `params.base` and `params.top` are `params.cabinets[i]
.carcasses[k]`; `Part.carcass` is `Part.cabinetId` and `Part.carcassId`;
`UpperFloor` is `CarcassFloor` and its `'base-top'` is `'below'`;
`linkWidthToBase` is `linkWidthToBelow`. `normaliseParams` migrates all of it,
so 0.1 project files still open. One real bug fell out on the way: `applyEffects`
took the centroid of the **whole assembly** to decide which face is the inside,
which is correct for one cabinet and wrong for a run — the outermost side panel
of a unit at either end would have had its panelling cut on the wrong face. It
now works per cabinet.

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
- [x] Four types available from a picker, each producing a sensible cabinet
- [x] No `if (type === ...)` branches in `build/builder.ts`
- [x] Wall units carry a hanging rail, joined and drilled

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

**Revised while working it.** Four things the item as written did not settle:

- *"Scribe strips and filler panels"* reads as two kinds of part. It is one:
  a strip at each walled end, cut to the gap plus the scribe allowance. It is
  **called** a scribe strip when there is no gap and the allowance is all there
  is to it, and a filler panel when it is covering a real gap as well — which is
  how a woodworker names it too. Two parts side by side at one end is not
  something anyone would build.
- *"A perfectly square opening produces no scribe parts"* is true only when the
  run also fills that opening. A square opening the run leaves 40 mm short still
  needs a filler, and refusing to make one would be the silent-wrong-cabinet
  failure this repo exists to avoid. The criterion below now says both halves.
  Nothing at all is produced when there is nothing to take up: no gap, no lean,
  and a wall measured dead flat.
- *"A levelling allowance for a sloping floor"* is reported and recommended, not
  built. The item's own design note says to recommend a plinth rather than
  assume one, and a toe kick quietly cut 14 mm taller than the number on screen
  is exactly the surprise that ruins a sheet.
- The item's worked example — *"a 20 mm scribe strip each side covers it with 8
  mm to spare"* — was written for a **rectangular** strip planed to the wall. A
  **tapered** one, which the item also asks for, cuts the lean in and leaves the
  allowance whole, so the two cannot both describe the same part. The taper wins,
  and the allowance is measured against what the blank is *not* cut to: all of a
  wall bow, half of a width lean where two walls could each be the one leaning,
  and none of a corner angle, which is measured at its own end. Warning about
  crookedness the blank already follows is a false alarm, and a warning that
  cries wolf is worse than no warning.

**Acceptance criteria.**
- [x] Opening measurements are part of the model and saved with the project
- [x] The derived square envelope, and the clearance it leaves, are shown
- [x] Scribe strips and filler panels are generated as real parts, tapered when
      the wall leans
- [x] The 3D view shows the crooked opening around the square cabinet, so the
      user can see what is being taken up where
- [x] A warning when the crookedness exceeds the scribe allowance, naming the
      measurement that is out and by how much
- [x] A perfectly square opening the run fills produces no scribe parts and
      geometry identical to today's

**Tests.** The envelope derivation against hand-worked examples, including a
wall leaning each way; taper direction correct for a wall that leans in versus
out; a square opening changes nothing; the too-crooked warning fires.

**Risks.** Scope creep towards full room modelling. This item is about *one
opening a cabinet has to fit*, not a floor plan. Resist the second wall.

**What it cost, for the items that follow.** `ProjectParams` gained `opening`;
`normaliseParams` fills it in, so pre-R-05 project files still open, switched
off. `PartRole` gained `'scribe'`, and `BuildResult` gained `tapers`, resolved
against each part's own frame in the joinery stage exactly as toe notches and
pin rows are. `buildOutline` gained one narrow extension — a single vertical
edge cut back at one end — and every notch and tab now asks for its x through
one helper so a feature on a sloping edge lands on the slope rather than on the
rectangle it replaced. `isVerticalEdge` became a type guard on the way.

Three defects were found by review before this landed, each of them the silent
kind this repo cares about. The run was centred in the opening as it appears at
the **front**, which put the back corner of an end cabinet into a wall that
leaned away and still reported it as fitting; it is now centred in the band that
is clear over the whole depth. A single strip was run up the whole stack, so on
the default stepped unit its top 1100 mm floated 200 mm proud of the upper doors
— it is now one strip per front plane. And the engraved part ID was anchored to
the bounding box, which on a tapered blank is a corner with no material under
it, so the label would have been cut across whatever was nested alongside.

**Added after the item was worked: a guided walkthrough.** The measurements were
a panel of six numbers, one of which — the corner angle — nobody can actually
measure. Asking
for it gets a guess, and a guessed angle is worse than none, because the fillers
are cut to it. `model/measure.ts` and a guided walkthrough in the app now take
three tape readings across a corner and derive the angle by the law of cosines,
which is the 3-4-5 rule the trade already uses; readings that cannot be a
triangle get told so rather than clamped into a confident wrong answer. The raw
readings are stored alongside the angle, because they are the primary record,
and a reading that looks more like a dropped digit than a crooked room is
questioned.

A second review round on the walkthrough found four more, three of them in the
geometry it feeds: a strip was placed at the run's outer corner rather than
against the box beside it, so a narrower carcass higher in a stack got a filler
hanging in the air with nothing to fix it to; every strip in a stepped stack was
cut to the gap at the *deepest* carcass's plane, though a set-back box has only
travelled part way along the wall's lean and its filler could not reach the
plaster; the walkthrough opened on a square corner rather than on the angle
already in effect, so it said "dead square" about a corner the project was being
cut to 85° for; and a bow warning told the user to skim a wall in a
configuration where no strip is scribed to anything.

The reasoning, the arithmetic and the honest limits are in
[OPENING.md](OPENING.md).

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

**Revised while working it.** Three things the item as written could not have:

- *A `fits(part, context)` predicate* and *entries saved with the project*
  cannot both be true. A function does not survive being written to a file and
  read back, so a user's own entry would be the one kind that could not be
  checked — exactly backwards, since a user's own entry is the one nobody has
  proof-read. A fitting rule is therefore **data**: a measure from a short
  closed list, a minimum, a maximum, and the sentence saying what goes wrong.
  A built-in entry and one somebody typed are checked by the same code.
- Those rules turned out to be two different things wearing one name, and the
  diagnostic contract already distinguishes them. A **requirement** is what the
  maker publishes — *16 to 26 mm doors* — and breaking it is a warning: the
  holes cut fine and the hinge will not work. A **derived** check is arithmetic
  on the entry's own boring — a 13 mm cup in an 11.9 mm door — and breaking it
  is an error: the panel is ruined.
- *Drawer slides* are named in the goal and are **not** here. A slide's numbers
  only mean something once there is a drawer box to size from them, and a slide
  picker that machined nothing would be precisely the defect R-01 opened this
  roadmap by removing. R-08 adds the kind and its entries alongside the boxes
  that consume them; for the catalogue that is one more entry type and no new
  machinery. Handles, which are also named, *are* here, because a handle is two
  through holes and the catalogue would otherwise be a rename of one field.

**Acceptance criteria.**
- [x] Hardware selected by id from a catalogue, with the current UTRUSTA
      behaviour unchanged as the default
- [x] Users can add a custom entry and it is saved with the project
- [x] Every hardware item's constraints are checked and reported

**What it cost, for the items that follow.** `ProjectParams.hinge` is gone, and
so is the hardware half of `joinery.shelfPin`; both are now catalogue ids under
`params.hardware`, with `normaliseParams` turning a pre-R-06 file's numbers into
an entry of the project's own when they differ from a built-in, so a hinge
somebody had dialled in is not snapped back to the default. `HingeSpec` moved to
`hardware/catalogue.ts`, where a make of hardware is described. `PartRole` did
not change: a handle is boring, not a part.

`buildCarcass` took eight same-typed arrays positionally and now takes one
`BuildSink`; adding a ninth to that row was an argument order waiting to be got
wrong. `applyHinges` no longer takes the whole project, only its entry, and no
longer emits spec warnings — every hardware message is now in `hardware/fit.ts`
with a part id and a hint, under a `hardware` topic, which is where
`checkManufacturability` can see them.

The golden 0.1 DXF is unchanged, because the UTRUSTA entry reproduces the
numbers the generator shipped with exactly. `hardware.test.ts` pins them by name
as well, so that comparison failing would not be the only warning, and pins the
stronger promise too: a pre-R-06 file with the shipped numbers exports byte for
byte what it always did.

**What review found.** Ten things, every one of them verified by running code
rather than by reading. Four were the silent kind this repo exists to avoid:

- A fitting rule whose measure named something its kind is never bored into was
  **dropped without a word** — and the rule editor offered all four measures for
  every kind, so it was three clicks away. Someone writes *door thickness at
  least 16 mm* on a shelf pin, believes the project is guarded, and nothing on
  screen distinguishes a rule that passed from one that never ran. The picker
  now offers only the measures a kind is fitted to, and a rule from a file that
  names another one is reported, as is a rule with neither limit — which used
  to print *"undefined mm or less"*.
- `findEntry` matched an id before its kind, so a custom **handle** sharing a
  built-in hinge's id shadowed that hinge, sent it to a fallback, and produced a
  warning saying the id was in neither list. Both halves of that sentence were
  untrue and the doors were bored 1 mm shallower than the hinge in the box.
- The migration aliased the shipped entries' rule objects into the project it
  migrated. Editing a migrated hinge's rule rewrote `HINGE_UTRUSTA`'s for every
  project opened after it in the same process, and the warning that would go
  missing is the one saying the cup bottoms out. The web app happened to escape
  it, because the store deep-clones before every edit — luck, not design, and
  the core is meant to be usable from a CLI.
- An unknown **handle** id fell back to a default and drilled the doors. A hinge
  and a pin must fall back — there is no cabinet without them — but a handle
  falling back puts holes through the front of a finished door for hardware
  nobody chose. It now bores nothing and says so.

Three more were checks that cried wolf or stayed silent: the boring-distance
warning fired at a project with no doors in it; the shadowed-id warning claimed
an entry was "the one being cut" when a different one was; and a bar handle with
no fixing centres drilled one of its two holes with no check noticing, because
the overhang test steps over the single-hole case.

One was a crash: a custom entry from a hand-edited file with no `boring` block
threw out of `buildProject`, which the app surfaces as *"could not open that
project file"*. `normaliseParams` validated every other block and passed this
one straight through. An entry missing numbers its boring is made of is now
dropped — guessing a cup depth is not something to do — while an entry missing
only its rules is repaired.

The last two were the standard this repo sets for numbers. The **generic 35 mm
hinge** had a cup depth, a dowel depth and a thickness range that were nobody's:
it is now **Hettich Sensys 8645i**, whose sheet publishes all three, and which
usefully ships the same hinge in the 48 × 6 and 52 × 5.5 patterns that make the
case for the pattern being data. And a handle's **overall length** was invented,
which mattered because it is the only number the overhang warning is measured
against: a 128 mm bar is sold at 136, 178 and 192 mm overall, so there is no
standard to cite. The entries now carry a typical figure, say in their source
that it is one, and the docs tell you to set it to the handle in your hand.

The reasoning, the sources and the honest limits are in
[HARDWARE.md](HARDWARE.md).

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

**Note from R-06.** The catalogue deliberately ships no slide entries, because
nothing machines from them yet. Add a `slide` entry kind there — data, with its
fitting rules — at the same time as the boxes that consume it, and take the
width formula below from the entry rather than from constants in the builder.

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

## Milestone F — Design, and the people using it

Everything up to here made the tool capable. None of it made it usable, and the
interface has never been designed — it grew one control at a time, and it shows.

**This milestone opens with a redesign, not a polish pass.** R-16 and R-17 are
allowed to question everything, including the sidebar, the tabs, and whether a
form-driven interface is the right shape for this tool at all. Nothing in the
current UI is load-bearing except the geometry it displays.

### What we know about the person using this

They are a woodworker. They already know what they want to build — they can
picture the cabinet before they open the app. They do **not** need to be taught
what a cabinet is, and they are not looking for inspiration.

What they need is **translation**: getting the thing in their head into a form
the machine can cut, without fighting the software. Every second spent hunting
for a control, decoding a term, or scrolling past sixty fields they do not care
about is a second not spent building.

That single fact should drive every decision in this milestone. The tool is a
**translator, not a teacher**. Onboarding, tutorials and hand-holding are the
wrong instinct here; directness, discoverability and reversibility are the right
ones.

### The measured state of the interface today

Recorded from the running app so nobody has to re-derive it:

| | |
|---|---|
| Sidebar groups | **15** |
| Controls when fully expanded | **80** (47 numeric, 19 dropdowns) |
| Sidebar height when expanded | **4853 px — 5.5 screens** in a 320 px column |
| Share of the window given to the cabinet | roughly **40%**, squeezed between a sidebar and a diagnostics panel |

And, by inspection:

- **Selection drives nothing.** Clicking a panel isolates it in 3D, and the
  sidebar does not react. The model and the controls are strangers.
- **Everything weighs the same.** A cabinet's width — changed constantly — sits
  at the same size and prominence as a hinge dowel offset, changed once.
- **Design settings and workshop settings are mixed.** Machine travel, tool
  diameter, hinge boring, nesting margins and *safe layer names* are properties
  of a workshop, set once and reused forever. They currently occupy the same
  space, and the same attention, as the design itself.
- **Primary actions are buried.** "Add cabinet" is mid-scroll in an accordion.
- **The diagnostics panel is a third of the screen and largely repeats itself** —
  three near-identical tiling warnings — while the two permanent errors are
  about workshop setup rather than anything the user just did.

### Design principles

Written to be argued with. If an item in this milestone conflicts with one,
either the item or the principle is wrong; say which.

1. **The model is the interface.** Change the cabinet by acting on the cabinet.
   A form describing it is a fallback, not the main route.
2. **Show the thing, not the word.** Anything with a visible consequence is
   chosen by looking at the consequence, rendered from the real geometry.
3. **What you change every minute and what you set once a year do not belong in
   the same place.**
4. **Nothing is more than one step away.** No hunting through accordions. If a
   thing exists, it is findable by name.
5. **Weight follows frequency.** Prominence in the interface is earned by how
   often something is touched, not by how the code is organised.
6. **Never block, only explain.** Diagnostics guide towards a fix; they do not
   nag, repeat themselves, or hold the user's own work hostage.
7. **Everything is reversible.** Freedom to try requires freedom to undo.
8. **The cabinet is always visible.** It is the workspace, not a preview panel.

---

### R-16 — Research, and the redesign brief
`Milestone F` · `Depends on: nothing` · `Size: M`

**Problem.** The interface grew one feature at a time and has never been
designed as a whole. There is no written understanding of who uses it or what
they are trying to do, so there is nothing to judge a design against except
taste — and the numbers above suggest taste has not been winning.

**Goal.** `docs/UX.md`: who this is for, the journeys that matter, where each
one breaks down today, and a proposed information architecture for R-17 to
build. This item produces a **decision, argued for** — not a survey.

**Where.** A new `docs/UX.md`. No code.

**Design notes.** The measured state and the principles above are your starting
material, not your conclusion. Verify them, then go further.

**Walk the journeys in the running app with the clock going.** Record steps,
interaction counts, and every point where the user must guess. These are the
ones that matter:

| Journey | The question really being asked |
|---|---|
| Build the thing in my head | "How do I get from a picture in my mind to parts?" |
| Fit it to a real room | "Will this go in my crooked alcove?" |
| Change my mind about one bay | "Can I try this without breaking the rest?" |
| Choose how it goes together | "Which joint do I want, and what does it cost me?" |
| Take it to the machine | "Is this safe to cut yet?" |
| Re-cut one part I ruined | "Can I get just that one part again?" |

**Then answer the architectural questions.** These are the ones R-17 depends on,
and they are genuinely open:

- **Is a persistent sidebar right at all?** A contextual inspector that shows
  only the selection is the obvious alternative. What happens when nothing is
  selected?
- **Where does the project's structure live** once a run holds several cabinets,
  each with carcasses, bays, doors and shelves? A tree? Breadcrumbs? Direct
  selection only?
- **Should workshop settings leave the design surface entirely?** They look like
  a reusable profile — one per machine, shared across projects. If so, where do
  they live and how does a project reference one?
- **Are Assembly / Sheets / Parts three views, or three phases?** They map
  suspiciously well onto *design → cut → build*, which is also the shape of the
  journeys.
- **Should diagnostics own a third of the screen permanently?** What replaces
  it — a status chip that expands, inline markers on the model, something else?
- **What is the fastest possible path** from "I want drawers in that bay" to it
  being so? Count the interactions in the current UI, then design for fewer.

Sketch at least two genuinely different architectures before choosing. Say what
you rejected and why — the next person will want to know whether their idea was
already considered.

**Acceptance criteria.**
- [ ] `docs/UX.md` names the users and journeys, with the reasoning
- [ ] Each journey walked in the running app, written up as it really is, with
      interaction counts recorded as a baseline R-17 must beat
- [ ] A prioritised friction list, each entry naming the journey it came from
- [ ] Every architectural question above answered, with the alternatives
      considered and the reason for the choice
- [ ] At least two architectures sketched, one rejected in writing
- [ ] The rest of this milestone reconciled against the findings: confirmed,
      re-scoped, or dropped with a reason
- [ ] Any idea that is good but out of scope added to
      [feature_suggestions.md](feature_suggestions.md)

**Risks.** Producing a document that flatters what already exists. If a journey
comes out fine on the first walk, be suspicious: watch somebody who has never
seen the tool try it, and time them.

---

### R-17 — Rebuild the interface around the cabinet
`Milestone F` · `Depends on: R-16` · `Size: XL`

**Problem.** The interface is a form with a picture next to it. It should be a
cabinet you can work on. Fifteen groups and eighty controls are presented at a
flat, equal weight in a column narrower than a phone, while the thing being
designed gets less than half the window and cannot be edited by touching it.

**Goal.** Execute the architecture R-16 chose. This is a rebuild of the shell,
not a reskin: layout, navigation, where settings live, what selection means, and
how the project's structure is represented.

**Where.** `apps/web/src/App.tsx`, `ParamPanel.tsx` (likely dissolved),
`styles.css`, and a new set of shell components. `packages/core` should need no
changes at all — if it does, question why.

**Design notes.** The direction below follows from the principles and the
measurements. R-16 may overturn it with reasons; it may not overturn it by
preference.

**Split the surfaces by how often they are touched.**

| Surface | Holds | Touched |
|---|---|---|
| **Design** | cabinets, carcasses, bays, doors, shelves, joinery choices | constantly |
| **Workshop** | machine, tooling, materials, hardware, nesting, export options | once per machine, then never |
| **Output** | sheets, cut list, export, the workshop view | at the end of a job |

The workshop surface wants to be a **reusable profile**, saved independently of
any project, so a second design starts already knowing the machine. That alone
removes roughly a third of the controls from the everyday interface.

**Make selection mean something.** Selecting a bay, a door or a panel should
bring up what applies to *that thing*, next to it. This is the single largest
change and it is what turns eighty flat controls into a handful at a time. The
raycasting and isolation already work — the wiring from selection to controls is
what is missing.

**Give the cabinet the window.** It is the workspace. Panels float over it,
collapse, or appear on selection; they do not permanently divide it.

**Make everything findable by name.** A command palette is a small piece of work
that directly serves a user who knows what they want and does not know where it
lives. Type "drawer", "toe kick", "tile" and go straight there.

**Do not build a wizard.** These users are not lost; they are held up. Guidance
belongs inline, at the moment of the decision. `MeasureWizard` is the exception
that proves it — measuring a room is a genuinely sequential task with a defined
end. Almost nothing else here is.

**Acceptance criteria.**
- [ ] The architecture from `docs/UX.md` implemented as the app's shell
- [ ] Design and workshop settings clearly separated; workshop settings saved
      and reusable across projects
- [ ] Selecting something in the model brings up its controls, in context
- [ ] The cabinet occupies the majority of the window at every size
- [ ] Everything reachable by name from a command palette or equivalent
- [ ] Number of controls visible at rest is a small fraction of eighty, and the
      figure is recorded
- [ ] Interaction counts for every R-16 journey measurably improved, and the
      before and after recorded in `docs/UX.md`
- [ ] No regression in what the tool can express: every parameter still
      reachable
- [ ] `packages/core` unchanged, or the reason it had to change written down

**Tests.** Every parameter still reachable — worth an explicit test, because the
easiest way to score well on the other criteria is to quietly drop controls.
Playwright coverage of the journeys, which then guards the counts.

**Risks.** The largest item on the roadmap and the easiest to half-finish,
leaving two interfaces at once. Land the shell and the navigation first, migrate
every panel, then delete the old one in the same pass. A half-migrated sidebar
is worse than the one we have.

---

### R-18 — Every choice a picture, rendered from the geometry itself
`Milestone F` · `Depends on: R-16, R-17` · `Size: L`

**Problem.** Nineteen dropdowns of jargon. "Stopped dado + screws" or "Tab and
slot". "Capped over the sides" or "Inset between the sides". "In a groove", "In
a rabbet". A tooltip explains each in a sentence, which helps if you already
half know. If you do not, you are picking blind — and these decide what the
cabinet looks like and how hard it is to build.

The same problem at the start: a new project is a set of defaults rather than
something recognisable, so the first minutes are spent working out what the tool
even makes.

**Goal.** Every choice with a visible consequence is made by looking at that
consequence, and a project starts by picking a picture of something close to
what you want.

**Where.** A new thumbnail renderer in `apps/web`, the control components, and
a starter-project module.

**Design notes.** **The pictures are generated, not drawn.** Build a small
sample model for each choice — two panels meeting, a top on a side, a door on a
carcass — run it through `buildProject`, and render the result. A stopped-dado
thumbnail is then literally a stopped dado as this tool cuts it, notch, stop and
all. Hand-drawn icons would drift the first time the joinery changed, and R-01
through R-08 change the joinery repeatedly. Geometry rendered from the engine
cannot drift. It is cheap, too: the pipeline is pure and takes milliseconds.

Some choices read only as a **cutaway**. A capped top versus an inset one is
invisible from outside — that is the entire point of capping — so the thumbnail
must be a section through the corner, showing the seam in one and not the other.
R-20 wants the same section rendering for its plane; build it once.

**Words still matter, but different words.** Under each picture, the trade-off in
one line, in the user's terms: *"No fasteners needed. Joints show on the
outside."* Not a restatement of the option's name.

Then: **hovering a choice previews it on the actual design** and reverts on
leave. Seeing the change on your own cabinet, at your own dimensions, beats any
thumbnail — the thumbnail is how you know what to hover.

**The same machinery gives you the starter gallery.** Ship real starter projects
— the reference built-in, a run of base units, a wall cabinet, a wardrobe, a
bookcase — each loading complete and cuttable, each shown as a render produced
the same way. Editing something that works beats composing from defaults, and
each one doubles as proof of what the tool can do.

**Acceptance criteria.**
- [ ] A thumbnail renderer that builds its samples through the real pipeline
- [ ] Every geometric choice presented as pictures with a one-line trade-off
- [ ] Cutaway thumbnails where the difference is internal
- [ ] Hover previews the choice on the actual design; click commits
- [ ] Starter projects chosen from a gallery of live renders, each generating
      with no diagnostics
- [ ] Thumbnails cached, and never stale after a joinery change
- [ ] Text-only fallback for anything genuinely non-visual

**Tests.** Every choice in every gallery, and every starter project, builds
without error — that catches a stale sample after a model change, which is
exactly the failure this design exists to prevent.

**Risks.** Rendering a dozen thumbnails on every keystroke. They depend on
material thickness and tool diameter but not on cabinet size; key the cache on
what they actually use.

---

### R-19 — Configure the cabinet by touching the cabinet
`Milestone F` · `Depends on: R-16, R-03` · `Size: L`

**Problem.** The 3D view shows the cabinet and you cannot do anything to it. To
put a door on the second bay you look away from the model, find the right
carcass group, count bays in your head, and set "Bay 2". The model is right
there and it is inert. And the joinery — the part people most want to
understand — is buried inside the panels where nothing can show it.

**Goal.** Direct manipulation. Click a bay to configure it in place. Click a
door to restyle it. Drag a divider or a shelf. Cut a section through the cabinet
to see how it actually goes together.

**Where.** `Viewport3D.tsx`, a new in-viewport inspector, `store.ts`.

**Design notes.** Selection and isolation already work and the raycasting is in
place, so this is the next step from what exists rather than a rewrite.

Start with **click to configure**, which is most of the value for a fraction of
the work: select a bay, get its controls in a popover near what you clicked,
using R-17's galleries. Add **dragging** afterwards, and only where a millimetre
either way is a real judgement — a divider, a fixed shelf. Dragging is for
deciding; typing is for committing, so every draggable thing keeps its field.
Snap to the 32 mm system, to equal bays, to round numbers, and show the live
dimension. A drag that lands on 437.3 mm is worse than no drag at all.

**The section plane** is the other half. Drag a plane through the model and see
the dados, the tongues, the hinge cups — the geometry is all there and has never
been visible. It teaches the joinery better than `JOINERY.md` can, and R-17
needs the same rendering for its cutaway thumbnails. Build it once.

Bays are not parts and cannot currently be picked. Making them addressable is
the real design work here; get it right before any dragging.

**Acceptance criteria.**
- [ ] Clicking a bay opens its controls in the viewport
- [ ] Clicking a door, shelf or panel offers what applies to it
- [ ] Dividers and fixed shelves draggable, snapping sensibly, showing the live
      dimension
- [ ] A section plane that can be dragged through the assembly
- [ ] Every change made this way is a normal parameter change: undoable (R-13)
      and saved with the project
- [ ] The sidebar keeps only what is genuinely global

**Risks.** Two editors of one value that disagree. The parameters are the single
source of truth; the viewport is another editor of them, never a second copy.

---

### R-20 — Diagnostics that show you the problem
`Milestone F` · `Depends on: R-16` · `Size: M`

**Problem.** The diagnostics say what is wrong well and help you fix it badly.
One flat list at every severity, repeated per sheet, with the fix as prose you
must translate into a hunt through the sidebar. Worse, the most important
message — *this part is too big for your machine* — is a sentence about numbers
when it could be a picture of the part next to the machine's envelope.

**Goal.** Grouped, deduplicated, actionable, and shown rather than described.

**Where.** `Diagnostics.tsx`, `machine/check.ts`.

**Design notes.** The `hint` field already names the parameter that fixes each
diagnostic, in prose. Where the fix is a single unambiguous parameter change,
make it a button: **"Set sheets to machine size" already proves the pattern**,
and the diagnostic recommending it should carry it rather than leaving the user
to find it in the Material group. That means `Diagnostic` grows an optional
structured fix — a parameter path and a value — applied through the normal
update path so it is undoable like anything else. Only where it is genuinely
unambiguous; a button that guesses is worse than a sentence that explains.

Then **show the failure**. A part that will not fit gets a small diagram of the
part against the machine envelope with the overhang shaded. A tiling warning
gets the sheet with its seams drawn. A sagging shelf gets its span. The
machinery to draw all of these already exists in the sheet view.

Group by topic, collapse repeats with a count, and put a readiness summary at
the top. "Ready to cut" is currently inferred from the colour of a dot; say it.

**Acceptance criteria.**
- [ ] Grouped by topic, sorted by severity, repeats collapsed with a count
- [ ] Unambiguous fixes offered as buttons, applied undoably
- [ ] Spatial problems shown as a diagram, not only described
- [ ] A readiness summary answering "can this be cut" in words
- [ ] Clicking a diagnostic still highlights the part everywhere
- [ ] Export explains why it is blocked rather than only being disabled

**Tests.** Each structured fix clears the diagnostic that offered it — one test
each, because a fix that does not fix is worse than none.

---

### R-21 — Confidence at export, and a view for the workshop
`Milestone F` · `Depends on: R-16, R-10` · `Size: M`

**Problem.** Export hands over a zip and says nothing: you do not know what is
in it, which file to open first, or whether you have missed something. Then you
walk to the machine, where the app is on a tablet at arm's length with sawdust
on your hands, and the interface is a 320 pixel column of small numeric fields.

**Goal.** An export that explains itself, and a workshop mode meant to be used
standing up.

**Where.** `ExportBar.tsx`, a new workshop view, `styles.css`.

**Design notes.** Before the zip downloads, show what is about to be produced —
sheet thumbnails, tile count, parts, materials to buy, anything unresolved. This
is the last moment before real material is committed and it deserves a beat.

The workshop view is a different mode, not a responsive reflow: the cut list and
assembly steps from R-10, large type, high contrast, one step at a time, with
progress that survives a reload. Design it for a tablet first, and let each step
show the parts it needs as pictures rather than part numbers — `B-DOOR-1` means
nothing with a panel in your hands.

Take "re-cut one part" seriously here: exporting a single part's DXF is small
and answers a real, frequent problem.

**Acceptance criteria.**
- [ ] Export preview with sheet thumbnails, tiles and materials before download
- [ ] A shopping summary: sheets by material, hardware by type and count
- [ ] Any single part re-exportable on its own
- [ ] A workshop view legible at arm's length, steps illustrated, progress
      surviving a reload
- [ ] The designer usable on a tablet, even if it is not the focus

---

### R-22 — Visual and interaction polish, and accessibility
`Milestone F` · `Depends on: R-16, R-14` · `Size: M`

**Problem.** The interface is consistent but was never designed: spacing, type
scale and colour were each decided in passing. It is dark-only, which is poor
next to a window or under workshop lights. Nothing has been checked with a
keyboard, and a thrown error blanks the page and loses the design, because there
is no error boundary.

**Goal.** One deliberate visual system, a light theme, keyboard operability, and
an interface that does not lose your work when something goes wrong.

**Where.** `styles.css`, the control components, `App.tsx`.

**Design notes.** The existing palette and density are a reasonable starting
point; this is a pass to make the decisions on purpose, not a redesign for its
own sake. Set a type scale and a spacing scale, then apply them everywhere.

The light theme is the part that is not optional. This gets used in daylight and
under bright workshop lights, where the current dark-only interface is genuinely
hard to read.

Keyboard: tab order following the job, visible focus, arrows to nudge a numeric
field, escape to close a popover, and a keyboard route to everything the 3D view
can do by clicking.

Add the React error boundary. For a tool with no server, losing the design to a
stray exception is the worst failure available.

This delivers the accessibility and error-boundary lines on the release
checklist; tick them there when it lands.

**Acceptance criteria.**
- [ ] Type and spacing scales defined once and used throughout
- [ ] A light theme following the system preference, switchable
- [ ] Every control reachable and operable from the keyboard, focus visible
- [ ] An error boundary that keeps the design and offers to save it
- [ ] Motion respects `prefers-reduced-motion`
- [ ] Contrast meets WCAG AA in both themes

**Tests.** Keyboard navigation through the main flows on the R-14 harness; an
automated contrast check over both palettes.

---

## Milestone G — Release

### R-23 — 1.0 release
`Milestone G` · `Depends on: everything above` · `Size: S`

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

Ideas that are good but out of scope go in
[feature_suggestions.md](feature_suggestions.md) rather than being lost or
quietly widening the item you are on.

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
- **R-03** had two acceptance criteria that could not both hold; see the note in
  the item for what replaced them and why.

Items were renumbered into a gapless sequence at the same time.

**Second revision.** Added **Milestone F**, seven items on design and ease of
use, sitting between production quality and release. Everything before it makes
the tool capable; none of it makes it pleasant, and a tool with this much jargon
needs the second as much as the first.

The milestone is built on one idea: the tool already contains an exact geometry
engine, so wherever the interface describes a choice in words it should show the
result instead — rendered from the same code that cuts it, so the picture cannot
drift from the part. R-17 carries that idea and most of the rest lean on it.

R-16 comes first deliberately: the others are only worth as much as the
understanding of the journeys they are built on. The release item moved to R-23
to keep the numbering in reading order.
