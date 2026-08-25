> **Historical.** This is the plan written before 0.1 was built, kept for the
> reasoning behind the original decisions. It is **not** a description of the
> current system and parts of it are now out of date.
>
> For what exists today see [../ARCHITECTURE.md](../ARCHITECTURE.md); for what
> comes next see [../ROADMAP.md](../ROADMAP.md).

# CNC Cabinet Generator — Design & Implementation Plan

> Status: **approved, in progress**.
>
> Decisions taken: ship **both** `DADO_SCREW` and `TAB_SLOT` joinery; v1 interior is
> **shelves + vertical dividers**; **web app deployed to GitHub Pages**; tiling emits
> **one DXF per tile** with coordinates zeroed to the tile origin plus registration holes.

## 1. What we're building

A parametric cabinet designer that outputs **CNC-ready DXF files** for import into CAM
(Vectric VCarve/Aspire, Fusion 360, Carveco, Carbide Create, etc.), with a **live preview**.

v1 scope: **one cabinet type** — a stacked built-in unit matching the reference photos:
a deeper **base carcass** with a shallower **upper carcass** sitting directly on top of it,
rear faces flush, so the base's top panel forms a visible ledge/countertop at the front.
Doors and drawer fronts are deliberately **out of scope for v1** but the data model is
built so they drop in later without a rewrite.

### Research takeaways that shaped this

| Source | What I took from it |
|---|---|
| Aribabox DXF products | Sells per-project DXF packs; states minimum CNC bed size per product (e.g. "800 x 1200 mm and bigger"); assembly via **dowels, no screws**; 18 mm + 12 mm ply; small bit (3 mm). Confirms: bed-size gating and joint quality are the selling points. |
| CabinetPartsPro | "automatically calculates each cabinet component"; does **dado and rabbet joints, shelf holes, drawer-slide hardware**; nested optimisation the user can then hand-tweak; DXF + machine-specific output; explicitly *no* pretty 3D rendering. Feature set worth matching; UI worth avoiding. |
| 32 mm system (Wikipedia / trade sources) | 5 mm holes, 32 mm pitch, 12–14 mm deep, first row 37 mm from front edge. This is the standard for adjustable shelving — we implement it exactly. |
| Dogbone/T-bone references | Dogbone centred at √(R²/2) from the corner; relief radius ≥ **1.1 × tool radius** or joints won't seat. |
| Vectric forum / CabinetSense | CAM can pick **toolpath strategy and depth straight from the layer name**. Critical: **DXF R12 does not support lowercase layer names** — all layer names must be UPPERCASE. |
| Laguna / Vectric tiling docs | Feed-through tiling = registration holes drilled through waste into the spoilboard + dowel pins + a fence; material slides in one axis between tiles. Matches the "tiling in 1 direction" assumption. |

## 2. Architecture

npm workspaces monorepo, TypeScript end to end.

```
packages/core/            pure TS, ZERO runtime deps — all the real work
  model/       parameter schema, defaults, unit handling
  build/       parameters -> Part[]  (the parametric cabinet builder)
  joinery/     pluggable joint strategies (the heart of the project)
  geom/        Path/Arc primitives, bbox, dogbone & T-bone relief math
  nest/        MaxRects bin packing, per-material, grain-aware
  machine/     manufacturability checks + tiling calculation
  export/      DXF writer, SVG writer, CSV cut list, JSON project I/O
  __tests__/   vitest — geometry and joinery are unit-tested properly

apps/web/                 Vite + React + TypeScript + three.js
  live preview, parameter panel, diagnostics, export buttons
  builds to a static site -> GitHub Pages, no install, works offline

docs/                     joinery reference, DXF layer spec, this plan
```

**Why core is a separate zero-dep package:** the geometry is the valuable, long-lived part.
Keeping it UI-free means it is unit-testable, and a CLI / batch mode / different frontend can
reuse it untouched later.

**Why web and not a desktop app:** live preview is trivial, it runs on any OS with no install,
and it deploys to a URL you can open from the workshop tablet. Everything runs client-side —
no server, no upload of your designs.

## 3. The part model

Everything a CNC needs to know about a panel, and nothing it doesn't:

```ts
type Part = {
  id: string                // "BASE-SIDE-L"
  label: string             // human name, engraved/printed
  material: MaterialRef     // sheet + actual measured thickness
  outline: Path             // closed profile, includes toe-kick notches etc.
  features: Feature[]
  grainAxis: 'length' | 'width' | 'free'   // constrains nesting rotation
}

type Feature =
  | { kind:'pocket',  path: Path, depth: number, side: 'A'|'B' }   // dado, groove, rabbet, notch
  | { kind:'through', path: Path }                                 // slot / mortise / cutout
  | { kind:'drill',   x,y, dia, depth|'thru', side: 'A'|'B' }       // shelf pins, screws
  | { kind:'engrave', path: Path, side: 'A'|'B' }                  // part label
```

