# Architecture

How the generator is put together, what the invariants are, and where to add
things. Read this before changing anything in `packages/core`.

## The shape of it

```
packages/core/     zero runtime dependencies, no UI, no I/O
apps/web/          React + three.js front end, the only place with side effects
docs/              reference docs; this file, the roadmap, and the domain guides
```

`packages/core` has **no runtime dependencies at all**. That is deliberate: the
geometry is the long-lived part, it must be testable without scaffolding, and it
must stay reusable from a CLI or a different front end. Do not add a dependency
to it without a very good reason.

## The pipeline

One pure, synchronous function turns parameters into everything else:

```
ProjectParams
    │
    ├─ buildParts()          build/builder.ts
    │    parameters → placed panels + a list of what meets what
    │    Decides WHAT joins to WHAT. Never decides how it is machined.
    │    Also emits the scribe strips that fit the run to a measured room,
    │    and where every bay stands — see "Bays are volumes" below.
    │
    ├─ applyJoinery()        joinery/index.ts
    │    joints → pockets, through cuts, notches, tabs, drilling
    │    Decides HOW each joint looks in the material.
    │
    ├─ applyHinges()         hardware/hinges.ts
    │    cup, dowels and plate holes, to the catalogue entry the project
    │    selected. It only knows how to bore; whether the hinge suits the
    │    doors is decided in hardware/fit.ts, with the diagnostics.
    │
    ├─ applyHandles()        hardware/handles.ts
    │    clearance holes through a door for a pull, when one is chosen
    │
    ├─ applyEffects()        effects/index.ts
    │    decorative machining on chosen faces
    │
    ├─ materialise()         joinery/index.ts
    │    the finished outline for each blank, once every stage has had its say,
    │    shrunk on any banded edge to leave room for the tape
    │
    ├─ nestParts()           nest/index.ts
    │    parts → sheets, one run per material
    │
    ├─ checkManufacturability()   machine/check.ts
    │    everything the user needs to know before cutting
    │
    ├─ buildCutList()        export/cutlist.ts
    │
    └─ buildAssemblyPlan()   export/assembly.ts
         a step-by-step build order, derived from the joint graph rather
         than hand-authored — see "Assembly order" below — alongside
         buildLabelSheet() (export/labels.ts) for a printable label sheet
```

`buildProject(params)` in `project.ts` runs the lot. `exportProject(project)`
turns the result into files.

### Assembly order

`buildParts()` records each joint as a `JointRequest { maleId, femaleId, ... }`
— the mating panel that grows a tongue into a pocket, and the panel machined
with that pocket, named the way `dado.ts` and `tabslot.ts` already do, whatever
joinery style actually cuts it. `export/assembly.ts` topologically layers that
graph, female before male — a panel is scheduled once every panel it houses
into is already in place — and groups each layer by cabinet and carcass, so a
step never straddles two units and a run finishes one cabinet before starting
the next. Doors, drawer boxes and anything that never becomes a joint (an
adjustable shelf, a drawer face screwed on from inside its own box) are
layered in afterwards from the hinge, slide and handle requests the builder
also produced, so a cabinet with no doors gets no door steps without this
stage knowing that in advance. Scribe strips and wall fixing come last,
because both happen on site rather than at the bench.

It is pure and fast enough (single-digit milliseconds for a modest project)
that the UI re-runs the whole thing on every keystroke. **Keep it pure.** No
I/O, no randomness, no `Date.now()`, no mutation of the input — that purity is
also what makes it safe to run off the main thread, which the web app does
(R-12): `buildProject` runs in a worker, so a fifteen-cabinet kitchen never
blocks typing. The previews and diagnostics always catch up to the parameters,
but for the length of one build they can lag a build behind what is on screen;
`apps/web/src/store.ts` keeps the last finished result displayed while the next
one computes, and `apps/web/src/worker/projectWorkerClient.ts` coalesces a
burst of rapid changes to whichever params were current when the worker last
finished, rather than working through every intermediate value.

### Bays are volumes

A bay is the only level of the model that produces no part of its own, so
nothing downstream could point at one. `buildParts()` records a `BayVolume` per
opening — its clear interior, the panels bounding it, and every part built
inside it — from the same `layoutBays` call the dividers and shelves are placed
from. That is what the 3D view raycasts to select a bay (R-20), what maps a door
or a shelf back to the bay that decided it, and what a drag on a divider reads
its current widths off. Recomputing any of that outside the pipeline is exactly
how the thing you click drifts from the thing that gets cut.

