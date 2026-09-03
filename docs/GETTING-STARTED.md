# Getting started

From an empty browser to parts off the machine. Read this once with the app
open beside it; it is a walk, not a reference.

Everything runs in your browser. Nothing is uploaded, there is no account, and
the design lives in this browser until you save it to a file.

---

## Before you touch anything: two measurements

Two numbers decide whether the files this makes will cut. Get them first.

**Your sheet's real thickness, with calipers.** 18 mm birch ply is usually
17.4–17.8 mm, and every groove in the project is cut to the number you enter.
Measure the sheet you are actually going to cut, not the one you cut last time.

**Your machine's travels, in X and Y, and which axis the stock feeds through.**
The axis that does *not* feed never moves, so a sheet wider than that travel
cannot be cut at all — no amount of feeding rescues it. On a common hobby
machine with 1000 mm of cross travel and 1220 mm sheets, that is the first
thing the app will tell you, before you have changed anything.

Have your cutter diameter to hand too. It sets the corner radius every pocket
leaves, which is what the automatic notches and dogbones are sized against.

---

## 1. Open on a cabinet, not on a form

A new browser opens on five designs to start from — the reference unit, a run
of base units, a wall cabinet, a wardrobe and a bookcase — each shown as a
render of the project it loads. Pick one. Taking a finished cabinet apart is a
faster way to find out what this tool makes than reading about it, and each
tile says underneath what it is there to demonstrate.

They load the *furniture* only. Whatever this browser already knows about your
shop — your sheets, your cutter, your machine — is kept and applied over the
top, because choosing a different cabinet is not a reason to re-cut it to
somebody else's workshop.

The gallery is under **☰ → Start from a design…** afterwards, and **☰ → What
this can make…** is the showroom: every joint, panel, front and surface it can
cut, rendered on your own settings, changing nothing.

---

## 2. Tell it about your shop

**Workshop**, in the top bar. This is the shop rather than the cabinet: the
machine, the tooling, the sheets, the tape and the hardware. Everything here
is project-wide, because you have one spindle and one stack of sheets and they
all have to fit each other.

Enter, in this order:

1. **Machine** — travels in X and Y, and the feed-through axis.
2. **Sheets** — for each material, the real measured thickness from above, and
   the sheet sizes you can actually buy or already have. A *standard* size has
   no quantity: you can always order another. A *remnant* has a fixed count —
   however many are leaning against the wall — and gets spent first, smallest
   first, before a fresh sheet is opened.
3. **Tooling** — cutter diameter, and the fit clearance your test joints came
   out at.
4. **Hardware** — which hinge, which drawer slide, which shelf pin. Every
   dimension of the boring comes from the catalogue entry, so this is the one
   place that decides where a 35 mm cup lands.

Save it under a name with **Keep this workshop** and the next design starts
already knowing your machine. Applying a saved workshop later is an ordinary
undoable change, and it says out loud anything it had to repoint — a design
that quietly re-cut itself to whoever opened it is the worst thing this tool
could do.

---

## 3. Clear what is blocking

The chip in the top bar is the single answer to *can this be cut*. On a fresh
project with a small machine it says **2 blocking**, and neither is about your
design:

> 18 mm birch plywood: the 2440 x 1220 mm sheet is 1220 mm across the feed
> direction but the machine only has 1000 mm of travel there. Feeding the
> stock through cannot help, because that axis never moves.

Click the chip. The list opens along the bottom, grouped by topic, with
repeats collapsed, and above it the fixes — each one already run through the
whole pipeline before being offered, with what it costs in sheets and yield
written on the button. Press the first one. That is two interactions from a
blocked project to a cuttable one.

**Errors block, warnings do not.** An error means it cannot be made as
configured. A warning means it can be made but something will bite — a panel
that has to be turned over on the bed, a shelf near the limit of its span. Read
them; they name the part and the parameter that would fix it.

---

## 4. Make it yours

The cabinet fills the window and everything else floats over it.

- **The run strip** along the bottom is the project drawn out: a column per
  cabinet, a box per carcass, a cell per bay. Click any of them to work on it,
  drag a cabinet to slide it along the wall, `+` to add another.
- **The inspector** at the right shows what applies to whatever is selected,
  and only that. Nothing selected means the run is selected, which is the
  project itself.
- **Click the cabinet.** A panel selects itself and says what is machined into
  it and why. An empty bay selects too — that is how you put drawers in *that*
  bay rather than finding it by number.
- **Drag a divider or a fixed shelf** in the model to move it. It lands on the
  numbers worth landing on: an equal pair, the 32 mm module the box is bored
  on, a round ten. Dragging is for deciding; typing is for committing.
- **Choices are pictures.** How the boxes go together, how the top meets the
  sides, what fronts a bay — each is chosen by looking at what it produces,
  rendered on your own sheets. Hover an option to see it on your cabinet with
  what it costs underneath; click to keep it.
