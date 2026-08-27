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
    │    Also emits the scribe strips that fit the run to a measured room.
    │
    ├─ applyJoinery()        joinery/index.ts
    │    joints → pockets, through cuts, notches, tabs, drilling
    │    Decides HOW each joint looks in the material.
    │
    ├─ applyHinges()         hardware/hinges.ts
    │    hardware boring on doors and the panels they hang from
    │
    ├─ applyEffects()        effects/index.ts
    │    decorative machining on chosen faces
    │
    ├─ materialise()         joinery/index.ts
    │    the finished outline for each blank, once every stage has had its say
    │
    ├─ nestParts()           nest/index.ts
    │    parts → sheets, one run per material
    │
    ├─ checkManufacturability()   machine/check.ts
    │    everything the user needs to know before cutting
    │
    └─ buildCutList()        export/cutlist.ts
```

`buildProject(params)` in `project.ts` runs the lot. `exportProject(project)`
turns the result into files.

It is pure and fast enough (single-digit milliseconds) that the UI re-runs the
whole thing on every keystroke. That is why the previews and the diagnostics can
never disagree with the parameters. **Keep it pure.** No I/O, no randomness, no
`Date.now()`, no mutation of the input.

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

Everything above the cabinet list is project-wide, because it describes the
workshop rather than the furniture: one spindle, one stack of sheets, one set of
grooves that all have to fit each other.

`model/opening.ts` holds the one thing above the cabinet list that is not the
workshop: the **opening**, meaning the room. It is project-wide because a run
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
box        // where it sits in the assembled cabinet
outline    // its flat blank, in local machining coordinates
features   // pockets, through cuts, drilling, engraving, in the same local frame
frame      // how those local coordinates map into the assembly
exposed    // the region of the blank still visible once assembled
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

## Extension points

Three registries, each designed so new entries are additive.

| To add | Write | Register in |
|---|---|---|
| A joint | a function taking (male, female, request, params) that pushes features | `joinery/index.ts`, the `useTabs` branch |
| A surface effect | an `EffectApplier` in `effects/` | `EFFECTS` and `EFFECT_LABELS` |
| Hardware | a boring function in `hardware/` | called from `applyJoinery` |

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

## Testing

Tests live in `packages/core/test`. The web app has none yet — see the roadmap.

`test/golden/default-0.1/` holds the sheet DXF the 0.1 default project exported,
before R-03 turned two hardcoded carcasses into a run of cabinets. `golden.test.ts`
regenerates and compares it byte for byte, so a refactor that quietly moves a
dimension cannot pass. Update those files only when a change to the geometry is
the point, and say so in the commit. **R-15** generalises this to more
configurations.

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

- frameless only; no face frames (**R-07**)
- no drawers, no hardware catalogue, no edge banding
- the web app has no automated tests