The volume runs to the true underside of the top; `shelfRun` is the shorter band
a shelf can actually stand in. A hanging rail stands *inside* the bay rather
than shortening it, and a volume that stopped under the rail would leave the
space beside it belonging to nothing.

### Determinism

Nesting is deterministic: the same parameters always give the same layout. This
matters more than it sounds, because the sheet preview must not reshuffle itself
while a slider is being dragged. If you touch the packer, keep it deterministic.

## The project model

```
ProjectParams          materials, tooling, machine, joinery — the workshop
   ├─ OpeningSpec      the measured room the whole run has to fit into
   └─ Cabinet[]        one unit each, in the order they stand along the wall
        └─ Carcass[]   one box each, stacked from the floor up
             └─ BaySpec[]
```

Cabinets are laid along +X **in list order**, each starting where the one before
it ends and taking the width of the widest carcass in its stack. There is no
stored position: derived placement is what makes reordering the list mean
something, and makes it impossible to leave two units overlapping. `Cabinet.id`
and `Carcass.id` are the first two fields of every part ID it produces, so
`C1-B-SIDE-L` reads as *first cabinet, base carcass, left side*.

Within a cabinet, carcasses are flush at the rear — the depth of the one on the
floor is the datum — so a shallower box on top steps back at the front. Each one
either has its own bottom panel or stands in the top of the carcass below it,
and only the one actually on the floor can have a toe kick.

`model/types-library.ts` holds `CABINET_TYPES` — base, wall, tall/pantry and
stacked — as *presets*, not classes: each just seeds an ordinary `Cabinet` with
the fields every other cabinet uses. The builder has no branch on which type
produced a cabinet; a wall unit looks different only because its `CarcassSpec`
turns `toeKick` off and `hangingRail` on. Add a fifth type by writing another
preset, never by teaching `build/builder.ts` a new case.

`CarcassSpec.construction` is frameless or face-frame, the same per-carcass
granularity as `topStyle` or `back` — a stack can mix a face-framed base with
a frameless upper. `build/faceframe.ts` builds the stiles and rails and their
half-lap joints (see [JOINERY.md](JOINERY.md)); either construction style
produces a `FrontOpening` (`build/doors.ts`) that door layout consumes
without ever asking which one built it. See [DOORS.md](DOORS.md). A bay's
drawer stack (`build/drawers.ts`) consumes the same opening, sliced into one
smaller opening per drawer, so a drawer face is fitted and overlaid exactly
as a door would be — face-framed carcass included. See
[DRAWERS.md](DRAWERS.md).

Everything above the cabinet list is project-wide, because it describes the
workshop rather than the furniture: one spindle, one stack of sheets, one set of
grooves that all have to fit each other.

`ProjectParams.hardware` names the catalogue entries the run is cut to, by id,
plus any entries the project defines itself. **No hardware dimension lives on
the project.** A hinge's cup depth belongs to a make of hinge, and putting it on
the project would let two projects claim the same hardware and bore differently.
Entries are plain data — including their fitting rules, which are a short closed
list of measures rather than a predicate, because a rule has to survive being
written to a file and read back. See [HARDWARE.md](HARDWARE.md).

`model/opening.ts` holds the one thing above the cabinet list that is not the
workshop: the **opening**, meaning the room. `model/measure.ts` sits beside it
and turns tape readings into those fields — the corner angle is derived from a
triangle rather than asked for, because nobody can measure a room corner with a
protractor and a guessed angle is one the fillers get cut to. It is project-wide because a run
fits into one opening, and it is the only input that produces parts belonging to
the run rather than to a cabinet — the scribe strips at either end. The carcass
itself never changes shape for it; see [OPENING.md](OPENING.md) for why.

**Nothing in the pipeline may reach across cabinets.** A decision made from the
whole assembly rather than from one cabinet is a bug that only shows up once
there are two of them, and it shows up as plywood machined on the wrong face.
`applyEffects` computes a centroid **per cabinet** for exactly this reason.
`cabinets.test.ts` pins the invariant: two identical cabinets in a run come off
the machine as identical blanks.

## The part model

A `Part` lives in two worlds at once.

```ts
box          // where it sits in the assembled cabinet
outline      // its flat blank, in local machining coordinates
features     // pockets, through cuts, drilling, engraving, in the same local frame
frame        // how those local coordinates map into the assembly
exposed      // the region of the blank still visible once assembled
bandedEdges  // edges cut short for tape, resolved from ProjectParams.edgeBanding
```

