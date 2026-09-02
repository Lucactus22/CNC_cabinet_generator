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

**Revised while working it.** Four things the item as written did not settle:

- *"Chosen per cabinet"* is finer-grained than the model actually needs it to
  be. A `Cabinet` is a stack of `Carcass`es, and it is each carcass's own bays
  and front that a frame stands in front of — exactly where `topStyle`,
  `back` and `toeKick` already live. `construction` and `faceFrame` ended up
  on `CarcassSpec`, not `Cabinet`. A cabinet with one carcass reads exactly as
  "chosen per cabinet"; a stack can mix a face-framed base with a frameless
  upper, which is a strict superset of what was asked for, not a narrower
  reading of it.
- *Half-lap topology.* The item does not say whether rails run through with
  stiles let into them, or the other way round. Shop practice usually runs
  outer stiles the full height with rails between them and lets a mid-stile
  into the rails separately — which needs two different joints for what is
  structurally one relationship: a corner lap at a rail's own end, a T lap
  wherever a mid-stile lands partway along it. Running every stile (outer and
  mid alike) the frame's full height and every rail its full width turns
  every crossing into the same corner-shaped half lap, and produces the
  identical door opening either way — a bay only ever asks where the nearest
  stiles' and rails' inner edges are, never which member was "through." See
  [JOINERY.md](JOINERY.md).
- *Face-frame hinges bore into the frame with the correct plate positions*
  needed no new catalogue entry. A stile is built the same way round as a
  door — a flat board facing the room, not a panel facing sideways into it —
  so its plate holes follow a door's own cup-boring arithmetic, not a carcass
  panel's. The numbers are an existing entry's 32 mm system, unchanged; only
  the edge they are measured from moves, from the carcass's front edge to the
  stile's own edge next to the door. `HARDWARE.md`'s "deliberately not here"
  note about face-frame hinges is retired rather than replaced.
- *"Nested as a linear cut list rather than a 2D nest"* is taken literally:
  `nest/stock.ts` packs stiles and rails end to end along a board's length
  only, first-fit-decreasing, and never rotates a part — there is nothing to
  rotate a length of board into. It returns the same shape the sheet nester
  does, which is what lets `export/sheet.ts` draw a board's DXF with no
  changes of its own.

**Acceptance criteria.**
- [x] A cabinet can be frameless or face-frame, chosen per cabinet
- [x] Rails and stiles generated as parts with half-lap joints
- [x] Solid stock is a distinct material class with its own cut list
- [x] Doors reference the frame opening; overlay, partial overlay and inset all
      work against it
- [x] Face-frame hinges bore into the frame with the correct plate positions
- [x] Door layout has no branch on construction style
- [x] Frameless cabinets generate geometry identical to before

**Tests.** Half-lap pockets on both halves at half the stock thickness and
meeting flush; frame opening dimensions derived correctly from rail and stile
widths; a door sized to a frame opening with partial overlay; the frameless
snapshot is unchanged.

**Risks.** The opening abstraction is the crux. If it is skipped and a style
branch goes into the door layout instead, R-08 will inherit the mess and cost
more than this item saved.

**What it cost, for the items that follow.** `build/doors.ts` holds the
abstraction R-08 needs: a `FrontOpening` — a clear rectangle, plus how far
each edge may be overlaid — and a pure `doorLeafRect(opening, fit, reveal,
gap)` that turns one into a door's box. A drawer front can ask for the same
`FrontOpening` a door in the same bay would get and run through the same
function; nothing about either is specific to a door as a `PartRole`.
`PartRole` gained `'stile'` and `'rail'`; `ProjectParams` gained
`stockMaterials: StockMaterial[]`; `CarcassSpec` gained
`construction: ConstructionStyle` and `faceFrame: FaceFrameSpec`.
`HingeRequest` gained `mount: 'carcass' | 'frame'`, so a hinge — or a slide,
R-08's own hardware — can point at either kind of panel without its boring
function needing to know which construction style produced it.
`JointRequest.purpose` gained `'face-frame'`, dispatched in `applyJoinery` to
a new `joinery/halflap.ts` alongside the dado and tab-and-slot strategies.

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
- [x] A bay can hold *n* drawers with configurable front heights
- [x] Box parts are correctly sized from the opening and the slide entry
- [x] Slide boring on the box sides and the cabinet sides
- [x] Drawer fronts take surface effects exactly as doors do
- [x] Warnings for a box outside the slide's supported width or side thickness

**Tests.** The width formula at both thickness bands; box parts fit the opening
with the slide clearance; a drawer front lines up with the door reveal above it.

**Revised while working it.** Two things the item as written did not settle:

- *"A bay can hold a stack of drawers"* is read as replacing doors and
  shelves entirely, not sitting alongside them: a bay is either fronted with
  doors, or with a drawer stack, never both in the same bay. A drawer over a
  door is real cabinetry, but the opening it needs to size against is a
  second, different shape from the single rectangle this item's design notes
  already work out, and mixing the two would have doubled the item's real
  work for a case the acceptance criteria never asked for.
- Blum's real undermount hardware is a proprietary clip-on system, not a
  simple user-drilled screw pattern, and its own published mounting-hole
  offsets are a different pair of numbers for every one of the five runner
  lengths. "Slide boring on the box sides and the cabinet sides" is
  satisfied with a generic, symmetric pair of mounting holes held in from
  each end of the runner, rather than a transcription of that table — the
  hook bore for the locking device is left out for the same reason. Both are
  said plainly in [DRAWERS.md](DRAWERS.md) rather than presented as more
  exact than they are.

**What it cost, for the items that follow.** `PartRole` gained `'drawer-side'`,
`'drawer-front'` (the hidden sub-front), `'drawer-back'`, `'drawer-bottom'` and
`'drawer-face'` (the visible one, targetable by surface effects exactly like a
door). `BaySpec` gained `drawerFrontHeights: number[]`; `ProjectParams` gained
`drawerBoxMaterialId`. The hardware catalogue gained a `'slide'` kind
(`hardware/slides.ts`, mirroring `hardware/hinges.ts`) and two entries — Blum
TANDEM plus BLUMOTION 563H and 563F — plus two new `HardwareMeasure`s, `'drawer
side thickness'` and `'drawer box width'`, each carried by the one member of
the box (the sides, the sub-front) that a joint receives a pocket into rather
than grows, which is what keeps them measurable at all once the pipeline is
done. `build/doors.ts` gained `splitOpeningVertically`, slicing one
`FrontOpening` into a stack of smaller ones — what a drawer stack asks of a
bay a single door would otherwise fill whole — so a drawer face reuses
`doorLeafRect` exactly as a door does, face frame included. `build/drawers.ts`
is the new module that builds the box, mirroring `build/faceframe.ts`'s shape.
A drawer box's own sides are the panel that *grows* into its sub-front and
back — the same relationship a capped top's sides have with the top panel —
rather than the more obvious way round, precisely so the sub-front's and the
back's widths stay stable for the hardware checks above.

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
- [x] Banded edges are declared per part role and per edge
- [x] Part sizes are reduced by the banding thickness on banded edges
- [x] The cut list reports total banding length per material
- [x] The part drawing marks banded edges

**Tests.** The shrink lands on exactly the requested edges and no others; a
role asked to band an edge it structurally cannot have is reported and left
untouched; two edges thick enough to consume the whole panel are refused
rather than producing a negative-size blank; a door banded on its hinge side
still bores the cup at the same local coordinates, because hinge boring reads
the part's frame, never the working rectangle banding shrinks.

**Revised while working it.** The item's own "Where" line named
`build/builder.ts` for the size reduction; the shrink is in `joinery/banding.ts`
instead, called from `materialise()` in `joinery/index.ts`. That is where the
final outline is already built from a working rectangle notches and tabs are
placed against, and applying the same rectangle to banding — rather than
plumbing a second, builder-side adjustment through every part-constructing
module (`build/builder.ts`, `build/drawers.ts`, `build/faceframe.ts` all push
`Part` literals) — is what keeps a stopped-dado notch on a banded edge
correctly positioned with no extra arithmetic: both are already measured from
that same rectangle. `build/builder.ts` itself only gained the field's zero
value on the parts it constructs directly.

**What it cost, for the items that follow.** `Part` gained `bandedEdges`.
`ProjectParams` gained `bandingMaterials` — a `BandingMaterial` is a name and
a thickness, nothing else, because it has no sheet to nest and is bought and
reported by length — and `edgeBanding`, a per-role `{ edges, materialId }`.
`ProjectResult` gained a `banding` summary, following `materialSummary` and
`stockSummary`'s own shape: computed and ready, but — like those two — not
yet surfaced anywhere beyond the parts view. R-22's shopping summary can read
it directly.

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

**Revised while working it.** The goal's own sentence asks for "an exploded
diagram per step", which the acceptance criteria below never actually name —
they ask for parts, hardware and fixings as text, not a rendering. Building a
real per-step 3D diagram is R-17/R-18 territory (a thumbnail renderer keyed to
the design system that milestone is about to build); doing a one-off version
of it here would either be thrown away or fought with once that lands. Left
for that milestone rather than built twice.

The joint graph alone only orders the glued-up carcass: a door is never
itself a joint, only hinge-bored, and a drawer face is screwed to its box from
inside with no hole this generator models at all. Both still had to appear
somewhere without this file hand-authoring "and then hang the doors" for a
cabinet that might not have any. The joint graph's own male/female direction
generalises: a door is scheduled from the hinge requests the builder already
produces, a drawer box from its slide requests, and *anything* left over —
today that is only an adjustable shelf and a drawer face — gets a step from
the parts list itself, grouped by carcass and role, so a future part role that
never becomes a joint or a hardware request still gets a step instead of
silently going unmentioned. Scribe strips and wall fixing screws are held back
to a final phase, because both are done on site rather than at the bench —
see JOINERY.md's own "not a joint: the scribe strip".