- **Find… (Ctrl/Cmd+K)** reaches every setting by name, including the words
  you would use at the bench: *kickboard* finds the toe kick, *rebate* the
  rabbet, *knock-down* tab and slot.

Everything is undoable — Ctrl/Cmd+Z — and the open project autosaves to this
browser as you work.

---

## 5. If it has to fit a real room

Skip this for a freestanding piece. For a run going into an alcove, turn on
**Fit to a measured opening** on the run, then **Measure the room…**.

It asks for tape readings one page at a time, with a sketch of each. It never
asks for the corner angle, because nobody can measure one: you mark the floor a
measured distance out along each wall, read the diagonal between the marks, and
the angle falls out of the triangle. Three readings that cannot be a triangle
are told so rather than turned into a confident wrong number.

The carcass stays square. The crookedness comes out as a scribe strip at each
end, tapered where the wall leans, with an allowance left on to plane back to
the plaster. A square opening the run already fills produces nothing at all.

---

## 6. Look at the pack before you commit material

**Output**, in the top bar: the sheet layouts, the cut list, a drawing of the
selected part, a label for every part, and the assembly steps — one printable
run. The assembly order is not hand-written; it falls out of the joint graph,
so a panel is only scheduled once everything it houses into is already there.

Then press **Export DXF**. It shows you what is about to be produced — every
sheet, the parts, the steps, and any warnings left — a beat before real
material is committed. Back out or download the zip.

---

## 7. What you get

| File | What it is |
|---|---|
| `<name>-sheet<N>.dxf` | One nested sheet, whole |
| `<name>-sheet<N>-tile<M>.dxf` | One tile, zeroed to its own origin |
| `<name>-cutlist.csv` | Every part with sizes, sheet and hole counts |

DXF is R12, the most widely readable flavour, with arcs carried on polyline
bulges. **The cut depth is in the layer name**, so your CAM can assign both
the strategy and the depth on import: `OUTLINE`, `THROUGH`, `POCKET_D6`,
`DRILL_5_D12`, `DRILL_4.5_THRU`. `LABEL` and `SHEET` are reference only — do
not machine them. If your importer dislikes decimal points, tick **safe layer
names** and `POCKET_D6.35` becomes `POCKET_D6P35`.

Full specification: [DXF.md](DXF.md).

---

## 8. At the machine

**At the machine** in the top bar is the same cut list and assembly guide in
large type, one step at a time, meant to be read standing up. Tick parts off as
they are cut; edit the design and it reads the changed cut list as a fresh job
rather than carrying yesterday's ticks onto today's panels.

Three things to know before the spindle starts:

**Set up by layer.** Import the DXF, assign a toolpath per layer, and take the
depth from the layer name. Nothing else in the file is machining.

**A part with `_FLIP` geometry gets turned over.** Its second-face features are
already mirrored for turning the sheet over left to right. Every part in the
default joinery is machinable from one face except a divider with shelves on
both sides, which genuinely cannot be — and that part is named in the
diagnostics.

**Tiles are cut in sequence, not all at once.** Each tile cuts a band one step
wide, where step = travel − overlap:

1. Cut tile 1. It drills the `TILE_REG` holes through the waste into your
   spoilboard.
2. Drop pins in those holes, keep the stock against a fence.
3. Pull the pins, slide the stock forward by one step, re-pin. The holes you
   just drilled land on the same pins.
4. Load the next tile and cut. Repeat.

The engraved id on each panel — `C1-B-SIDE-L` is the left side of the base
carcass of the first cabinet — means the pile off the machine sorts itself
against the label sheet.

---

## 9. Before you commit a full sheet

1. **Re-check the measured thickness.** It sets every groove width.
2. **Cut one test joint.** Tight, raise the fit clearance; sloppy, lower it.
   One offcut answers this and nothing else will.
3. **Check the chip is not saying *n blocking*.** *n to check* is fine and
   normal — a fresh project that has just been made cuttable says *6 to
   check*, and those six are warnings you have read and accepted. Only
   *blocking* stops the export, and only because the thing cannot be made.

## If you ruin a panel

Select it — in the model, or by its id in the cut list — and download that one
blank's DXF on its own. You do not have to re-cut a whole sheet to replace one
part.

---

## Where to read further

| | |
|---|---|
| [README](../README.md) | What it does, in full |
| [JOINERY](JOINERY.md) | Every joint, with the geometry and the reasoning |
| [DOORS](DOORS.md) | Doors, hinge boring, handles, face designs |
| [DRAWERS](DRAWERS.md) | Drawer boxes, undermount slides, the rear notch |
| [HARDWARE](HARDWARE.md) | The catalogue, and adding your own |
| [OPENING](OPENING.md) | Measuring a crooked room and scribing to it |
| [EFFECTS](EFFECTS.md) | Surface decoration |
| [DXF](DXF.md) | Output format, layers, tiling workflow |