Assembly space is **X = width, Y = depth (0 at the front), Z = height**.

### The local machining frame

Every part carries a `LocalFrame` — origin, `u`, `v`, `n` — fixed when the part
is built. Local `(u, v)` runs across face A; `n` is that face's outward normal
and the material lies along `-n`.

Two rules that are load-bearing:

**1. `(u, v, n)` is right-handed.** This is what makes a left and a right side
panel come out as a genuine mirrored pair, each machined from its own inner
face, rather than two parts of the same hand. There is a test for it
(`handedness` in `joinery.test.ts`) and it is not decoration.

**2. The frame is taken once and never re-derived.** Joinery grows a captured
panel's `box` into its grooves after the frame was taken. `frameOf(part)`
returns the stored frame precisely because re-deriving it from the enlarged box
moves the origin and silently offsets every feature by one dado depth. That bug
shipped once; `placement.test.ts` now guards it.

### Faces

`side: 'A' | 'B'` on a feature says which face it is machined from. Face A is
whichever face the part was built pointing at — usually, but not reliably, the
inside. Anything that needs "the face looking into the cabinet" should resolve
it geometrically, as `faceSideFor()` in `effects/index.ts` does.

A part with features on both faces has to be turned over on the bed. That is
tracked by `partsNeedingFlip()` and reported. `forcesFace()` decides what counts:
through cuts and engraved labels do not, because they can be done from either
side.

### The exposed region

A captured panel grows into its grooves, so its blank is bigger than the face
you see. `part.exposed` is the visible rectangle, and surface effects work
inside it. That is what stops beading being cut across a tongue that is buried
in a joint.

### Edge banding