**Acceptance criteria.**
- [x] A label sheet with id, description, size and which face is up
- [x] Assembly steps derived from the joint graph, not hardcoded
- [x] Each step lists its parts, hardware and fixings
- [x] Both print cleanly to PDF from the browser

---

## Milestone E — Production quality

### R-11 — Nesting: offcuts and mixed sheet sizes
`Milestone E` · `Depends on: R-03` · `Size: M`

**Goal.** Track usable offcuts and let a material carry several sheet sizes,
including remnants the user already has. Add a guillotine strategy for anyone
cutting on a panel saw rather than a router.

**Acceptance criteria.**
- [x] A material can hold several stock sizes, each with a quantity
- [x] Remnants above a threshold are reported with their sizes
- [x] A guillotine strategy sits alongside the existing two

**Revised while working it.** The item did not say how to choose among several
sizes, or how the two kinds of "remnant" it names relate, so both were settled
in the doing:

- A **standard size and a remnant are one list**, not a sheet size plus a
  separate remnants list: `Material.sheets: SheetSize[]`, where a size with no
  `quantity` is standard (order as many as needed) and one with a `quantity` is
  a remnant (spend it, then it is gone). Two lists would have let a project
  claim a remnant that both was and was not the sheet size, which is exactly
  the kind of contradiction `normaliseParams` exists to not have to migrate
  later.
- Opening a fresh sheet picks the **smallest configured size that actually
  fits the part**, remnant or standard, so a big offcut is not spent on a part
  a small one would have carried. A remnant only wins a tie against a standard
  size of the same area — it is already paid for.
- The item's own word "remnant" covers two different things: a size the user
  types in because they already own it, and a leftover rectangle the nester
  finds once a sheet is full. Both are real and both are called that in the
  UI, but they are unrelated in code — the second is never fed back into the
  first automatically. Doing that would mean guessing whether an offcut from
  this run is still on the shelf by the next one, which is exactly the kind of
  false capability this codebase avoids; the number is shown so a person can
  enter it as a remnant themselves, on the project that will actually use it.
- **Guillotine sits alongside "fewest setups" and "least material" as a third
  `NestStrategy`**, not a modifier on the other two: it is a constraint on the
  *shape* of the layout (every part freeable by straight end-to-end cuts),
  while the other two are goals for the same MaxRects packer. A panel saw has
  no bed-size limit in the router sense, so the guillotine strategy never
  tiles and ignores `machine.tilingAxis` entirely — there was nothing to
  reconcile between the two ideas, only a decision that they are orthogonal
  and only one axis was asked for.
- Solid stock (`StockMaterial`, the board list R-07 added for face frames) is
  untouched. Boards are bought in one length and ripped to width; "several
  sizes, including remnants" and "a panel saw" both describe sheet goods, and
  widening the board list too would have doubled this item's scope for a case
  the acceptance criteria never named.

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
- [x] Generation runs in a worker; the UI never blocks
- [x] Rapid parameter changes coalesce rather than queue
- [x] A large project still previews smoothly

**What it cost, for the items that follow.** `store.ts`'s `project` is no longer
updated inside the same `set()` call as `params` — it lands separately, from
`apps/web/src/worker/projectWorkerClient.ts`, once the worker's rebuild for the
current params finishes. A new `building` flag on the store is true from the
moment `params` changes until that lands, so a view that cares can say so; the
topbar badge does. The coalescing itself needs no queue at all: the client
tracks one in-flight request and one pending one, and a request that arrives
while the worker is busy simply overwrites `pending` — dragging a slider
through fifteen values now costs two round trips to the worker, not fifteen.
`ARCHITECTURE.md`'s claim that "the previews and diagnostics can never disagree
with the parameters" is revised to say what is now true: they always catch up,
but for the length of one build they can lag behind what is on screen.

**What review found.** Two defects, both the kind this repo cares about,
because both would have shown up as a silently wrong file. First, `building`
dropped to `false` the instant any build finished, even when a coalesced
request for newer params was about to fire right behind it — the UI briefly
called itself settled while a second build was still running.
`projectWorkerClient.ts` now resends a pending request, if there is one,
*before* notifying its listener, and exposes `isBusy()` so the store can read
it accurately at that exact moment, rather than assuming the flag it had just
set. Second, and worse: `ExportBar`'s Export DXF button read `project` and its
`diagnostics`, which can be one build behind `params` — nothing stopped
exporting mid-build, which would have cut whatever the *previous* params
produced, silently, including skipping a blocking error the *new* params would
have raised. `blocked` now also considers `building`, and the button is
disabled and explains why while a rebuild is in flight.

---

### R-13 — Undo, autosave and a project library
`Milestone E` · `Depends on: R-03` · `Size: M`

**Goal.** Undo/redo across parameter changes, autosave to `localStorage`, and a
list of saved projects to open. Losing an hour's work to a stray reset is not
acceptable at 1.0.

**Where.** `apps/web/src/store.ts`, a new `apps/web/src/persistence.ts`, a new
`apps/web/src/components/ProjectLibrary.tsx`, `ExportBar.tsx`.

**Revised while working it.** The item as written had a goal but no acceptance
criteria — unlike every other item on this roadmap — so the list below was
written in the doing, from the goal's own sentence, rather than found
pre-written.

**Acceptance criteria.**
- [x] Every parameter change can be undone and redone
- [x] A burst of rapid edits — dragging a field, typing a number — undoes as
      one step, not one per keystroke
- [x] Reset and Open are themselves undoable — the disaster the goal names
- [x] The current project autosaves to `localStorage` and is restored on the
      next visit, with no action from the user
- [x] A library of designs saved under a name, independent of autosave, each
      openable and deletable

**What it cost, for the items that follow.** `apps/web/src/persistence.ts` is
the new home for everything that touches `localStorage`: `loadAutosave` /
`saveAutosave`, and `loadLibrary` / `saveLibrary` for an array of
`{ id, name, savedAt, params }`. Both read paths reuse the same
"does this look like a project" check `ExportBar`'s Open button already had,
and run it through `normaliseParams`, so a stale autosave from an older
schema or a hand-edited library entry repairs itself exactly as opening an old
file already does, rather than crashing the app on load.

`store.ts` gained `past`, `future` and `library`, and `undo`, `redo`,
`saveToLibrary`, `loadFromLibrary`, `deleteFromLibrary`. The history is a plain
undo/redo pair of stacks, not a queue keyed by time: `update()` pushes the
state a burst of edits started from onto `past` immediately, on the burst's
*first* call, and a later call within `HISTORY_DEBOUNCE_MS` of the one before
it is read as continuing that burst and pushes nothing further — the same
coalescing shape R-12 already uses for the worker, so a dragged slider costs
one undo step, not fifty, and Undo is enabled the instant an edit lands rather
than after the coalescing window. `reset()`, `load()` and `loadFromLibrary()`
all now go through a shared `jumpTo` that pushes the *current* params onto
`past` before swapping them out, which is what makes Reset itself undoable —
the exact loss the goal opens by naming. A fresh edit after an undo clears
`future`: redoing into a branch that no longer follows from the params on
screen would silently reapply a change the user has since typed over.

Autosave and the undo history are independent: autosave debounces to
`localStorage` on every path that changes `params`, undo history included, so
closing the tab mid-undo still resumes from what was on screen. The undo stack
itself does not survive a reload — restarting a session with a full redo queue
into parameters that are no longer on screen would be its own kind of
surprise, and no editor does that.

The project library lives in `ProjectLibrary.tsx`, a `<details>` popover next
to Save in `ExportBar` — new topbar chrome, so `styles.css` gained a `.menu`
pattern (a button-styled `<summary>`, an absolutely positioned panel) that the
next thing the topbar needs a small popover for can reuse. Undo and redo also
answer to Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), skipped while focus is
in a text field so a field's own native undo is not shadowed.

**What review found.** Three defects, caught before this landed:

- Autosave's debounce had nothing forcing it to fire before the tab actually
  closed — the one window where losing an edit is exactly the failure
  autosave exists to prevent. The debounce itself is still right (writing to
  `localStorage` on every keystroke would be wasteful), but a real exit
  cannot wait for it: `store.ts` now flushes whatever write is still pending
  the moment the tab is hidden or the page navigates away, on
  `visibilitychange` and `pagehide` — the pair the web platform actually
  fires reliably, unlike `beforeunload` on mobile.
- The first version of the undo history queued its commit to `past` behind
  the same debounce as the coalescing itself, so for up to 500 ms after a
  single edit the Undo button read disabled — correctly reflecting `past`,
  but incorrectly implying Ctrl+Z would do nothing, when it would in fact
  have flushed that pending edit and undone it. A button telling the user
  the opposite of what the keyboard shortcut standing right next to it does
  is exactly the kind of silent disagreement this codebase does not allow.
  The fix above — push the baseline immediately rather than after a pause —
  removed the gap entirely rather than papering over it with a second flag.
- `update()` unconditionally replaced `future` with a new empty array on
  every call, which is harmless once but was doing it on every keystroke of
  a drag — the exact hot path R-12 was built to keep cheap — waking every
  component reading `future` for no change at all. It now reuses the
  existing array when there is nothing to clear.

**Tests.** `apps/web` has no automated test harness yet (R-14); verified in
the running app instead — see the definition of done in `CLAUDE.md`.

---

### R-14 — Test the web app
`Milestone E` · `Depends on: R-02` · `Size: M` · **Deferred — see R-24**

**Problem.** `apps/web` has no automated tests. Every UI regression so far has
been caught by a human looking at a screenshot.