**Design rule enforced by the builder: every part should be machinable from ONE side.**
Flipping a panel is the main source of error and wasted time on a hobby machine. The
validator counts parts that need both faces machined and flags them. With the default
joinery, the answer is zero.

## 4. Joinery — the "smart joints" part

Pluggable strategies behind one interface, so new joints are additive:

```ts
interface JointStrategy {
  apply(male: PanelRef, female: PanelRef, spec: JointSpec, ctx: MachineCtx): void
}
```

### Shipping in v1

**A. `DADO_SCREW` (default)** — shelves/bottoms/tops/dividers land in a machined
groove in the mating panel. Sturdy, self-squaring, forgiving, and the CabinetPartsPro
standard.
- Groove width = **actual measured** panel thickness + `fitClearance` (default 0.15 mm).
- Groove depth default `t/3` (6 mm in 18 mm).
- **Stopped dados** by default (stop 10 mm short of the front edge) so nothing shows on the
  front edge — this is what the reference photos have. The mating panel gets its front
  corner **auto-notched** to clear the stop *plus the tool radius*, so it seats fully.
  A single `stopFront: 0` switches to a through dado.
- Optional screw clearance holes through the side panel into the shelf edge, on the same
  face as the dado (no flip).

**B. `TAB_SLOT`** — through mortise-and-tenon. Fully self-jigging, no fasteners needed,
great where you want the CNC to do the alignment work.
- Female slots get **dogbone or T-bone reliefs** at every inside corner (selectable).
- Male tab roots get matching relief so the shoulder seats flat.
- Relief radius = `max(1.1 × toolRadius, toolRadius + 0.2)`; dogbone centre offset √(R²/2).
- Tab count/width auto-derived from panel length, overridable.

**D. `BACK_GROOVE` / `BACK_RABBET`** — back panel captured in a groove set in from the rear
edge, or a rabbet at the rear edge (better for scribing to a wall). Both supported.

**E. `SHELF_PINS`** — full 32 mm system: 5 mm dia, 12 mm deep, 32 mm pitch, rows 37 mm from
front and rear edges, with configurable start/end height so you don't drill 60 useless holes.

### Deliberately not in v1 (interface is ready for them)
Dowels and Confirmat/Lamello need **edge boring** — impossible on a 3-axis flat-bed router
without a horizontal drilling unit. Adding them would be a lie about manufacturability.
Documented as such rather than silently shipped.

### The tolerance model — where "perfect" actually comes from
Every dimension that matters is a real, named, editable input, not a hard-coded guess:
`actualThickness` per material (your 18 mm ply is probably 17.4 mm), `toolDiameter`,
`fitClearance` per joint class, `reliefStyle`, `dadoDepthRatio`, `stopFront`.

## 5. Validation & diagnostics engine

Runs on every parameter change and feeds a live diagnostics panel:

- **Errors** (blocks a good result): pocket or slot narrower than the tool; part exceeds the
  machine envelope in the non-tiling axis; negative/zero derived dimension; feature outside
  the part outline; parts that won't fit on any configured sheet.
- **Warnings**: unrelieved inside corner; feature closer to an edge than the tool radius;
  dado deeper than half the panel thickness; shelf span likely to sag (span vs thickness
  rule of thumb); part needs machining on both faces; tiling required (with tile count).
- **Info**: sheet count and yield %, total cut length estimate, machine time ballpark.

Every diagnostic points at the specific part and parameter that caused it.

## 6. Machine size & tiling

Inputs: machine X, Y, Z travel; which axis feeds through (tiling axis); tile overlap.

1. Each part is test-fitted into the machine envelope in both orientations (respecting grain
   lock). If neither fits within the **fixed** axis, it is flagged **not manufacturable** —
   this is the required warning.
2. Sheet size is a separate, free input with presets (2440×1220, 2500×1250, custom, and
   **"= my machine"**). Setting it to 1000×1000 sidesteps tiling entirely — often the right
   answer on a 1 m machine, so the UI suggests it.
3. If a sheet is longer than the machine along the tiling axis, we compute
   `tiles = ceil(sheetLength / (machineLength − overlap))` and report it per sheet.
4. **Per-tile DXF export.** Each oversized sheet is also written as one DXF per tile, with
   coordinates zeroed to that tile's own origin so you can load and cut it directly. Geometry
   straddling a seam is clipped to the tile. Every tile carries `TILE_REG` registration dowel
   holes at identical positions in waste area, so the standard feed-through workflow applies:
   pin, cut, unpin, slide against the fence, re-pin, cut the next tile.

