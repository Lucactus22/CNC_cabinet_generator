# Cabinet CNC Generator

Parametric cabinet designer that outputs **CNC-ready DXF** for import into CAM
(VCarve/Aspire, Fusion 360, Carveco, Carbide Create), with a live 3D preview,
sheet nesting, and manufacturability checks against your actual machine.

Everything runs in the browser. Nothing is uploaded; your designs never leave
your computer.

```bash
npm install
npm run dev      # http://localhost:5173
npm test
```

**Version 0.1.** One cabinet type, cutting real parts. See
[docs/ROADMAP.md](docs/ROADMAP.md) for the path to 1.0, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works inside.

## What it makes

One cabinet type, fully parametric: a **deeper base carcass with a shallower
upper carcass stacked directly on it**, rear faces flush against the wall so the
base's top panel forms a ledge at the front. Integral toe kick, vertical
dividers, and per-bay shelves that are either dadoed in place or sit on a 32 mm
shelf pin ladder.

The base's top panel is **capped** by default: it laps over the side panels
rather than sitting between them, so the finished ledge reads as one unbroken
surface with no joint line showing from above. The sides run up into shallow
dados in its underside — the face already being machined for the dividers and
the back, so capping costs no extra setup.

The upper carcass can also be built **without a bottom of its own**, standing
instead in shallow locating dados machined into the base's top panel. One less
panel, one less joint line, and gravity holds it while the glue goes off. The
cost is that the base's top panel is then machined on both faces, which the
diagnostics say plainly.

## Doors

Doors are switched on per bay: single hinged left or right, or a pair. Hardware
is **IKEA UTRUSTA** (Blum's pattern): a 35 mm cup with two 8 mm press-fit dowels
45 mm apart, sitting 9.5 mm behind the cup's centre line, plus mounting plate
holes on the 32 mm system in the carcass. Hinge count follows door height, and
the cup centre is derived from the boring distance plus the cup radius — the
number that ruins doors when it is guessed.

Overlay or inset fit, with an even reveal throughout the run.

Door faces take any surface effect: a **frame** groove for the shaker look in
the reference photographs, beadboard grooves, or plain. Hinge boring on the back
and a design on the front means a door is machined on both faces — the one part
where that is expected rather than avoided. See [docs/DOORS.md](docs/DOORS.md).

Drawers are not built yet. The part model and the joinery interface are shaped
to take them without a rewrite.

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

Plus back panels in a groove or rabbet, and 32 mm shelf pin ladders (5 mm holes,
12 mm deep, 32 mm pitch, rows 37 mm in from each edge).

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

### Nesting: fewest setups, or least material

**Fewest setups** (default) keeps every part inside a single machine tile and
fills the earliest tile first. Nothing is cut across a seam unless the part is
itself larger than the machine. **Least material** packs as tightly as it can
and lets parts fall where they will.

The number of setups follows how far the parts actually reach, not the blank's
nominal length, so a half-filled sheet only needs the setups that cover it.

On a typical cabinet the two come out at the same sheet count and the same
yield, and fewest-setups still removes every avoidable seam crossing. Where they
do diverge, it is a straight trade: a little more offcut for a little less time
at the machine. Neither makes any difference when nothing needs tiling.

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

## Before you cut

1. **Measure your sheet** with calipers and enter the real thickness. 18 mm ply
   is usually 17.4–17.8 mm, and every groove width is derived from it.
2. **Cut one test joint** before committing a full sheet. If it is tight, raise
   the fit clearance; if sloppy, lower it.
3. Check the diagnostics panel is not showing anything blocking.

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
| [JOINERY](docs/JOINERY.md) | Every joint, with the geometry and the reasoning |
| [DOORS](docs/DOORS.md) | Doors, UTRUSTA hinge boring, face designs |
| [EFFECTS](docs/EFFECTS.md) | Surface decoration and how to add a new kind |
| [DXF](docs/DXF.md) | Output format, layer convention, tiling workflow |
| [CLAUDE.md](CLAUDE.md) | Conventions and definition of done for contributors |

## Known gaps

Honest list, all tracked in the roadmap: `back.style: 'rabbet'` is offered and
does nothing (R-01); `units: 'in'` is in the model and never read (R-02); there
is one cabinet type and no drawers, hardware catalogue or edge banding; the web
app has no automated tests.

## Licence

None