**Goal.** Component tests for the parameter panel and the export bar, plus a
handful of Playwright end-to-end tests over the flows that matter: change a
parameter and see the preview update, add an effect, export a zip.

**Deliberately not worked here.** Milestone F is about to rebuild the shell
this item would test: R-17 expects to dissolve `ParamPanel.tsx` outright, and
Milestone F's own opening line is that nothing in the current UI is
load-bearing except the geometry it displays. Component tests written against
today's sidebar and export bar would be exercising code with a known short
remaining life — thrown away days after landing, not months — and the
Playwright flows this item also wants are worth writing once, against whatever
shape the redesign actually ships, rather than now and again after the
rebuild.

Skip this item in its Milestone E slot. It resumes as **R-24**, once R-16
through R-23 have landed and the interface has a shape worth writing tests
against.

---

### R-15 — Golden-file DXF regression tests
`Milestone E` · `Depends on: nothing` · `Size: S`

**Problem.** Nothing catches an accidental change to the *bytes* of the output.
The geometry is well tested; the file format is tested only in fragments.

**Goal.** A small set of committed reference DXF files with a test that
regenerates and compares them, and a documented way to update them deliberately.

**Revised while working it.** The item had a goal but no acceptance criteria,
like R-13 before it — written below from the goal's own sentence rather than
found pre-written. It also did not say whether to extend the existing
`golden.test.ts`/`default-0.1` fixture or add beside it; extending was not
possible without breaking its own promise, so this adds a second, separate
mechanism instead. That fixture is pinned to the 0.1 default project
byte-for-byte specifically *because* nothing about it has changed since before
R-03 — folding new configurations into the same file and directory would have
meant either widening what "byte-identical to 0.1" means (weakening the
promise `ARCHITECTURE.md` documents) or forking its comparison logic in place
(harder to read than a second file). `golden-fixtures.ts` and
`golden-fixtures.test.ts` sit beside it instead, comparing a small, varied set
of *current* configurations against `test/golden/fixtures/<name>/`, regenerated
deliberately with `UPDATE_GOLDEN=1 npm test -- golden-fixtures`. See
`ARCHITECTURE.md`'s Testing section for the mechanics.

**Acceptance criteria.**
- [x] A small set of committed reference DXF (and cut list) files, covering
      configurations the 0.1 fixture cannot reach: tab-and-slot joinery, a
      face frame with a drawer stack, and a rabbet back with banded doors
      under a crooked opening
- [x] A test that regenerates each configuration and compares every file
      `exportProject` produces against the committed copy, byte for byte and
      in order, and fails if a file goes missing, a new one appears
      uncommitted, or the order changes
- [x] A documented way to update them deliberately — an environment variable
      that writes instead of comparing, named in both the test file's own
      header comment and `ARCHITECTURE.md`
- [x] A fixture with nothing committed yet fails with the exact command to
      run, not a bare diff

**Tests.** The tests *are* the deliverable here; the round trip itself was
checked by running `UPDATE_GOLDEN=1` to write each fixture, then running
normally to confirm the freshly written files compare equal, before committing
either.

---

## Milestone F — Design, and the people using it

Everything up to here made the tool capable. None of it made it usable, and the
interface has never been designed — it grew one control at a time, and it shows.

**This milestone opens with a redesign, not a polish pass.** R-16 and R-17 are
allowed to question everything, including the sidebar, the tabs, and whether a
form-driven interface is the right shape for this tool at all. Nothing in the
current UI is load-bearing except the geometry it displays.

### What we know about the person using this

They are a woodworker. They arrive knowing what they want to **build** — they
can picture the cabinet before they open the app. They do not know what this
tool can **do**.

Those are different kinds of knowledge, and the interface owes them both:

**Translation.** Getting the thing in their head into a form the machine can
cut, without fighting the software. Every second spent hunting for a control,
decoding a term, or scrolling past sixty fields is a second not spent building.
For the user who knows exactly what they want, the tool must get out of the way.

**Education.** They do not know that tab-and-slot joinery exists and needs no
fasteners, that the back panel can be beaded, that a crooked alcove is something
the tool handles, or what a shaker line looks like until they see one. A feature
nobody can find does not exist. Someone who came to build a plain box should be
able to leave having built something better than they knew to ask for.

These pull in opposite directions only if education is done badly. The
resolution is a rule:

> **The tool teaches by showing, never by telling.**

No tutorials, no modal onboarding, no tips that interrupt. Instead: every
capability is visible somewhere a person would naturally look, every choice is a
picture of its result, every explanation sits at the moment of the decision, and
every experiment is free because everything is reversible. Browsing the options
*is* the lesson. Someone in a hurry sees a gallery and picks; someone curious
sees the same gallery and learns what the tool can make.

Get this right and the same interface serves both. Get it wrong and you build
either a wall of jargon or a patronising wizard.

### The measured state of the interface today

Recorded from the running app so nobody has to re-derive it. Re-measured under
R-16 against `2647912`; the method is in [UX.md](UX.md) so these can be beaten
rather than argued with. The first-draft figures are kept alongside, because
what grew is itself informative.

| | Now | First draft |
|---|---|---|
| Sidebar groups | **17** | 15 |
| Groups open at rest | **5** of 17 | — |
| Controls when fully expanded | **129** (41 numeric, 25 dropdowns, 40 checkboxes, 4 text, 19 buttons) | 80 (47 numeric, 19 dropdowns) |
| Controls with every conditional branch on | **243** | — |
| Controls actually on screen at rest | **18** | — |
| Sidebar height when expanded | **6813 px — 8.1 screens** in a 320 px column (11798 px, 14 screens, with every branch on) | 4853 px |
| Share of the window given to the cabinet | **42.7%** at 1440 × 900, **34.6%** at 1024 × 768 | roughly 40% |
| Share given to the diagnostics panel | **26.4%** — more than the sidebar's 20.8% | — |
| Labelled fields carrying any explanation | **43 of 86** | — |

Numeric fields plus dropdowns are unchanged at 66. The rest of the growth is
R-09's edge-banding matrix — 24 unlabelled checkbox pills, six roles by four
edges — and the buttons, which the first count excluded and this one includes,
because a button that changes the design is a control.

And, by inspection:

- **Selection drives nothing.** Clicking a panel isolates it in 3D, and the
  sidebar changes by **14 characters** — one button's label, 5224 px down the
  column. The model and the controls are strangers.
- **Everything weighs the same.** A cabinet's width — changed constantly — sits
  at the same size and prominence as a hinge dowel offset, changed once.
- **Design settings and workshop settings are mixed.** Machine travel, tool
  diameter, hinge boring, nesting margins and *safe layer names* are properties
  of a workshop, set once and reused forever. They currently occupy the same
  space, and the same attention, as the design itself — **3403 px of the 6813,
  half the column**, interleaved with it.
- **Primary actions are buried.** "Add cabinet" is mid-scroll in an accordion,
  424 px down.
- **The diagnostics panel is a quarter of the screen and largely repeats
  itself** — four tiling warnings differing only in the sheet number, and four
  tile-span notes differing only in the part, out of fourteen entries — while
  the two permanent errors are about workshop setup rather than anything the
  user just did. It takes 26.4% of the window against the sidebar's 20.8%.
- **Capabilities are unreachable without their name.** Tab-and-slot joinery is
  3550 px down inside a group that is closed at rest, with no explanation on
  the control at all; surface effects are at 5224 px; the guillotine nesting
  strategy is at 6538 px. Twelve of the seventeen groups are closed at rest and
  a closed group renders nothing, so the only thing naming any of it is a
  one-word heading.

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
9. **Every capability is discoverable by browsing.** If a feature can only be
   found by reading the documentation, the interface has failed. Teach by
   showing it, in place, at the moment it is relevant — never by interrupting.

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
| Find out what this can do | "What am I able to make here that I did not know about?" |
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
- **How does somebody find a feature they do not know exists?** Pick three —
  tab-and-slot joinery, surface effects, the bottomless upper carcass — and work
  out how a user would ever come across them today. The answer is currently
  "read the source", and that is the failure this principle exists to fix.

Sketch at least two genuinely different architectures before choosing. Say what
you rejected and why — the next person will want to know whether their idea was
already considered.

**What it found.** [UX.md](UX.md) carries the argument; the findings that
changed the plan are worth having here too.

**The app already contains its own answer, applied once.** `CabinetList` and
`CarcassGroups` narrow the sidebar to the *selected* cabinet, which is why the
column grows by only 143 px per extra cabinet in the run. Part selection
raycasts, isolates and highlights — and changes exactly **14 characters** of the
sidebar, one button's label, 5224 px down. R-17 is finishing a mechanism that is
already half built, not inventing one.

**The measured state had moved and was re-measured.** 17 groups, not 15; 129
sidebar controls on the default project and 243 with every branch on, not 80;
6813 px and 8.1 screens, not 4853. The numeric-and-dropdown count is unchanged
at 66 — the growth is the edge-banding matrix R-09 added and the buttons the
first count left out. The preamble table above now holds the re-measured
figures. The diagnostics panel takes **more of the window than the sidebar
does**: 26.4% against 20.8%.

**Two findings are defects, not frictions.** On a fresh project the only fix the
app offers for its only blocking errors — *Set sheets to machine size* — trades
two errors for a different blocking error whose hint contradicts the button that
was just pressed, and export stays disabled either way. The route that works is
the other half of the same diagnostic's sentence and is offered nowhere. That is
now R-21's headline rather than a note in a document.