The mirror image of growing into a joint: a banded edge is cut *short* by the
tape's own thickness, so gluing the tape on afterwards returns the part to its
designed size. Applied to the same working rectangle a notch or a tab is
placed against, in `materialise()`, so a stopped-dado notch on a banded edge
is still measured from where the tape's own face will be. `exposed` is left
alone — it describes the finished, banded panel, not today's substrate — and
so is anything bored from a part's frame, which is fixed at build time and
never reads the working rectangle at all. See
[JOINERY.md](JOINERY.md#not-a-joint-either-edge-banding).

## Extension points

Three registries, each designed so new entries are additive.

| To add | Write | Register in |
|---|---|---|
| A joint | a function taking (male, female, request, params) that pushes features | `joinery/index.ts`, dispatched on the request's `purpose` and `params.joinery.carcassJoint` |
| A surface effect | an `EffectApplier` in `effects/` | `EFFECTS` and `EFFECT_LABELS` |
| A make of hardware | a `HardwareEntry` — plain data | `CATALOGUE` in `hardware/catalogue.ts` |
| A new *kind* of hardware | a boring function in `hardware/` | called from `applyJoinery`, plus a row in `CARRIES` |
| A picture for a choice | a `Gallery` — a question, a view and options that shape a sample | `apps/web/src/gallery/choices.ts`, rendered by `<ChoiceGallery>` |

Effects are the cleanest of the three: an effect only ever *adds features*, so
the builder, the nester and the DXF writer need no changes at all. Prefer that
shape for anything new.

### Adding a joint

Joints get a `JointRequest` from the builder and decorate both panels. Reuse
`applyDado` where you can: it already handles growing the male panel into the
female, stopping the groove short of a visible edge, and notching the male to
clear both the stop and the radius the cutter leaves. Several features that look
nothing like a dado — a carcass standing in the top of the one below it, the
capped top lapping the sides — are implemented as ordinary dado joints with a
depth override, and get all of that behaviour for free.

## Geometry

Paths are vertices with an optional `bulge` — the DXF arc encoding, where
`bulge = tan(includedAngle / 4)`. Storing arcs that way means paths map 1:1 onto
DXF polylines with no lossy conversion at export.

- `bboxOf()` is **arc-exact**, solving for the arc extremes rather than
  tessellating. Nesting depends on it; tessellating under-reports and lets
  nested parts touch.
- `relieveCorners()` handles both directions: `corners: 'convex'` for a female
  feature where the path encloses the void, `'concave'` for a part outline where
  it encloses material. Tab roots need the concave case, and forgetting it holds
  the joint open by a tool radius.
- `buildOutline()` composes a rectangle with corner notches and edge tabs
  directly rather than running boolean operations. Everything this generator
  makes is a rectangle with local modifications, so this is both simpler and
  more robust.
- The one exception is the **taper**: one vertical edge cut back at one end, so
  a filler follows a wall that leans. It is deliberately that narrow rather
  than a general polygon, and every notch and tab asks for its x through the
  same helper, so a feature on a sloping edge lands on the slope. Widening it
  is what turns a robust composition into a boolean engine nobody asked for.

## Coordinates at export

| Space | Origin | Used by |
|---|---|---|
| Local | part's `frame.origin` | outline, features, effects |
| Sheet | bottom-left of the sheet, Y up | nesting, `composeSheet` |
| Tile | bottom-left of the tile | per-tile DXF |

`partTransform()` maps local to sheet: rotation and translation only, so bulges
carry over untouched. Face-B geometry is mirrored across the sheet at export and
lands on `_FLIP` layers, correct once the sheet is turned over left to right.

The sheet preview renders the very `DxfDrawing` the exporter writes. There is
deliberately no second rendering path, so what is on screen cannot drift from
what lands in the file. Keep it that way.

## Diagnostics

`checkManufacturability()` is the single place that decides what the user is
told. The contract:

- **error** — cannot be made as configured
- **warning** — can be made, but something will bite
- **info** — useful to know

Every diagnostic should name the part it is about (`partIds`, so the previews
can highlight it) and the parameter most likely to fix it (`hint`). Messages are
written as sentences a woodworker would say, not as error codes.

A diagnostic with a shape — a part too big for the machine, a sheet that needs
several setups, a shelf past its safe span — also carries `spatial`, a small
closed union set from the same numbers the sentence was built from. It exists
so the diagnostics panel can draw the problem (R-21) rather than only describe
it, without ever being able to draw something the message does not say —
`DiagnosticDiagram` in `apps/web` reads it and nothing else.

## The web app

`apps/web` is the bench: the cabinet is the surface and everything else floats
over it, appears because something is selected, or lives behind a door. The
argument for that shape, the alternative it was chosen over, and the measured
journeys it has to beat are all in [UX.md](UX.md); this is where the pieces are.

```
App.tsx                the shell: top bar, stage, run strip
components/RunStrip    a scale map of the run — cabinets, carcasses, bays
components/Inspector   what applies to the selection, and only that
components/WorkshopDrawer   the machine, tooling, sheets, tape and hardware
components/OutputPack  sheets, cut list, part drawings, labels, assembly steps
components/CommandPalette   find by name, over the trade's words as well as ours
components/DiagnosticsPanel a chip that docks a list along the bottom, grouped by topic, with verified fixes and a diagram where the problem has a shape
components/Showroom         what this tool can make, rendered, changing nothing
components/Explain          why there is a groove there, and a section through it
components/Suggestion       one quiet line about something that applies, once
components/ExportPreview    what is about to be produced, before the zip downloads — sheets, the shopping list, a beat before real material is committed
components/AtMachine        the workshop view: large type, one step at a time, meant to be read standing at the machine — see "At the machine" below
sheetViews.ts                one nested sheet's SVG, shared by the output pack and the export preview so neither can show something the other disagrees with
drag.ts                     what dragging a panel in the model would set
```

Four pieces carry the design:

**`selection.ts` — selection always resolves.** A `Selection` is the run, a
cabinet, a carcass, a bay or a part; nothing narrower selected means the run is
selected, so there is no empty inspector to design. `settleSelection` narrows
back up the hierarchy whenever the thing selected stops existing — undo past a
bay, remove a carcass, open a different project — so the inspector is never
pointed at an id nothing answers to.

**`catalog.ts` — every parameter, by name and by place.** One entry per
parameter: its dotted path into `ProjectParams`, the words a woodworker would
search for, and where it lives. It is what the command palette searches, and
what `apps/web/test/catalog.test.ts` walks the real parameters against in both
directions — every parameter must be claimed by an entry (or by an explicit
"not a control, because…"), and every entry's path must appear as a `param` on
a control in the source. A parameter that loses its control fails the build,
which is the only thing that would have caught the eight docs/UX.md found with
no control at all.

**`fixes.ts` — a fix is run before it is offered.** Each candidate's parameters
go through the whole pipeline; one that does not reduce the blocking errors is
not shown, and what it costs in sheets and yield is read off the same build and
put on the button. That is the answer to the worst thing R-16 found: the app's
own suggested fix traded two errors for a different blocking error.

**`workshop.ts` — the shop is a value, never a pointer.** A profile is the half
of `ProjectParams` that describes the workshop rather than the furniture, saved
under a name in the same browser store as the project library. Applying one is
an ordinary undoable parameter update that reports every material reference it
had to repoint. A project that silently re-cut itself to whoever opened it
would be the "silently producing a wrong cabinet" failure `CLAUDE.md` calls the
worst outcome available.

**`Viewport3D.tsx` — the model is the workspace, not a picture of it.** R-20
made the cabinet answer back. Three things live there, and none of them is a
second copy of a parameter:

*Bays are pickable* as the volumes the builder hands out, drawn back-face only
so a ray inside an opening comes out at its far wall — anything standing in the
bay is nearer and wins, and what is left is the empty space, which is what a bay
is. Selecting one opens that bay's controls in the inspector — the same card
that answers every other selection, still docked at its corner. It was briefly
moved to the click, on the reading that a bay's controls should open "in the
viewport"; in the running app a 300 px panel over the middle of the cabinet is
the one thing this architecture exists to prevent, so the card stays where the
hand already knows to look.

*Dividers and fixed shelves are draggable*, and `drag.ts` says what a drag would
set: the opening on the panel's low side, its limits, and the values worth
landing on exactly — an equal pair, the 32 mm module the box is bored on, a
round ten. A drag writes `bayWidths` or `shelfGaps` through the ordinary
`update`, so it is undoable, autosaved and identical to typing the number into
the field the panel keeps. Dragging is for deciding; typing is for committing.
The partner opening takes the *exact* remainder rather than a rounded one,
because half a millimetre out and every panel beyond the pair shifts.

*A section plane* clips the live assembly through
`renderer.localClippingEnabled`, so the dados, tongues and hinge cups inside the
panels are visible in place. Only the plane's border is grabbable: a sheet
spanning the whole run would sit between the pointer and every panel behind it.
Clipped materials are drawn double-sided, because a cut prism is an open shell
and would otherwise read as a hole. The bay volumes are clipped too but keep
their own `side` — overwriting it is what once made every shelf unpickable.

**`gallery/` — the pictures are generated, never drawn.** Every option with a
visible consequence is chosen from renders of what it produces (R-18). Nothing
in there is an icon:

```
gallery/choices.ts      every gallery, as a question and a set of options
gallery/samples.ts      the little projects the pictures are drawn from, cached
gallery/render.ts       ProjectResult -> SVG paths: axonometric, section, detail
gallery/Thumbnail.tsx   one picture
gallery/Gallery.tsx     the picker, the greyed-out reasons, and the cost line
gallery/starters.ts     five designs to start from, as furniture only
```

**`explain/` — the words are answerable to the docs.** R-18 made every *choice*
a picture; R-19 covers what is not a choice — the machining already on a panel,
and the capabilities somebody has no word for:

```
explain/topics.ts       every capability, as two sentences and a doc citation
explain/features.ts     a feature's `purpose` -> its topic, and where to cut
explain/suggestions.ts  capabilities offered where they plainly apply
```

Three rules make it hard to lie. Every topic names a heading in `docs/` **and
the phrases it leans on**, which `apps/web/test/explain.test.ts` reads back out
of that file — an explanation cannot outlive the behaviour it explains. No
dimension is written into a sentence; anything with a number in it reads that
number off the live project, so a sentence about a hinge cup follows the hinge
this project is cut for. And a topic that can recognise itself is asserted to
be present in the sample its own picture is drawn from.

`features.ts` is the other half: every feature already carries a `purpose` for
the layer grouping, so that is the key an explanation hangs off, and a purpose
with no topic fails a test rather than showing as a blank panel. It also picks
the plane to cut the *live* assembly on to show one feature — never along the
part's own face, never inside another panel where one is free, and across the
feature's longest run, because a groove sectioned along its length is a
rectangle.

`samples.ts` builds a small cabinet through `buildProject` — the real pipeline
— seeded with the *workshop* half of the live project, so a thumbnail shows
your sheet thickness, your cutter and your dado depth. `render.ts` turns the
result into SVG paths three ways: an axonometric view with back-facing prism
faces culled and the rest painter-sorted; a **section**, which reduces a plane
across an assembly axis to a line across each flat blank and walks it, taking
pockets, slots and hinge cups out of the material as it goes; and a zoomed
detail of one blank, for anything a few millimetres across. Two rules keep it
honest: the cache is keyed on the sample's own parameters, which is the only
key that cannot go stale, and a section left without a coordinate picks the
plane that crosses the most machining rather than one somebody measured once.

The section is what makes a capped top and an inset one distinguishable at all
— capping exists precisely so the seam does not show from outside. R-20 wants
the same rendering for its draggable section plane; this is where it lives.

**At the machine — a different mode, not a responsive reflow.** R-22's
workshop view is the cut list and the assembly guide again, but meant to be
read standing up: large type, one assembly step at a time, a part shown as a
picture rather than an id. It is a third door alongside the Workshop drawer
and the Output pack, not a variant of either — the Workshop drawer is the
*shop's* settings, this is the *job* in progress.

Progress — which step, which parts are ticked as cut — is `machineProgress`
in the store, persisted to `localStorage` the same way autosave is. What
makes it safe rather than merely convenient is `machineProgress.ts`'s
`cutListSignature`: a fingerprint of the current cut list's part ids. Part
ids are structural (`C1-B-SIDE-L`), not content-hashed, so the same id can
legitimately name a different blank in a different project, or the same
project after an edit resized it. `activeMachineProgress` in `store.ts`
compares the stored signature against the live one on every read and reads
a mismatch as a fresh job rather than misapplying someone else's
checkmarks — the paperwork equivalent of the silently wrong cabinet
`CLAUDE.md` calls this codebase's worst failure. It is a plain function, not
a store selector: a selector that allocates a new object every call is
exactly what `useSyncExternalStore` cannot tolerate, so call sites compute
it inside a `useMemo` instead.

**A part re-exported on its own.** `export/part.ts`'s `partDrawing` is what
`PartView.tsx` already drew on screen for the selected part, unchanged, so
the downloaded file and the picture cannot drift apart from each other. It
is not `composeSheet` reused, and deliberately cannot be: a face-B feature
there is mirrored across the whole *sheet*, because turning the sheet over
has to stay consistent with every other part nested on it, while a part
exported alone has no sheet — the operator turns over just this one blank,
across its own centre, which is a different axis in general. What the two
functions do share — the outline, through cuts, face-A features, and which
layer and `_FLIP` suffix a feature gets — `part-export.test.ts` checks
directly against `composeSheet`'s own output rather than trusting the two
implementations to agree by construction. See [DXF.md](DXF.md).

## Testing

Tests live in `packages/core/test`, with the web app's own in
`apps/web/test` — today the catalogue pair above. The end-to-end pass over the
journeys is R-24.

`test/golden/default-0.1/` holds the sheet DXF the 0.1 default project exported,
before R-03 turned two hardcoded carcasses into a run of cabinets. `golden.test.ts`
regenerates and compares it byte for byte, so a refactor that quietly moves a
dimension cannot pass. Update those files only when a change to the geometry is
the point, and say so in the commit.

`golden-fixtures.test.ts` generalises that promise beyond the one 0.1 case
(R-15). The 0.1 fixture is dado-jointed, frameless and square by construction,
so it is silent about everything since: `golden-fixtures.ts` lists a small,
deliberately varied set of configurations — tab-and-slot joinery, a face frame
with a drawer stack, and a rabbet back with banded doors under a crooked
opening — and the test compares every file `exportProject` produces for each
one, byte for byte and in order, against `test/golden/fixtures/<name>/`; a
generated `_files.txt` in each fixture's directory records that order, the
sequence a workshop sets sheets up in. A fixture with no committed directory
yet fails with the exact command to run rather than a bare diff. Update
deliberately with `UPDATE_GOLDEN=1 npm test -- golden-fixtures`, review the
diff under `test/golden/fixtures/` like any other change, and say in the
commit why the geometry moved.

The philosophy is to pin **behaviour that would be expensive to get wrong in
plywood**, not implementation details:

- exact construction values (the dogbone bulge is `tan(82.5°)`; the hinge cup
  centre is the boring distance plus the radius)
- invariants (mirrored pairs, parts landing on their boxes, no part straddling a
  tile seam it could have avoided)
- every diagnostic that exists, including the ones that say something is wrong

Several tests carry a comment explaining *why the failure matters*. Keep that
up: a test that pins a number without saying what breaks is a test the next
person will delete.

## Known gaps

Honest list, all tracked in [ROADMAP.md](ROADMAP.md):

- the web app has the catalogue, gallery, explanation and drag tests; no
  component or end-to-end coverage of the shell itself
- `joinery.reliefStyle` has no effect under stopped-dado joinery, which is the
  default: relief is applied to tab-and-slot slots and tab roots and nothing
  else. The control stays, because it decides everything the moment the joint
  changes, and the joinery section says so in a line rather than leaving it
  silent