## 7. Nesting

MaxRects (Best-Area-Fit) over axis-aligned bounding boxes — every part here is rectangular,
so this is both optimal-in-practice and fast enough to run on every keystroke.
- One bin set per material (18 mm carcass ply, 12 mm back ply, … each nested separately).
- Part spacing = `toolDiameter + gap`; sheet edge margin configurable.
- Rotation only where `grainAxis === 'free'` — veneered ply face grain is respected.
- Results are deterministic, so the preview doesn't jump around while you drag a slider.

## 8. DXF output

Hand-written **R12 (AC1009)** writer — maximum CAM compatibility, no dependencies.
Arcs via POLYLINE bulge, drills as true-diameter CIRCLEs, labels as TEXT.
R2000/LWPOLYLINE output can be added behind a flag if anything complains.

**Layer convention — depth encoded in the name so CAM templates can auto-assign toolpaths**
(all UPPERCASE, required by R12):

| Layer | Meaning | Typical CAM toolpath |
|---|---|---|
| `OUTLINE` | part profile, through | Profile, outside, onion-skin/tabs |
| `THROUGH` | interior through cuts (slots) | Profile, inside |
| `POCKET_D6.0` | pocket to 6.0 mm — one layer per distinct depth | Pocket |
| `DRILL_5.0_D12.0` | 5 mm dia, 12 mm deep | Drill |
| `DRILL_5.0_THRU` | 5 mm dia, through | Drill |
| `LABEL` | part id text — reference, not machined | none |
| `SHEET` | sheet outline — reference | none |
| `TILE_GUIDE` / `TILE_REG` | optional tiling aids | Drill |

A **"safe layer names"** toggle replaces `.` with `P` (`POCKET_D6P0`) for fussy importers.

**Export set:** nested sheet DXFs (one per sheet), optional per-part DXFs, CSV cut list with
edge-banding lengths, a printable labelled parts sheet (SVG/PDF), and JSON project save/load.

## 9. Live preview

Three panes, switchable, all updating on every parameter change:
1. **3D assembly** (three.js) — parts as solids, exploded-view slider, per-part highlight.
   Grooves shown as visual insets; full CSG is not worth the frame budget.
2. **Nested sheets** — exactly what will be cut, colour-coded by operation, hover for part id.
3. **Part detail** — a single panel's true 2D geometry with dimensions, so you can sanity-check
   a joint before burning a sheet.

Selecting a diagnostic highlights the offending part in all three.

## 10. Cabinet parameters (v1)

**Global** — units (mm/in), materials list (name, sheet size, actual thickness), tool
diameter, joinery selection + tolerances, machine envelope.

**Base carcass** — width, height, depth; toe kick height + setback (integral notch cut into
the side panels, plus a face rail); back panel style; bay layout (N dividers, equal or
explicit widths); per-bay shelves (none / fixed count dadoed / adjustable pin rows).

**Upper carcass** — width (defaults to base), height, depth (`base depth − setback`, the
"extends a bit"); rear faces flush; same bay/shelf options; optional alignment
pockets tying it to the base's top panel.

**Reserved, not built yet** — doors (inset/overlay, hinge boring), drawers (box + slide
hardware), face frames, crown/scribe moulding.

## 11. Delivery plan

| # | Milestone | Contents |
|---|---|---|
| 1 | Skeleton | monorepo, TS config, vitest, CI, Pages deploy |
| 2 | Geometry core | Path/arc primitives, dogbone/T-bone, bbox, tests |
| 3 | Builder | parameters → Part[] for both carcasses, no joints yet |
| 4 | Joinery | DADO_SCREW + TAB_SLOT + BACK_GROOVE + SHELF_PINS, heavily tested |
| 5 | DXF + cut list | R12 writer, layer spec, CSV — first real cuttable output |
| 6 | Nesting + machine checks | MaxRects, tiling maths, diagnostics engine |
| 7 | Web UI | parameter panel, 3 preview panes, diagnostics, exports |
| 8 | Docs + verification | joinery reference, layer spec, README, end-to-end output check |

Each milestone is a commit on `claude/cabinet-cnc-generator-myvw1q` with tests passing.

## 12. Resolved decisions

| Question | Decision |
|---|---|
| Joinery in v1 | `DADO_SCREW` (default) **and** `TAB_SLOT`, user-selectable per unit |
| Interior scope | Shelves + vertical dividers. No doors, no drawers, no butt joint, no dowels |
| Stack | TypeScript web app, static build deployed to GitHub Pages |
| Tiling | Warnings **plus** per-tile DXF split with zeroed origins and registration holes |