And **eight parameters have no control anywhere in the app** — the five
material-role assignments (carcass, shelves, drawer boxes, doors, backs),
unequal bay widths, and the two shelf-pin ladder limits. One is named as the fix
in a diagnostic the app already raises: a three-drawer bay produces six
identical warnings that the box material is 11.9 mm against a slide needing 12,
and says to change the drawer box material, which cannot be done. R-17's "no
regression, every parameter still reachable" therefore starts from a baseline
that already fails, and now says so.

**Acceptance criteria.**
- [x] `docs/UX.md` names the users and journeys, with the reasoning
- [x] Each journey walked in the running app, written up as it really is, with
      interaction counts recorded as a baseline R-17 must beat
- [x] A prioritised friction list, each entry naming the journey it came from
- [x] Every architectural question above answered, with the alternatives
      considered and the reason for the choice
- [x] At least two architectures sketched, one rejected in writing
- [x] The rest of this milestone reconciled against the findings: confirmed,
      re-scoped, or dropped with a reason
- [x] A discovery audit: for each significant capability, how a user would find
      it today, and whether that route is good enough
- [x] Any idea that is good but out of scope added to
      [feature_suggestions.md](feature_suggestions.md)

**Risks.** Producing a document that flatters what already exists. If a journey
comes out fine on the first walk, be suspicious: watch somebody who has never
seen the tool try it, and time them.

*Not fully retired.* No first-time user was watched. The walks are scripted, so
every count and every time is the shortest route a person who already knows the
interface would take — floors, and the document says so. Two mitigations were
applied instead of the watching. **Look for the failure rather than the
success:** J6 was walked down the path the app itself recommends, which is how
the defect above was found. **And do not let the target flatter the tool:** the
first version of J1 asked for a cabinet close to the shipped default, so most of
its interactions were typing values that were already there. It was rediscovered
in review, and the journey re-walked against a target that differs from
`defaultParams()` in almost every field. Any future re-walk should check that
first.

---

### R-17 — Rebuild the interface around the cabinet
`Milestone F` · `Depends on: R-16` · `Size: XL`

**Problem.** The interface is a form with a picture next to it. It should be a
cabinet you can work on. Seventeen groups and 129 controls — 243 with every
branch switched on — are presented at a flat, equal weight in a column narrower
than a phone, while the thing being designed gets 42.7% of the window and cannot
be edited by touching it.

**Goal.** Execute the architecture R-16 chose — **"the bench"**, sketched in
full in [UX.md](UX.md) along with the alternative that was rejected. This is a
rebuild of the shell, not a reskin: layout, navigation, where settings live,
what selection means, and how the project's structure is represented.

**Confirmed by R-16, with three changes.** The direction below survived contact
with the measurements; what R-16 added is:

- **A run strip** as the structural spine — a scale elevation of the run along
  the bottom, a column per cabinet, click to select, drag to reorder. The
  project's structure is three nested *linear* orders that each correspond to a
  direction in the room, not a tree, and a tree widget would carry less
  information than the model already on screen.
- **Selection always resolves**, so there is no empty inspector to design:
  nothing narrower selected means the run is selected, and the run has plenty
  to show.
- **Find-by-name ships with the shell**, pulled forward out of R-19. It is the
  cheapest fix for the discovery failure and this item cannot deliver
  "everything reachable by name" without it. It must match the words a
  woodworker uses, not only the field labels: *kickboard* → toe kick,
  *beadboard* → grooves, *knock-down* → tab and slot, *rebate* → rabbet.

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

**The workshop profile must not become a live reference.** A project file keeps
its own full parameters, exactly as it does now. The measured thickness of the
sheet a design was cut to sets every groove width in it, so a project that
silently re-cut itself to whoever opened it would be the "silently producing a
wrong cabinet" failure `CLAUDE.md` calls the worst outcome available. Applying a
profile is a loud, ordinary, undoable parameter update — never a pointer.

**Acceptance criteria.** The numbers below are R-16's measurements; the method
for reproducing them is in [UX.md](UX.md), and what R-17 measured against them
is recorded there too.
- [x] The architecture from [UX.md](UX.md) implemented as the app's shell
- [x] Design and workshop settings clearly separated; workshop settings saved
      and reusable across projects, applied as an undoable update rather than
      referenced live
- [x] Selecting something in the model brings up its controls, in context —
      against a measured baseline of 14 characters of sidebar
- [x] The cabinet occupies **≥ 70%** of the window at 1440 × 900 and **≥ 60%**
      at 1024 × 768, against 42.7% and 34.6% today — **84.4% / 81.8%** of the
      window is the model's own rectangle, **76.0% / 67.9%** once the floating
      inspector's card is subtracted from it
- [x] Everything reachable by name from a command palette or equivalent,
      including by the trade's own words
- [x] Controls rendered in the shell at rest **≤ 20**, all of them about the
      selection, against 39 rendered at rest today and 129 with every group
      open; the figure recorded — **20**, counted over the whole page rather
      than one panel, and broken down in [UX.md](UX.md)
- [x] Interaction counts improved against R-16's table: J1 ≤ 8 (11), J4 ≤ 3
      (5), J6 ≤ 2 and offered (3, off the beaten path), scroll ≤ one screen per
      journey (664–2682 px today) — **except J3**, where the target is that no
      route accepts a guessed corner angle, even if that makes it longer.
      Measured: **J1 8, J4 2, J6 2** with the cost on the button, **0 px** of
      scrolling on either walk, and no route that accepts a typed angle at all
- [x] No regression in what the tool can express: every parameter behind
      today's controls still reachable — 129 on the default project, **243**
      with every branch switched on — **and the eight that are not reachable
      today**, which UX.md lists (the five material-role assignments, unequal
      bay widths, and the two shelf-pin ladder limits). One of them is named as
      the fix in a diagnostic the app already raises
- [x] `packages/core` unchanged, or the reason it had to change written down —
      unchanged; `apps/web` grew four modules and the core kept its shape

**Tests.** Every parameter still reachable — worth an explicit test, because the
easiest way to score well on the other criteria is to quietly drop controls.
Playwright coverage of the journeys, which then guards the counts.

*Landed as a pair of catalogue tests in `apps/web/test`, both directions:
every parameter of a project with every branch switched on must be claimed by a
catalogue entry (or by an explicit "not a control, because…"), and every
catalogue entry's path must appear as a `param` on a control in the source.
The journeys were walked with Playwright and the counts recorded in
[UX.md](UX.md), but not landed as tests — the harness for that is R-24, which
exists so it is built once against the shape the redesign actually shipped.*

**Risks.** The largest item on the roadmap and the easiest to half-finish,
leaving two interfaces at once. Land the shell and the navigation first, migrate
every panel, then delete the old one in the same pass. A half-migrated sidebar
is worse than the one we have.

*Retired: `ParamPanel.tsx`, `ExportBar.tsx`, `Diagnostics.tsx`,
`EffectsPanel.tsx`, `BandingPanel.tsx` and `ProjectLibrary.tsx` were deleted in
the same pass that added the shell, so there was never a second interface to
keep working.* Three places where the design gave under contact with the code —
the run strip's scaling, the bay controls appearing on the carcass as well, and
find-by-name having to open the section it lands in — are written up in
[UX.md](UX.md) rather than quietly absorbed.

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

This item carries most of the milestone's teaching load. A gallery of rendered
options is simultaneously a picker and a **catalogue of what the tool can
make**: somebody in a hurry glances and chooses, somebody curious scrolls it and
discovers that tab-and-slot joinery exists. Design it so both readings work —
that means showing every option, including ones the current design cannot use,
with the reason they are unavailable.

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

**R-16 raised this line from nice to load-bearing.** Measured: switching from a
stopped dado to tab and slot changes *nothing on screen* — same badge, same 21
parts, same 4 sheets. The cost of a construction choice is currently invisible,
so the trade-off line is not decoration around the picture, it is the only place
the consequence is stated at all.

**Label the gallery with the question, not the field.** "How should the boxes go
together?" reads to somebody who does not yet know the answer; "Carcass joint"
only reads to somebody who does. This is the one idea worth keeping from the
architecture R-16 rejected, and it costs a string.

Then: **hovering a choice previews it on the actual design** and reverts on
leave. Seeing the change on your own cabinet, at your own dimensions, beats any
thumbnail — the thumbnail is how you know what to hover.

**The same machinery gives you the starter gallery.** Ship real starter projects
— the reference built-in, a run of base units, a wall cabinet, a wardrobe, a
bookcase — each loading complete and cuttable, each shown as a render produced
the same way. Editing something that works beats composing from defaults, and
each one doubles as proof of what the tool can do.

**Revised while working it.** One criterion could not be met as written and one
finding changed the shape of another; both are recorded here rather than
quietly worked around.

- *"each generating with no diagnostics"* is not reachable and never was. The
  `info` severity exists for things worth knowing — *"21 parts on 4 sheets,
  averaging 71% yield"* — so a project with no diagnostics at all is a project
  the checker declined to describe. Worse, the shipped default workshop raises
  two **errors** for every project there has ever been, because a 2440 × 1220 mm
  sheet does not fit a 1000 mm bed; that is the shop's problem, not the
  starter's, and R-21 owns moving it to where it can be fixed. Read as
  *"nothing blocking that the design itself causes"*, which is what the test
  asserts, on a workshop big enough for the sheets.
- **Corner relief does nothing at all under stopped-dado joinery**, which is
  the default. Relief is applied to tab-and-slot slots and to the roots of the
  tabs, and to nothing else — a dado's groove ends are rounded by the cutter's
  own radius and want no relief, which `JOINERY.md` says twice without ever
  saying the consequence. So the control has been sitting there changing not
  one byte of the output for every default project. Drawing it forced the
  question. The gallery renders its samples on a tab-and-slot box whatever the
  project uses, and the joinery section says in a line why, rather than showing
  three identical pictures of nothing happening.

**Acceptance criteria.**
- [x] A thumbnail renderer that builds its samples through the real pipeline
- [x] Every geometric choice presented as pictures with a one-line trade-off —
      eleven galleries: the carcass joint, corner relief, the top, the back,
      where a stacked box gets its floor, frameless against face frame, the
      cabinet types, what fronts a bay, what is inside it, how the fronts sit,
      and which effect is cut into a face
- [x] Cutaway thumbnails where the difference is internal — a real plane
      through the assembly, with the pockets, slots and hinge cups taken out of
      the material it crosses, for the top, the back, the floor, the door fit
      and the inside of a bay
- [x] Hover previews the choice on the actual design; click commits
- [x] Starter projects chosen from a gallery of live renders — five of them,
      each building with nothing blocking that the design causes (see the
      revision above), and each carrying this browser's workshop rather than
      the one it was written on
- [x] Thumbnails cached, and never stale after a joinery change — keyed on the
      sample's own parameters, which is the only key that cannot go stale
- [x] Options that do not currently apply are shown, greyed, with the reason —
      the bottom panel a box on the floor cannot leave out, and the shelf a
      bank of drawers has nowhere to put
- [x] Text-only fallback for anything genuinely non-visual — the nesting
      strategy, whose output is a packing of *your* parts, so a rendered sample
      would be a picture of somebody else's project
- [x] Each gallery titled as the question it answers, not as the parameter name
- [x] The consequence of a choice visible before it is committed — hovering
      tab and slot on the default project now reads *"21 parts · 4 sheets ·
      222 cuts (−28). 1 warning fewer."* against R-16's measured baseline of
      nothing changing on screen at all

**Tests.** Every choice in every gallery, and every starter project, builds
without error — that catches a stale sample after a model change, which is
exactly the failure this design exists to prevent.

*Landed as `apps/web/test/gallery.test.ts`, 64 tests. Three of them earn their
keep beyond "it built": every option in a gallery has to draw a **different**
picture from its siblings, because a gallery of one picture with several names
is worse than the dropdown it replaced; the section through a dado-jointed side
panel has to come out exactly one dado depth thinner across the groove, which
is what separates a cutaway from a rectangle; and the cache has to miss on a
changed dado depth and hit on a changed cabinet width, which is the risk below
stated as an assertion.*

**Risks.** Rendering a dozen thumbnails on every keystroke. They depend on
material thickness and tool diameter but not on cabinet size; key the cache on
what they actually use.

*Measured with fourteen thumbnails on screen and a dimension being dragged:
1.9 ms per edit with the galleries closed, 2.5 ms with them open. Two things
were needed beyond the cache. A closed `details` still renders its
children, so every gallery in the inspector was building and projecting
geometry for a section nobody had opened; `Group` now says whether it is open
and a picture waits for that. And the hover preview runs on a **second**
worker, so considering an option never delays the build the user's own typing
is waiting on, and a preview abandoned mid-flight cannot land as the design —
each request carries a tag, because coalescing means some never run at all.*

**A bug found on the way, and it was not R-18's.** Find-by-name did not
`preventDefault` on Enter. The palette handled the key, `reveal` moved focus to
the control it had found, and then Enter's own default action landed on
whatever now had focus — so searching **knock-down** and pressing Enter set the
carcass joint to stopped dado and said nothing. It has been there since R-17,
because `ChoiceField` was a row of buttons too; galleries would have made it
happen on nine more parameters. The palette now eats the key, and the reveal
focuses the option *already in force* rather than the first one, so landing on
a gallery neither changes the design nor previews a choice nobody asked for.

---

### R-19 — Let people find what they did not know to look for
`Milestone F` · `Depends on: R-16, R-18` · `Size: M`

**Problem.** Nothing in this tool tells you what it can do. Tab-and-slot
joinery, surface effects, the bottomless upper carcass, stopped dados, scribing
to a crooked wall — all of it is real, tested and documented, and all of it is
invisible unless you already know the word to look for. Somebody who came to
build a plain box will build a plain box, having never learned they could have
done better. The documentation explains everything and nobody reads it while
designing.

**Goal.** The tool shows what it can do, in place, without interrupting anybody
who does not want to know.

**Where.** The inspector and viewport from R-17, the gallery machinery from
R-18, a small content layer keyed to features.

**Design notes.** R-18 does most of the heavy lifting by turning options into
pictures. This item covers what that leaves.

**One part has moved to R-17.** *Find by name* — searching parameters, options
and the trade's own synonyms — shipped with the shell instead, because it is
small, it is the cheapest fix for the discovery failure R-16 measured, and R-17
cannot honestly claim "everything reachable by name" without it. What stays here
is everything that reaches somebody who does not have a word to search for.

**R-16's discovery audit is the target list.** Three rows in it are a clear yes
today: two in the top bar or a tab, and reordering the run at the top of the
sidebar. Everything else geometric sits 500–6800 px down the column, fifteen of
those inside groups that are closed at rest and so render nothing until opened.
The audit table in [UX.md](UX.md) names each one and how bad its route is;
work it.

**Explain in place, on demand.** Hover or select a joint in the 3D view and get
a section through it, the clearances, and one line on why it is shaped that way.
The knowledge already exists in `JOINERY.md` and `DOORS.md`; this puts it where
the question is actually asked. R-20's section plane renders it.

**Worked examples that say what they demonstrate.** The starter projects from
R-18 each become a lesson: *"this one uses tab-and-slot joinery and needs no
fasteners"*, *"this one has no bottom on the upper carcass"*. Load it, take it
apart, see how it was done. That is how woodworkers learn from each other
already.

**Quiet contextual suggestions.** Where a capability plainly applies to what
somebody is doing — an empty bay that could take drawers, a plain door that
could take a shaker line — say so once, unobtrusively, and let it be dismissed
for good. **This is the part most likely to be done badly.** The bar: never
modal, never animated, never repeated after dismissal, and never shown while the
user is mid-action. If in doubt, leave it out; an annoying tool is worse than a
quiet one.

**A capability overview, for the curious.** One place that shows what the tool
can make — every joint, every effect, every cabinet type, rendered — that can be
browsed without touching the current design. Not a manual. A showroom.

**Acceptance criteria.**
- [x] Selecting a joint or feature explains it in place, with a section drawing
      — every blank's machining, grouped by what put it there, and a section
      through **the live project** at whichever one is opened, not through a
      sample of somebody else's cabinet
- [x] Starter projects state what each demonstrates — named rather than
      described, as topic ids, and each claim checked against the geometry the
      starter actually builds
- [x] Contextual suggestions appear at most once, dismiss permanently, and never
      interrupt an action in progress — six of them, one at a time, at the foot
      of the inspector, gated on a settled selection with nothing building, no
      option being considered and nothing open over the bench
- [x] A browsable capability overview, rendered from real geometry — the
      showroom: 23 capabilities in seven groups, 21 of them a picture the
      pipeline drew on this browser's own sheets and cutter
- [x] Every explanation is generated from or checked against the docs, so it
      cannot drift from what the code does — each topic cites a `docs/` heading
      and the phrases it stands on, and a test reads that section back; no
      dimension is written into a sentence, they are all read off the live
      project
- [x] Somebody who has never read the documentation can name three features they
      discovered while designing — **13 named before a single click** on a fresh
      browser, and 23 explained one click later. See
      [UX.md](UX.md#what-r-19-built-and-what-it-measured)

**Tests.** Every explanation answerable to a doc, every picture actually
containing the thing it names, and every piece of machining the pipeline can
produce reachable from an explanation.

*Landed as `apps/web/test/explain.test.ts`, 111 tests. Four of them carry the
item: every topic's cited `docs/` heading has to exist and still contain the
phrases the explanation stands on; every topic that can recognise itself has to
find itself in its own sample, so a tile cannot be a picture of a plain box
under the heading "Through tab and slot"; every `purpose` a project with every
branch switched on produces has to have both a name a woodworker would use and
a topic, so a new joint arriving with no explanation fails here rather than
showing up as a blank panel; and the section plane chosen for a feature has to
actually pass through that feature, because "it drew something" is not "the
groove is in it".*

**One doc had to be written before it could be cited.** The toe kick had no
section anywhere in `docs/`, which R-18 had already noticed and left here. An
explanation grounded in the nearest paragraph that happened to mention it would
have been the drift this item's fifth criterion exists to prevent, so
[JOINERY.md](JOINERY.md) gained a *Toe kick* section describing the joint the
builder actually makes.

**Risks.** Becoming the thing this milestone exists to avoid. Every element here
must be ignorable. Measure it: a user who dismisses everything should reach the
same design in the same number of interactions as one who never saw it.

*Cost, measured: opening the showroom builds and projects its twenty-one
samples in **43.5 ms** cold and **11.5 ms** warm — the same parameter-keyed
cache R-18 built, so a second visit re-uses every build — and it is opened
deliberately rather than on every keystroke. A section through the **live**
project, which is redrawn whenever the design changes under an open
explanation, costs **1.0 ms**, against R-18's measured 2.5 ms for a keystroke
with fourteen thumbnails on screen.*

*Measured: the shell renders **20** controls at rest with every suggestion
spent, which is R-17's figure unchanged, and **23** while one is up — a state
that can happen at most six times in the life of a browser. The cabinet's share
of the window is unchanged at 84.4% / 81.8% gross, and 73.5% net at 1440 × 900
with a suggestion showing against 76.0% without it (63.7% against 67.9% at
1024 × 768) — inside the ≥ 70% / ≥ 60% budget either way. Nothing on any
journey needs a suggestion: every one of them is a second route to a control
that was already there.*

**A bug found on the way, and it was this item's own.** The first cut of the
quiet suggestions gated them on a `settled` flag set by a timer in an effect.
An effect runs *after* the render that changed the state it watches, so
dismissing the starter gallery rendered one frame with the old flag still true:
the suggestion appeared for that frame, and the once-only rule spent it. It was
recorded as seen in `localStorage` and never shown again — a tip that was
"shown once" for 16 milliseconds. The wait now records *which* state it settled
on rather than that it settled, so the render that changes the context is
unquiet in that same render.

---

### R-20 — Configure the cabinet by touching the cabinet
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

**R-16 pulled "click a bay to configure it" forward into R-17.** It is not
polish on top of the new shell; it *is* that shell's selection model applied at
the bay level, and the journey it serves — "drawers in that bay", the one people
repeat — does not improve without it. Measured today at 5 interactions and 664
px of scroll, of which the first two are wasted: clicking the bay in the model
isolates a panel and changes nothing else, so the click has to be undone before
the real route starts. Target 2. Dragging, click-to-restyle and the section
plane stay here, and making bays addressable at all is still the real work.

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
- [x] Clicking a bay opens its controls in the viewport — the builder records a
      `BayVolume` per opening and the view raycasts those, back-face only, so a
      bay is the space nothing standing in it claims; the inspector card moves
      opens that bay's controls in the inspector, which stays docked (see the
      note below)
- [x] Clicking a door, shelf or panel offers what applies to it — a door leads
      with its bay's fronting, a shelf with its heights, a divider with the bay
      count and widths, a side panel with the box's size, a scribe strip with
      the measured room. All of it the level above's *own* component, filtered,
      never a copy
- [x] Dividers and fixed shelves draggable, snapping sensibly, showing the live
      dimension — to an equal pair, the 32 mm module the box is bored on, and a
      round ten, with which snap it landed on named on screen
- [x] A section plane that can be dragged through the assembly — on any axis,
      grabbed by its border, flippable, with a slider for the millimetre
- [x] Every change made this way is a normal parameter change: undoable (R-13)
      and saved with the project — a whole drag coalesces into one undo step,
      the same way a dragged field already did
- [x] The sidebar keeps only what is genuinely global — audited: the workshop
      drawer holds nothing about a particular cabinet, and the run's own
      inspector holds nothing narrower than the run. See the note below

**"In the viewport" turned out to mean the controls, not the card.** The first
version read the criterion literally and moved the inspector card to whatever
had just been clicked in the model. Driven in the running app, that puts a
300 px panel over the middle of the cabinet — the exact thing R-17's whole
architecture exists to keep clear, and it costs the model the space the item
before this one spent an XL getting back. The half worth having is that
clicking a bay brings up *that bay's* controls at all; where they appear is
better answered by "where controls always appear". The card is docked again.

**The model gained a parameter, and it had to.** Fixed shelves were always
evenly spaced: `BaySpec` had no way to say where one sits, so "drag a fixed
shelf" had nothing to write. `BaySpec.shelfGaps` is the exact mirror of
`bayWidths` one axis round — the clear openings between the shelves, bottom to
top, used as given when they add up and split evenly with a note when they do
not. See [JOINERY.md](JOINERY.md#fixed-shelves).

**On "the sidebar keeps only what is genuinely global".** There is no sidebar
left to trim — R-17 dissolved it — so this was read the way it was meant: does
anything about one cabinet still live in the shared surface? It does not. What
*does* happen, deliberately, is the reverse: a handful of project-wide settings
(the door reveal, the shelf-pin ladder, the joinery) are rendered inside a bay's
or a carcass's inspector, where they are actually fixable, each with a line
saying it applies to the whole project. Moving them out would undo R-17's
journey counts to satisfy the letter of a criterion about a panel that no longer
exists.

**Risks.** Two editors of one value that disagree. The parameters are the single
source of truth; the viewport is another editor of them, never a second copy.

*Two places the design gave under contact with the code, and four bugs testing
and review found — all of them "a drag that appears to work and does not" — are
written up in [UX.md](UX.md) with the measured counts: the section plane's grab
handle had to shrink to its border, an "equal openings" snap needs a wider
target than a round number to be reachable at all, and the four are a rounded
pair that shifted the far end of the box, a seed taken from a list the builder
had already rejected, a commit with no click threshold, and a 32 mm snap that
moved the gap rather than the shelf's height above the floor of the opening.*

---

### R-21 — Diagnostics that show you the problem
`Milestone F` · `Depends on: R-16` · `Size: M`

**Problem.** The diagnostics say what is wrong well and help you fix it badly.
One flat list at every severity, repeated per sheet, with the fix as prose you
must translate into a hunt through the sidebar. Worse, the most important
message — *this part is too big for your machine* — is a sentence about numbers
when it could be a picture of the part next to the machine's envelope.

**Goal.** Grouped, deduplicated, actionable, and shown rather than described.

**Where.** `Diagnostics.tsx`, `machine/check.ts`.

*`Diagnostics.tsx` no longer exists — R-17 retired it in the same pass that
built the shell, and folded a first version of most of this item into its
replacement, `components/DiagnosticsPanel.tsx`, months before this item's own
slot came up. Grouping by severity with repeats collapsed to a count, the
readiness chip, and — critically — the structured-fix mechanism this item's
own headline is about, were already there and already tested. What actually
landed here: topic headers, the spatial diagrams, a full readiness sentence,
Export explaining itself instead of only disabling, the workshop badge
visible without opening the door, and — raised mid-session by the person
running the app, who found the panel sitting as a floating card over the
cabinet — docking it to the bottom of the stage instead, the cabinet staying
visible above it.*

**R-16 found a defect here, and it is now this item's headline.** On the default
project the app's only offered fix for its only blocking errors makes things
worse:

| | Errors | Warnings | Export |
|---|---|---|---|
| Fresh project | 2 | 5 | blocked |
| After pressing **Set sheets to machine size** | 1 (a *different* one) | 1 | still blocked |

The two sheet-versus-travel errors become *"4 part(s) will not fit on any sheet
size this material offers"*, whose hint reads *"Add a larger sheet size, or
reduce the cabinet size"* — contradicting the button just pressed. The default
cabinet has 1100 mm parts and the bed is 1000 mm square, so shrinking the sheet
to the bed makes four parts unnestable. The route that works is the *other* half
of the same diagnostic's own sentence — rip the sheets, i.e. width 1000 on both
materials, three interactions — and nothing offers it.

**Design notes.** The `hint` field already names the parameter that fixes each
diagnostic, in prose. Where the fix is a single unambiguous parameter change,
make it a button — but the pattern the first draft of this item pointed at as
proof is the counter-example, so the mechanism has to be built with that in
mind. `Diagnostic` grows an optional structured fix — a parameter path and a
value — applied through the normal update path so it is undoable like anything
else. Only where it is genuinely unambiguous; a button that guesses is worse
than a sentence that explains, and **a fix that would raise a new blocking
error is not a fix**: check the result before offering it, the same way the
pipeline is cheap enough to run twice.

*Built differently.* A fix as "a parameter path and a value" on the
`Diagnostic` itself cannot say "rip both sheet materials to 1000 mm", which is
two writes across a list whose length nobody can predict — the actual shape
of the fix that clears F-1. `apps/web/src/fixes.ts` already existed (built
ahead of schedule during R-17, which needed *some* answer to reach an
exportable default project) as a short list of whole-project candidates, each
one applied to a clone and rebuilt through the real pipeline before it is
shown, kept only if it strictly reduces the error count, sorted so the
cheapest full clear leads. That already *is* "checked before it is offered,
and a fix that raises a new error is not a fix" — just scoped to the errors
that block export, which is what J6 needs, rather than to every diagnostic
that names a parameter. Generalising it to warnings and info notes as well
was considered and left out: most of them have no single unambiguous fix (a
sagging shelf's hint alone lists three different changes), and inventing one
means guessing, which this codebase does not do with a cabinet.

**Two errors about the machine are the first thing a new user sees**, before
they have designed anything, because a fresh project's sheets do not fit a
default bed. Route workshop-setup diagnostics to R-17's workshop surface, with a
badge, rather than putting them in front of somebody who has not been asked what
machine they own yet.

Then **show the failure**. A part that will not fit gets a small diagram of the
part against the machine envelope with the overhang shaded. A tiling warning
gets the sheet with its seams drawn. A sagging shelf gets its span. The
machinery to draw all of these already exists in the sheet view.

Group by topic, collapse repeats with a count, and put a readiness summary at
the top. "Ready to cut" is currently inferred from the colour of a dot; say it.

**Acceptance criteria.**
- [x] Grouped by topic, sorted by severity, repeats collapsed with a count
- [x] Unambiguous fixes offered as buttons, applied undoably
- [x] Spatial problems shown as a diagram, not only described
- [x] A readiness summary answering "can this be cut" in words
- [x] Clicking a diagnostic still highlights the part everywhere
- [x] Export explains why it is blocked rather than only being disabled
- [x] Workshop-setup diagnostics shown where they are fixable, not in front of
      somebody who has not chosen a machine yet
- [x] The default project reaches an exportable state in **≤ 2 interactions**,
      both of them offered
- [x] No view is permanently reduced by the panel. Today it holds 26.4% of the
      window — more than the sidebar gets — on every tab including the Build
      guide, and on the Parts tab that is why only 2 of 21 rows are visible
      while the drawing is up, and why the drawing is gone by the time row 15
      can be reached

**Tests.** Each structured fix clears the diagnostic that offered it **and
raises no new error** — one test each, because a fix that does not fix is worse
than none, and this item's own first draft cited a fix that does exactly that.

*Landed in `apps/web/test/diagnostics.test.ts`: `offeredFixes` on the default
project pins that ripping both sheet materials clears every blocking error,
sorts first, and is reachable in the two interactions R-17 already measured
(open the list, press the top button); a second test runs every offered
candidate through the pipeline and asserts each one strictly reduces the
error count and actually changes something, which is the same "checked
before it is offered" promise stated as an assertion rather than a comment.
Topic bucketing and the readiness sentence are pinned against the default
project's real fourteen-entry diagnostics list, not a synthetic one, so a
regrouping that quietly drops or duplicates an entry fails here. The three
spatial payloads — a part against the machine's travel, a sheet's seam
positions, a shelf's span against the 40×-thickness rule — are pinned in
`packages/core/test/pipeline.test.ts`, next to the diagnostics they come
from, with the exact numbers a diagram would need to draw them; `packages/core`
has no rendering of its own to test against, so the numbers are the contract.*

**What review found.** Three defects, all in the "Export explains itself"
mechanism, caught before this landed:

- `aria-disabled` on the Export button was the wrong tool for "stays
  clickable so it can explain itself" — Playwright (and, more to the point, a
  screen reader) reads `aria-disabled="true"` as exactly that, disabled,
  which is precisely untrue here: the button still does something on every
  click. Dropped in favour of an ordinary enabled button styled to read as
  blocked.
- The button painted itself in the same red as an actual blocking error
  whenever a rebuild was merely in flight (`building`, R-12), on every
  keystroke that triggers one — even with zero errors. "Still catching up"
  and "something is wrong" are different states and had been sharing one
  colour. Red now follows `errors > 0` alone; `building` still holds the
  click (nothing to export yet) without claiming a problem exists.
- The output pack's own copy of this button special-cased `errors` but not
  `building`, unlike the top bar's — a click mid-rebuild opened the
  diagnostics list, which would then read the stale, error-free previous
  build and say "Ready to cut", flatly contradicting the click that had just
  refused to export. Brought in line with the top bar's guard.

A fourth, unrelated to Export: the resize handle's `pointermove`/`pointerup`
listeners live on `window`, added on pointer-down and removed on pointer-up —
but Escape closes the panel (and so unmounts it) regardless of whether a drag
is still in progress, and unmounting does not deliver a `pointerup`. Without
an unmount-time cleanup, dragging the handle and then pressing Escape before
releasing the mouse would leak that listener pair for as long as the button
stayed physically up. A `useEffect` cleanup now runs the same teardown on
unmount.

**What it cost, for the items that follow.** `Diagnostic` gained an optional
`spatial: DiagnosticSpatial` field — a small closed union (`part-vs-machine`,
`sheet-tiles`, `shelf-span`) set at the one place in `checkManufacturability`
that already has the exact numbers the sentence next to it was built from, so
a diagram can never say something the message does not. `severityRank` moved
from `apps/web/src/store.ts` to `packages/core`, next to `Severity` itself —
it is a fact about the domain type, not the UI, and the move was forced: the
grouping logic needed it and store.ts pulls in the project web worker at
module scope, which does not exist under a Node test runner. The grouping
and bucketing logic that used to live inside `DiagnosticsPanel.tsx` moved
out to `apps/web/src/diagnosticsGrouping.ts` for the same reason — it is the
part of this item worth pinning, and a `.tsx` component is not something this
repo's test setup imports. `apps/web/src/diagnosticTopics.ts` is the new,
single place that says which topics the workshop door can actually fix
(`machine`, `nesting`, `hardware`) — both the panel's "open the workshop"
link and the door's own badge read it, so the two cannot silently disagree
about what is behind the door. `apps/web/src/components/DiagnosticDiagram.tsx`
is the small SVG renderer for the three spatial kinds.

---

### R-22 — Confidence at export, and a view for the workshop
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
and answers a real, frequent problem. **R-16 makes it the highest-value line in
this item, not an afterthought** — of the seven journeys walked, it is the only
one that cannot be completed at all. Today the route to one ruined panel is the
whole-project zip and another program.

**Nothing may be explained only in a `title`.** Forty-three of the 86 labelled
fields carry a hover tooltip and it is the only explanation they have. A tablet
at arm's length cannot hover, which makes half the tool's help invisible in
exactly the place this item is designing for.

**Acceptance criteria.**
- [x] Export preview with sheet thumbnails, tiles and materials before download
- [x] A shopping summary: sheets by material, hardware by type and count
- [x] Any single part re-exportable on its own
- [x] A workshop view legible at arm's length, steps illustrated, progress
      surviving a reload
- [x] The designer usable on a tablet, even if it is not the focus
- [x] No explanation reachable only by hovering

**Revised while working it.** `ExportBar.tsx` named in the item's own "Where"
line was retired in R-17, months before this item's own slot came up — its
export button split into `TopBar.tsx`'s and `OutputPack.tsx`'s own copies,
which is where the preview hooks in instead. And "a workshop view" needed a
name that did not collide with the existing Workshop *drawer* (R-17's door
onto the machine, the tooling and the sheets — the shop's settings, set once)
now that both are real: this item's is **At the machine**, a third door
beside Workshop and Output, for the job in progress rather than the shop.

**Nothing reachable only by hovering, scoped to what F-10 actually
measured.** The 43-of-86 figure is labelled *fields*, and all three of
`NumberField`, `SelectField` and `CheckField` in `Controls.tsx` already
funnel their explanation through one `title` prop — fixing the three fixes
every field built from them, all at once, rather than each of the roughly
116 call sites individually. `InfoTip` puts the same sentence behind a small
button beside the label, opened by click, Enter or Space, closed on blur,
with the native `title` left in place for a mouse. A handful of icon-only
buttons outside that pattern (the section plane's flip and close, adding a
cabinet) gained an `aria-label` alongside their `title` for the same reason.
Left alone: a button whose own visible text already carries its meaning,
where the `title` is a supplementary detail (a keyboard shortcut, why Export
is currently blocked) rather than the only explanation of what it does.

**What it cost, for the items that follow.** `ProjectResult` gained
`hardware: HardwareSummaryRow[]` (`export/hardware.ts`), computed from the
same hinge, handle, slide and joint requests `export/assembly.ts` already
turns into per-step lines — one row per kind (slides split further by
runner length, since that is a different SKU), each count read off an
oracle other than `hardwareSummary`'s own arithmetic in the tests that pin
it. `export/part.ts` factors the local-frame composition `PartView.tsx` had
inline into `partDrawing` / `exportPart`, shared by the on-screen drawing,
the download button and **At the machine**'s own step pictures, so there is
only one place a part's blank is ever drawn from. `AtMachine.tsx`'s
progress is `machineProgress` in the store — see ARCHITECTURE.md's own
section on it for the signature safeguard, and its note that
`activeMachineProgress` must be read through a `useMemo`, never passed to
`useStore` directly: it allocates a fresh object every call, which
`useSyncExternalStore` reads as a snapshot that never stops changing —
React error #185, caught only by driving the built app, exactly the failure
mode `CLAUDE.md`'s own verification step exists to catch before tests do.
`SheetView.tsx`'s per-sheet composition moved out to `sheetViews.ts` so the
export preview's thumbnails and the output pack's full cards share one
`useSheetViews` hook rather than two copies of the same `composeSheet` call.

**What review found.** Four things, caught before this landed:

- Making `.topbar` scroll horizontally rather than let a button run off a
  narrow screen — reasonable on its own — clipped the ☰ project menu's own
  dropdown along with it: CSS computes `overflow-y` as `auto` the instant
  `overflow-x` is anything but `visible`, and that dropdown is an absolutely
  positioned child meant to hang below the row. Open, Save, the design
  library and Reset would have been unreachable by mouse for every user, not
  only a narrow one. Dropped in favour of the media query alone, which
  already keeps the row's own content narrow enough not to need it at the
  widths this item targets.
- `cutListSignature` fingerprinted only `project.cutList`, so an edit that
  changed nothing but a face-frame stile's width — living in
  `stockCutList`, kept apart precisely so board feet never mix into a sheet
  count — left a checkmark ticked against a stock part that had, in truth,
  changed size underneath it. Worse: even for a sheet part, an id-only
  fingerprint cannot see a *resize* of an *existing* part at all, since a
  wider cabinet still calls its side `C1-B-SIDE-L`. Both closed by folding
  each row's own dimensions into the signature, not only its id, and by
  reading both lists.
- The single-part download button always wrote `safeNames: false`, so
  someone who turned safe layer names on for the full export — because
  their importer chokes on the dot in `POCKET_D6.35` — got the untranslated
  layer names back the moment they redownloaded one ruined panel. Now reads
  the same store setting the full export does.
- `partDrawing`'s own doc comment claimed it was "the same composition
  `composeSheet` does... minus the placement transform," which is not true
  of a flipped feature and was never tested against `composeSheet` at all —
  exactly the kind of claim this codebase does not get to make on trust.
  The comment now says what is actually shared (everything except which
  axis a face-B feature mirrors across, which is two different physical
  operations by design) and `part-export.test.ts` checks the shared part
  directly against `composeSheet`'s own output for a part that never needs
  turning.

---

### R-23 — Visual and interaction polish, and accessibility
`Milestone F` · `Depends on: R-16` · `Size: M`

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

**Revised while working it.** Three things the item as written did not settle:

- *"A light theme following the system preference, switchable"* reads as two
  mechanisms — a media query and a toggle — which is how it is normally built
  and how the two end up disagreeing. It is one: every colour is written
  `light-dark(light, dark)` under `color-scheme: light dark`, so the system
  preference is followed by the stylesheet itself with no JavaScript and no
  flash of the wrong theme on load, and the switch is a single `data-theme`
  attribute that changes which half applies. Neither palette can be edited
  without the other being read, which is also what makes the contrast test
  below possible without a browser.
- *"Contrast meets WCAG AA"* is two different thresholds, and the second is
  the one this interface was actually failing. Text at 4.5:1 was fine
  already; **the visible boundary of a control** (SC 1.4.11, 3:1) was not —
  `--line` measured 1.29–1.47:1 against the surfaces it sat on, so every
  input and button was identified by a border you could not see. That is now a second token,
  `--edge`, held to 3:1 on every surface, and the same 3:1 floor applies to
  the lines a sheet drawing is *read* from.
- *"Type and spacing scales used throughout"* stops at the type and the space.
  The size of a *named object* — a 76 px gallery tile, the 300 px inspector,
  the 44 px top bar — is not spacing and is left alone, partly because
  `docs/UX.md` measures the window's share against three of them and a scale
  would move those numbers for no reason.

**Acceptance criteria.**
- [x] Type and spacing scales defined once and used throughout
- [x] A light theme following the system preference, switchable
- [x] Every control reachable and operable from the keyboard, focus visible
- [x] An error boundary that keeps the design and offers to save it
- [x] Motion respects `prefers-reduced-motion`
- [x] Contrast meets WCAG AA in both themes

**Tests.** Keyboard navigation through the main flows, checked by hand in the
running app for now — the automated version waits for R-24's harness, held
back for the same reason R-14 itself was (see that item). An automated
contrast check over both palettes.

**What it cost, for the items that follow.** `styles.css` opens with the
system: eight type steps, eight space steps, five radii and one palette
written as `light-dark()` pairs, and every rule below spends those rather
than inventing a number. `apps/web/test/contrast.test.ts` parses that block
back out of the stylesheet and checks both halves — which is why
`vitest.config.ts` now sets `css: true`, without which a CSS import in a test
is replaced by an empty string and every assertion passes on nothing.
`apps/web/src/theme.ts` and the store's `theme` / `resolvedTheme` are only
the *override* and the one answer CSS cannot hand out: which half is in
force, for the 3D view, whose scene is three.js materials. Three colour sets
moved out of components and into the stylesheet — the DXF layers
(`drawing.tsx`), the measurement diagram (`MeasureWizard.tsx`) and the ground
a rendered picture sits on — so all three follow the theme and are checked by
that test; the plywood tones in `gallery/render.ts` deliberately did not,
because a cabinet is the colour of a cabinet in any light.
`apps/web/src/components/overlays.ts` is the new home for overlay keyboard
behaviour (`useDismissable`, `useDialog`), and `ErrorBoundary.tsx` wraps the
app in `main.tsx`.

**What the keyboard pass found.** Six things, none of them visible from
reading the code:

- **Escape did not close the measurement walkthrough** — the one dialog in
  the app you most want to back out of, and eleven readings deep by the time
  you want to. Its Escape listener was keyed on the `onClose` prop it was
  handed, and `RunInspector` hands it a fresh arrow function every render, so
  the listener was torn down and rebuilt on every render. The *global* Escape
  handler runs first on the same key press, and its store update re-renders
  the inspector during the event's own dispatch: by the time the event
  reached the walkthrough's listener the DOM had marked it removed, and its
  replacement had been added too late to be called. Both overlay hooks now
  register once and read the callback from a ref, which no re-render can
  catch out.
- **The cut list was mouse-only.** Its rows are `<tr onClick>`, which takes no
  focus and answers no key — so the only route to a part's drawing, and the
  only route to selecting a part at all outside the 3D view, needed a
  pointer. The id is a real button now.
- **Find-by-name landed on the wrong thing.** `useReveal` focuses the first
  `input, select, textarea, button` inside what it found, and an infotip's
  button belongs to the *label*, so it comes first in the DOM: searching
  *kickboard* put the keyboard on "What this does" rather than on the toe
  kick. True since the infotips landed in R-22.
- **The focus ring had been switched off.** `input:focus { outline: none }`
  left a keyboard user with no way to tell which of sixty fields had focus.
- **The 3D view could not be reached at all**, let alone orbited. It takes
  focus now: arrows step through its bays and panels — the run strip could
  already reach a bay, but nothing could reach a *panel* — shift and an arrow
  turns the model, and + and − zoom.
- **The printed pack kept the dark theme's brightness.** The print rules
  turned the sheet white and left the strokes orange, which is a 2.1:1
  cutting sheet on paper. Print now takes the light half of every colour and
  a white drawing ground, and the contrast test checks every layer against
  paper as well as against the screen.

**What review found.** Six more, every one confirmed in the running app rather
than argued from the diff:

- **The contrast test could pass by having nothing to check.** Its colour
  parser understands `#rgb`, `#rrggbb` and space-separated `rgb()`; anything
  else — `rgba()`, `#rrggbbaa`, `oklch()`, `color-mix()` — was *silently
  dropped from both palettes*, and the completeness check iterated only what
  had parsed, so a new colour in a syntax it did not know would sail through
  all thirteen assertions. Every declaration in `:root` is now either a
  colour it read or a named entry on the scales, and an unreadable one fails
  by name. A probe colour was added to prove that fires before it was
  removed.
- **The key the label advertises was the one key that did nothing.** `+` *is*
  Shift and `=` on most layouts, and the shift-orbits branch returned before
  the zoom keys were tested — so both `+` and `_` were dead while the
  aria-label and the overlay promised them.
- **Closing the showroom dropped focus at the top of the document.** The ☰
  menu unmounts the item you clicked before the modal it opened has mounted,
  so the dialog captured `document.body` as the thing to give focus back to —
  and `body` is connected, so the guard did not catch it. The menu now hands
  focus to the ☰ button on the way out, and `useDialog` refuses to focus
  `body` at all.
- **The resize separator reported its height against the wrong scale.** With
  `aria-valuenow` and `aria-valuemin` but no `aria-valuemax`, assistive
  technology measures against an implicit 100, reading a 340 px panel as far
  past the end of its range.
- **Every panel was extruded twice on load.** The theme effect fires on mount
  with the theme the engine was already built with, and `setTheme` rebuilt
  the scene unconditionally.
- **Reduce Motion was read once, at startup**, which contradicted `theme.ts`'s
  own claim that it is read when needed: turning it on mid-session left the
  camera coasting until the next reload. The viewport subscribes to the query
  now, as the CSS already effectively did.

Review also cleared two things worth recording: `var()` **does** substitute
into an SVG presentation attribute in Chromium, so the comments claiming
otherwise were wrong and are now accurate — the style declaration is used
because it is the form CSS guarantees, and `DiagnosticDiagram.tsx` was
converted so there is one convention rather than two. And a theme change does
not lose the explode offsets, the section cut or the highlight, because
`setScene` recomputes and reapplies all three.

---

### R-24 — Test the web app
`Milestone F` · `Depends on: R-02, R-23` · `Size: M`

**Problem.** `apps/web` still has no automated tests. R-14 named this gap back
in Milestone E and was deliberately left unworked there — see that item —
because the redesign this milestone carries out was always going to replace
the components R-14 would have tested. Building the safety net now, against
whatever shape the redesign actually shipped, means building it once instead
of twice.

**Goal.** Component tests for the panels the redesign landed — whatever R-17
named the inspector and the workshop-settings surface — plus a handful of
Playwright end-to-end tests over the flows that matter: change a parameter and
see the preview update, add an effect, export a zip. Also covers the automated
keyboard-navigation pass R-23 deferred to here, for the same reason.

**R-16 gave this item something concrete to pin.** The seven journeys in
[UX.md](UX.md) are already scripted walks with recorded interaction counts.
Landing them as Playwright tests that assert the counts is what stops R-17's
numbers rotting the first time somebody adds a control back.

---

## Milestone G — Release

### R-25 — 1.0 release
`Milestone G` · `Depends on: everything above` · `Size: S`

- [ ] Sample projects that load from the UI
- [ ] A getting-started guide from parameters to cut parts
- [x] Keyboard accessibility and a React error boundary — delivered by R-23
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

**Third revision.** R-14 turned out to be premature: Milestone F was already
going to dissolve the very component it would have tested (R-17 expects to
remove `ParamPanel.tsx` entirely), so testing today's sidebar first would have
meant testing it once and rewriting those tests again right after. Deferred to
a new R-24, sitting at the end of Milestone F once the redesign has a shape
worth testing, rather than worked twice. The release item moved to R-25 to
keep the numbering in reading order.

**Fourth revision.** R-16's research landed as [UX.md](UX.md), and the rest of
Milestone F was reconciled against it in place. Nothing was dropped; three
things moved and one thing changed meaning.

- **Find-by-name moved from R-19 to R-17**, and **click-a-bay-to-configure moved
  from R-20 to R-17**. Both turned out to be parts of the shell rather than
  things built on top of it: R-17 cannot claim "everything reachable by name"
  without the first, and the most-repeated journey does not improve without the
  second.
- **R-21 gained a defect as its headline.** The fix the app offers for the only
  blocking errors a fresh project has swaps them for a different blocking error
  whose hint contradicts the button. The item's first draft cited that button as
  the pattern to follow; it is the counter-example, and structured fixes now
  have to prove they raise no new error.
- **"Interaction counts measurably improved" stopped being the target for one
  journey.** Fitting a crooked room takes 21 interactions through the wizard and
  9 by hand, and the 9 is the one that silently accepts a guessed corner angle.
  The target there is no guessed angle at any count, even if that makes it
  longer. Measuring fewer things is not the same as measuring them faster.

The milestone preamble's measured figures were re-measured at the same time and
had grown — 129 sidebar controls rather than 80, 8.1 screens rather than 5.5 —
mostly through R-09's edge-banding matrix. The numeric-and-dropdown count is
unchanged at 66.
