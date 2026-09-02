# UX — who this is for, and what the interface should be

The research and the argument behind Milestone F. Roadmap item R-16 produced
this; R-17 through R-24 execute it, and R-25 ships it.

This is a **decision document**. It records who the tool is for, what happens
when they try to use it, what is wrong in priority order, and one chosen
architecture with the alternative written down and rejected. Where it disagrees
with the roadmap's own design notes, this document wins and the roadmap item is
re-scoped in place — see [the reconciliation](#the-rest-of-the-roadmap-reconciled)
at the end.

Everything numeric here was measured in the running app on **2026-08-31**,
against commit `2647912`, in Chromium at 1440 × 900 unless another size is
named. [How to reproduce it](#how-this-was-measured) is at the end of the
measurements section so the next person can beat the numbers rather than argue
with them.

---

## Who this is for

### The woodworker who is going to cut it

One person, in two states, on the same afternoon.

**At the bench with a laptop**, they are *designing*. They already know what
they want to build — they can picture the cabinet, they know it goes in the
alcove by the window, they know roughly how wide. What they do not know is what
this tool can do, or what any of it is called here. They are not exploring
software; they are trying to get the thing in their head into a form the machine
can cut, and every minute spent decoding a field is a minute not spent building.

**At the machine with a tablet**, twenty minutes later, they are *cutting*.
Hands dirty, screen at arm's length, sheet already on the bed. They want one
thing: which file, which sheet, which way up. They will not type. They should
not have to.

The tool today serves the first state badly and the second one barely at all.

### What they know, and what they do not

They know **wood**. Rebate, kickboard, carcass, scribe, 32 mm system, "the door
sits proud" — the vocabulary of the trade is theirs, and the app mostly speaks
it well. `stopFrontAtY`, `exposed`, `capped`, `boringDistance`: the naming
convention in `CLAUDE.md` is doing real work and should not change.

They do not know **this tool's model**. That a "carcass" is a thing separate
from a "cabinet"; that a bay is addressed by number and counted left to right;
that the thing which decides whether a door can be fitted is a `FrontOpening`
produced by either construction style. None of that is on screen, and none of it
should need to be.

They also do not know **what is on offer**. Tab-and-slot joinery, surface
effects, a bottomless upper carcass, guillotine nesting for a panel saw, scribe
strips for a leaning wall — all real, all tested, all documented, and all
invisible unless you already know the word. Measured depths for each are in the
[discovery audit](#discovery-audit).

### Who it is not for

Worth stating, because it keeps the interface honest:

- **Not a CAD user.** Nobody here wants a tool palette, a constraint solver or
  layers. The roadmap already refuses G-code and curved work for the same
  reason: a tool that pretends to be general is worse than one that is narrow
  and correct.
- **Not a kitchen retailer.** No pricing, no catalogues of doors to buy, no
  customer-facing renders.
- **Not a first-time woodworker.** Someone who does not know what a dado is
  cannot be taught it by a cabinet configurator, and trying would produce the
  patronising wizard this milestone exists to avoid. The tool assumes trade
  knowledge and teaches only *its own* capabilities.

---

## The interface as measured today

The roadmap's Milestone F preamble records 15 groups, 80 controls and 4853 px.
Re-measured on today's build:

| | Measured | Roadmap said |
|---|---|---|
| Sidebar groups (top level) | **17** | 15 |
| Groups open at rest | **5** of 17 | — |
| Controls in the sidebar, default project, every group open | **129** — 41 number, 25 select, 40 checkbox, 4 text, 19 buttons | 80 |
| …of which numeric fields and dropdowns | **66** — 41 + 25 | 66 — 47 + 19 |
| Controls with every conditional branch switched on | **243** — 109 number, 39 select, 47 checkbox, 12 text, 36 buttons | — |
| Sidebar height, every group open | **6813 px = 8.1 screens** in an 844 px column | 4853 px |
| Sidebar height, every branch on | **11798 px = 14 screens** | — |
| Controls actually on screen at rest | **18** | — |
| Labelled fields carrying any explanation | **43 of 86** | — |
| Share of the window given to the cabinet | **42.7%** at 1440 × 900; **34.6%** at 1024 × 768 | ~40% |
| Share given to the diagnostics panel | **26.4%** | "a third" |
| Share given to the sidebar | **20.8%** | — |
| Diagnostics entries on a fresh project | **14** — 2 error, 5 warning, 7 info | — |
| Growth per extra cabinet in the run | **+143 px, +5 controls** | — |

**The two counts agree where it matters and diverge where the interface grew.**
Numeric fields plus dropdowns come to 66 both times. The gap between 80 and 129
is almost entirely the edge-banding matrix that R-09 added — 24 unlabelled
checkbox pills, six part roles by four edges — plus the buttons, which the
earlier count evidently excluded and which this one includes because a button
that changes the design is a control.

Three of those numbers deserve to be read twice:

**The diagnostics panel gets more of the window than the sidebar does.** 26.4%
against 20.8%. On a fresh project it is showing two blocking errors about
machine travel, four tiling warnings that differ only in the sheet number, and
four "spans more than one tile" notes that differ only in the part — before the
user has designed anything.

**Eighteen controls are on screen at rest**, out of the 129 the sidebar holds —
39 of them rendered, the rest behind a closed group — and the column is 8.1
screens tall with everything open. Not because it hides things well: because
almost everything is either below the fold or behind a group nothing on screen
names.

**The sidebar barely grows with the run** — +143 px per cabinet, because
`CabinetList` and `CarcassGroups` already show only the *selected* cabinet's
carcasses. That matters more than it looks: **the app already contains the
answer, implemented at one level only.** Cabinet selection narrows the panel and
works. Part selection, in the 3D view, narrows nothing. The whole of R-17 is
finishing a mechanism that is already half built.

### How this was measured

Driven with Playwright against `vite preview` on the production build, starting
from a cleared `localStorage` so no autosave leaks between runs:

```bash
cd apps/web && npx vite build && npx vite preview --port 4173 --strictPort
```

- **Controls** counts every `input`, `select`, `textarea` and `button` inside
  `.sidebar`, with every `details.group` forced open. "Every branch on" seeds
  `cabgen:autosave` with a project that has the opening enabled, tab-and-slot
  joinery, screw holes, a remnant sheet size, two surface effects, banding on
  the doors, face-frame construction, toe kick, hanging rail, a divider, a
  fixed-shelf bay, a drawer bay, a bottomless upper carcass, and all four
  hardware editors open. That seed is run through `buildProject` first, so a
  malformed one cannot quietly be normalised back to the default and counted as
  if it were the ceiling. Two branches only exist together: a project with a
  drawer bay puts `drawer-face` into the banding matrix's roles, taking it from
  24 pills to 28.
- **On screen at rest** counts controls whose rect intersects the viewport,
  with the app in its default state.
- **An interaction**, in the journeys below, is one discrete input act: a click,
  or one field given a value. Scrolling is counted separately, in gestures and
  in pixels, because it is continuous and because it is the cost the sidebar's
  height imposes.
- **Seconds** is wall clock from the first act to the last, with the script
  driving. It reads nothing, hesitates nowhere and hunts for nothing, so it is a
  hard floor on time-on-task and no substitute for watching a person. It is here
  because a journey whose *floor* is eight seconds tells you something about the
  one that is not.
- Each journey walks the **shortest route that actually exists**, taken by
  someone who already knows where everything is. A newcomer does worse. These
  are floors, not averages.
- The **growth per cabinet** figure holds with the first cabinet selected. In
  use, `CabinetList.add` selects the cabinet it just added, which swaps one
  cabinet's carcass groups for another's — so the column changes by more than
  the row, in both directions, depending on what you were looking at.

---

## The seven journeys, walked

Summary first. **This table is the baseline R-17 has to beat.**

| Journey | Interactions | Scroll | Floor | Completes? |
|---|---|---|---|---|
| J1 Build the thing in my head | **11** | 3 gestures, 1880 px | 8.5 s | Yes, with 2 errors and 11 warnings |
| J2 Find out what this can do | **6** | 3 gestures, 2682 px | 4.9 s | Only if you knew the words |
| J3 Fit it to a real room — wizard | **21** | 1 gesture, 1016 px | 8.5 s | Yes |
| J3 Fit it to a real room — by hand | **9** | — | — | Yes, with two guessed angles |
| J4 Change my mind about one bay | **5** | 1 gesture, 664 px | 3.9 s | Yes |
| J5 Choose how it goes together | **3** | 1 gesture, 1133 px | 2.1 s | Choice made, cost invisible |
| J6 Take it to the machine | **2 → dead end**, 3 on the route that works | 2 gestures, 1804 px | 0.8 s | Only off the beaten path |
| J7 Re-cut one part I ruined | **2** | — | 0.8 s | **No** |

*Floor* is the script's own wall clock, defined in the method above: the time a
route takes when nobody has to think. A person adds the reading, the hunting and
the deciding to every one of these.

### J1 — Build the thing in my head

*Target: a single base unit, 1200 × 750 × 650, three bays — three drawers on the
left, adjustable shelves behind a pair of doors in the middle, an open bay on
the right — and no box on top.*

The target is deliberately **not** the shipped default with one number changed.
`defaultBaseCarcass()` is already 900 × 900 × 600 with one divider and a
right-hung door on bay 2, so a target close to it measures the quality of the
defaults rather than the interface. Anything a person pictures before opening
the app will differ from the default in most of its numbers; this one does.

**Eleven interactions, 1880 px of scrolling, an 8.5 s floor.** Width, height,
depth and dividers in the `C1-B · Base` group (open at rest), then the bay
controls 1076 px further down, then open `C1-T · Upper` and press Remove
carcass. Bay 3 costs nothing, because a bay a divider brings into existence
defaults to open with no door, which is what was wanted.

Where the user has to guess:

- **"Dividers: 2"** is how you get three bays. Nothing says a divider makes a
  bay, and the bay controls only appear after you have typed it.
- **Bays are numbered, not pointed at.** "Bay 1" is the left one. You find that
  out by changing it and watching the model.
- **"Bay 1: drawers" is a checkbox, and "Bay 1" is a dropdown**, sitting one
  above the other, controlling mutually exclusive things.
- **Removing the upper carcass** means opening a group named `C1-T · Upper` and
  pressing a button at the bottom of its 802 px of controls.

The end state is the right cabinet — `1200 × 750 mm · 30 parts · 4 sheets` — two
blocking errors, and **eleven warnings, six of them the same sentence**: one per
drawer side, saying the 11.9 mm box material is under the 12 mm the default Blum
slide needs. The diagnostic offers two fixes — *"change the drawer box material,
or pick a drawer slide made for it"* — of which one is 4569 px away in a closed
group and **the other has no control in the app at all**. See F-3.

### J2 — Find out what this can do

Six interactions to reach the three capabilities the roadmap names — and the
count is meaningless, because it assumes you already know all three exist. The
honest measurement is where they live:

- **Tab-and-slot joinery**: a dropdown 3550 px down, inside a group that is
  closed at rest, with **no explanation on the control at all** — the "Corner
  relief" field beneath it has a tooltip; the joint that decides whether your
  cabinet needs screws does not.
- **Surface effects**: an "Add effect" button 5224 px down, in a closed group.
  What effects exist — grooves for beadboard, a frame for a shaker line — is
  invisible until you press it.
- **The bottomless upper carcass**: a "Bottom panel" dropdown 1601 px down,
  which only renders at all when a carcass is stacked on another.

Twelve of the 17 groups are closed at rest, and a closed group renders nothing —
its summary is a two-word heading and its 20-odd controls do not exist on the
page. So the only thing naming any of these capabilities is a word like
"Joinery", and the only route to them is opening every group in turn and
reading. **The measured answer to "how does somebody find a feature they do not
know exists" is: they open all seventeen groups, or they do not.**

### J3 — Fit it to a real room

Two routes, and the interesting thing is that the good one is longer.

**Via "Measure the room…": 21 interactions, 8.5 s floor.** Eight pages: eleven
numbers off a tape — two widths, two heights, two corner triangles of three legs
each, and the wall bow — and ten presses to move between them. The wizard
derives both corner angles from a triangle rather than asking for a protractor
reading, which is the whole reason it exists, and `MeasureWizard` earns the
exception the roadmap grants it.

**By hand in the Opening group: 9 interactions.** Twelve cheaper — and it
accepts two corner angles typed as degrees, defaulting to 90. `OPENING.md` and
`model/measure.ts` exist because **a guessed corner angle is one the fillers get
cut to**. The fast route is the one that silently produces wrong parts.

The app is not silent about this, and the document nearly was: the corner-angle
field's tooltip reads *"Easier measured than guessed: use 'Measure the room…'."*
That is exactly the right sentence. It is also a hover tooltip on the field you
are already typing into, which is not a guard — nothing stops the value being
typed, nothing marks the result as guessed, and the wizard clears the stored
triangle the moment you do (correctly — the triangle would then be a record of
something that is no longer in use). The wizard's own escape hatch, *"I have an
angle finder"*, does the same thing deliberately. So the friction is not the
count and not the absence of advice: it is that the interface treats a measured
angle and a guessed one as the same number afterwards.

One small thing the walk turned up: the button that opens the wizard is
labelled *"Six measurements, about ten minutes."* It asks for eleven numbers
across eight pages.

### J4 — Change my mind about one bay

Five interactions, and the first two are wasted.

Someone who wants drawers in *that* bay points at it. Clicking the panel in the
3D view isolates it and ghosts everything else — which is a good interaction
that answers a different question. The sidebar's response to that click,
measured, is **fourteen characters**: one button's label changes from "Add
effect" to "Add effect to C1-B-DIV-1", 5224 px down the column. Nothing else in
the interface reacts.

So the click has to be undone (click the background), and then the real route is
the same one as J1: find the carcass group, find the bay by number, tick a
checkbox, press "Add a drawer" twice.

### J5 — Choose how it goes together

Three interactions to change the joint. Zero to find out what it cost.

Switching from a stopped dado to tab and slot leaves the topbar badge identical:
`900 × 2000 mm · 21 parts · 4 sheets` before and after. Same parts, same sheets.
The differences that matter — no screws needed, joints visible on the outside,
more machining time, a different failure mode if the fit clearance is wrong —
appear nowhere. To see anything at all you switch to the Parts tab and look at
an outline, and even then you are comparing it against a memory.

`JOINERY.md` explains the trade in two paragraphs. Nothing in the app does.

### J6 — Take it to the machine

**The app's own suggested fix makes things worse.** This is the single worst
thing found.

A fresh project has two blocking errors, and they are not about the design:

> 18 mm birch plywood: the 2440 × 1220 mm sheet is 1220 mm across the feed
> direction but the machine only has 1000 mm of travel there.
> *Rip the sheets to 1000 mm or less first, or set the sheet size to match your
> machine.*

The Material group offers a button for exactly the second half of that sentence:
**Set sheets to machine size**. Press it, and:

| | Errors | Warnings | Total | Export |
|---|---|---|---|---|
| At rest | 2 | 5 | 14 | blocked |
| After the button | **1** | 1 | 11 | **still blocked** |

The two errors become one different error — *"4 part(s) will not fit on any
sheet size this material offers"* — whose hint reads *"Add a larger sheet size,
or reduce the cabinet size."* The default cabinet has 1100 mm parts and the
machine bed is 1000 mm square, so shrinking the sheet to the bed makes four
parts unnestable. The hint now contradicts the button that was just pressed, and
the user is one undo away from where they started with less idea what to do.

The route that works is the *first* half of the sentence, which nothing offers:
type 1000 into the "Width" field of each of the two sheet materials. Three
interactions, and it requires knowing that "Width" is the cross-feed dimension,
that there are two materials, and that the button is a trap on this project.

| | Errors | Export |
|---|---|---|
| Open the Material group | 2 | blocked |
| Width → 1000 on the 18 mm | 1 | blocked |
| Width → 1000 on the 12 mm | **0** | **allowed** |

**And it is not free.** Ripping both materials to 1000 takes the job from 4
sheets at 71% yield to **6 sheets at 58%**, and from 14 diagnostics to 17. That
matters for R-21: neither route the app offers is good. One ends in a
contradiction and the other quietly costs two sheets, and nothing on screen
says so at the moment of pressing.

### J7 — Re-cut one part I ruined

Two interactions to *look at* the part: Parts tab, click its row. Then nothing.

There is no per-part export. The only route to that one blank is the whole
project zip, then finding the panel inside a sheet DXF and extracting it in
another program. For the most common workshop accident there is, that is a hole.

The Parts tab is also where the diagnostics panel does the most damage.
Measured on arrival: the part drawing is 342 px — capped at `38vh` — inside a
494 px slot, and **2 of the 21 table rows are visible**. Choosing a part means
scrolling the table, and the drawing you came to look at drops to 99 px by row
4 and to **zero** by row 15. You cannot see a part and pick a part at the same
time, because a permanent 306 px of tiling warnings is holding the space that
would let you.

---

## Friction, in priority order

Ordered by cost × frequency. Each names the journey it came from and, where
possible, the number that proves it. One finding did not come from a journey and
so is not in the table: the interface is **dark only**, in a tool used in
daylight and under workshop lights, and no walk in a browser would ever surface
that. It is already R-23's, unchanged.

| # | Friction | From | Owner |
|---|---|---|---|
| **F-1** | The suggested fix for a fresh project's only blocking errors trades them for a different blocking error whose hint contradicts it. Export stays disabled either way. | J6 | R-21 |
| **F-2** | A fresh project cannot be exported, for two reasons that are about the machine rather than anything the user did. First screen, every time. | J6 | R-17, R-21 |
| **F-3** | **Eight parameters have no control anywhere in the app**, and one diagnostic's hint names one of them: adding drawers warns that the box material is too thin for the slide, and there is no way to change the box material. | J1 | R-17 |
| **F-4** | Selection drives nothing. Clicking a panel changes 14 characters of the sidebar, 5224 px down. | J4 | R-17, R-20 |
| **F-5** | 8.1 screens of controls (11 with every branch on) in a 320 px column; 18 on screen at rest; 664–2682 px of scrolling per journey. | all | R-17 |
| **F-6** | Capabilities are unreachable without knowing their name: tab-and-slot 3550 px down with no explanation, effects 5224 px, guillotine nesting 6538 px, and 12 of 17 groups closed at rest render nothing at all. | J2 | R-18, R-19 |
| **F-7** | Workshop settings are half the sidebar (3403 px of 6813; 2773 px, 41%, if edge banding is counted as design) and interleaved with it. | J1, J6 | R-17 |
| **F-8** | The diagnostics panel takes 26.4% of the window on every tab including the Build guide, and repeats itself: 4 near-identical tiling warnings and 4 near-identical tile-span notes out of 14 entries. | J6 | R-21 |
| **F-9** | The cost of a construction choice is invisible: dado → tab and slot changes nothing on screen. | J5 | R-18 |
| **F-10** | Half the labelled fields (43 of 86) carry no explanation, and the explanation that exists is a hover tooltip — which does not exist on a tablet. | J1, J2 | R-18, R-22 |
| **F-11** | No way to get one part's geometry. | J7 | R-22 |
| **F-12** | The corner angle can be typed and defaults to 90, and the by-hand route is 12 interactions cheaper than the wizard that exists because the angle cannot be guessed. | J3 | R-17, R-19 |
| **F-13** | On the Parts tab you cannot see a part and choose one at once: 2 of 21 rows visible with the drawing at 342 px, and the drawing at 0 px by the time row 15 is reachable. | J7 | R-21 |

**On F-3**, because it is new and it changes what R-17 has to promise. Diffing
the field names in `model/types.ts` against everything `apps/web/src` mentions
leaves ten never referenced. Four are not parameters: `exposed`, `grainAxis` and
`normalAxis` are derived properties of a `Part`, and `nominalThickness` is
deliberately not editable because the point of `actualThickness` is that you
measure the sheet in front of you. That leaves six. A name diff cannot find the
other two, because the bare name `materialId` *is* referenced — for banding, the
scribe strip and the face frame — so the doors' and the backs' were found by
reading the Doors group (`fit`, `reveal`) and the carcass's back controls
(`style`, `inset`) and seeing what is not there. **Eight real parameters with no
control at all:**

| Parameter | What it decides |
|---|---|
| `carcassMaterialId` | which sheet the boxes are cut from |
| `shelfMaterialId` | which sheet the shelves are cut from |
| `drawerBoxMaterialId` | which sheet the drawer boxes are cut from |
| `doors.materialId` | which sheet the doors are cut from |
| `Carcass.back.materialId` | which sheet the backs are cut from |
| `Carcass.bayWidths` | bays of unequal width |
| `joinery.shelfPin.startAbove` | where the pin ladder starts |
| `joinery.shelfPin.endBelow` | where it stops |

`drawerBoxMaterialId` is why J1's six warnings are a dead end.
`checkManufacturability` says *"Change the drawer box material, or pick a drawer
slide made for it"* — the right sentence, naming the parameter that fixes it
exactly as `ARCHITECTURE.md` requires. Half of it is not actionable in this
interface. R-17's "every parameter still reachable" therefore starts from a
baseline that already fails, and the criterion has to mean *reach these eight as
well*, not *keep today's controls*.

---

## The architectural questions

The seven questions R-16 was asked to answer, each with what was considered and
why the answer is what it is.

### 1. Is a persistent sidebar right at all?

**No — but a pure contextual inspector is not right either. Keep a persistent
spine, make it a picture, and put everything else on the selection.**

Considered:

- **(a) Keep the sidebar, reorder and widen it.** Cheapest. Eases F-5 and
  nothing else. Rejected: it leaves the model inert and the discovery problem
  untouched.
- **(b) Contextual inspector only.** Everything appears because something is
  selected. Rejected on its own: it has no home for "add a cabinet", no way to
  see a cabinet hidden behind another in the 3D view, and it makes "what is this
  project" unanswerable at a glance.
- **(c) A short persistent spine plus a contextual inspector.** Chosen.

The "what happens when nothing is selected" problem dissolves if **selection
always resolves to something**: no narrower selection means the run is selected,
and the run has plenty to show — its name, its opening, its cabinets. There is
no empty state to design because there is no empty state.

### 2. Where does the project's structure live?

**In a scale elevation of the run, along the bottom of the model. Not a tree.**

The structure is not really a tree. It is three nested *linear orders* that each
correspond to a direction in the room: cabinets left to right along the wall,
carcasses bottom to top up the stack, bays left to right across the front.
`ARCHITECTURE.md` is explicit that cabinets have no stored position because
derived placement is what makes reordering the list mean something — so the list
*is* the wall.

A generic tree widget would redraw that hierarchy in a form that has less
information than the model already on screen, and would teach a vocabulary
("carcass") the user does not need. Rejected.

The **run strip** is the same list drawn to scale: one column per cabinet, boxes
for its carcasses, widths proportional, click to select, drag to reorder — which
is literally sliding a unit along the wall. It is the structure panel and a
picture of the run at once, which is principle 2 applied to navigation.

Breadcrumbs come free at the top of the inspector — `Run › C1 Stacked unit ›
Base › Bay 2` — and give the route back up the hierarchy without hunting.

### 3. Should workshop settings leave the design surface entirely?

**Yes. They are half the sidebar and they are somebody's machine, not somebody's
cabinet.**

Measured, by group height: Material 800 px, Hardware 1048, Edge banding 630,
Machine 278, Nesting 276, Solid stock 246, Tooling 125 — **3403 px of 6813,
almost exactly half**, before counting the hardware editors that open on demand.
Take edge banding out on the argument below and it is still 2773 px, 41%.

They become a **workshop profile**: named, saved in the same browser store the
project library already uses, applied to a project as an ordinary undoable
parameter update.

One thing this must *not* become is a live reference. A project file has to keep
its own full parameters, exactly as it does now — the measured thickness of the
sheet a design was cut to changes every groove in it, and a project that silently
re-cuts itself to whoever opened it is the "silently producing a wrong cabinet"
failure `CLAUDE.md` calls the worst outcome available. So: **the profile is
something you apply, loudly and undoably, never something a project points at.**
The core stays pure and `ProjectParams` keeps its current shape.

Edge banding splits: *which* edges get tape is design and belongs to the panel
you selected; the tape's measured thickness is workshop.

**What this does not solve, and should be said out loud:** the project library
is `localStorage`, so it is per-browser and per-device. A profile kept beside it
inherits that. The persona at the top of this document walks from a laptop at
the bench to a tablet at the machine, and nothing in this architecture carries
either a project or a profile across that gap — today the answer is Save, then
move the JSON yourself. That is not a reason to put the profile somewhere else;
it is the same limit the project already has, and it belongs to whichever item
takes the tablet seriously (R-22), with a link-shaped answer already sitting in
[feature_suggestions.md](feature_suggestions.md). Naming it here so R-17 does not
promise "reusable across projects" and quietly mean "on this laptop".

### 4. Are Assembly / Sheets / Parts three views, or three phases?

**Two surfaces, not three views. And the Build guide is not a fourth tab.**

Considered:

- **(a) Keep four peer tabs.** The status quo. Rejected because it makes the
  cabinet one view among four, which is what licenses giving it 42.7% of the
  window.
- **(b) Three enforced phases.** Rejected as architecture C below: real use is a
  loop, not a progression.
- **(c) Split by *when you are standing at the machine*.** Chosen. Everything
  you touch while designing is one surface; everything you print, carry or read
  with a panel in your hands is the other.
- **(d) One surface, no split at all** — sheets and cut list as panels over the
  model. Rejected: the output pack has to be printable and readable at arm's
  length, and a floating panel over a 3D scene is neither.

They do map onto design → cut → build, but the mapping is off by one in both
directions. Assembly is not a view you switch to — it is the design surface
itself, and giving it a tab is what allows it to be reduced to 42% of a window.
Meanwhile Sheets, Parts and the Build guide are one job: the pack you take to
the machine. In the workshop you want the sheet layout, the cut list, the labels
and the assembly steps *together and printable*, not behind three tabs.

So: **the bench** (the cabinet, always) and **the output pack** (sheets, cut
list, part drawings, labels, assembly steps, export). Phases, in that they are
usually visited in that order; not a flow, because people go back and forth
constantly and a progression that has to be stepped through is the wizard the
roadmap forbids.

### 5. Should diagnostics own a third of the screen permanently?

**No. A chip that expands, markers on the model, and repeats collapsed.**

Measured: 26.4% of the window, permanently, on every tab, showing 14 entries —
7 of them `info`, and 8 of them members of two families that differ only in
which sheet or part they name: four tiling warnings (three saying "needs 3
setups", one "needs 2") and four "spans more than one tile" notes.

Replacing it:

- **The readiness chip moves to the top bar** and becomes the single answer to
  "can this be cut": *2 blocking · 6 to check · ready to cut*. It already exists
  inside the panel's own header; it just needs to be the thing on screen.
- **Clicking it opens the list over the model**, not beside it. Nothing is
  permanently subtracted from the cabinet.
- **Repeats collapse with a count.** "Sheets 1–4 need 2–3 setups each" is one
  entry, and so are the four "spans more than one tile" notes. That alone takes
  the fresh project from 14 entries to 8, or 7 if the two sheet-versus-travel
  errors — identical but for the material named — merge as well.
- **Anything with `partIds` gets a marker on the part**, in 3D and on the sheet.
  The data is already there and `Diagnostics.tsx` already selects the part on
  click; this is the same wire, drawn.
- **The *fix* moves to the workshop surface; the diagnostic does not.** F-2 is a
  routing problem, and the obvious version of the fix is wrong: these two errors
  block export, so hiding them behind a door would make J6 worse, not better,
  and would sit against `CLAUDE.md`'s "say what is wrong" and principle 6. What
  moves is where the *parameter* lives. The readiness chip is global and names
  what is blocking wherever you are; clicking the diagnostic takes you to the
  control that fixes it, on whichever surface that is, with the field focused.
  The workshop door carries a badge so the count is visible without opening it.

### 6. What is the fastest possible path to "drawers in that bay"?

Measured today: **5 interactions, 664 px of scroll, a 3.9 s floor** from a cold
start — or 3 if you never touch the model, which is the point: the two wasted
interactions are the ones where the user pointed at the thing they meant.

Three ways to make it shorter, and only one of them is worth having:

- **(a) Move the bay controls up the sidebar.** Removes the scroll, keeps the
  count at 3, and only works until the next group wants to be first. It also
  makes the sidebar worse for everyone not editing a bay.
- **(b) A "drawers" button in the toolbar** acting on the selected bay. Two
  interactions, and wrong: it needs a selection the interface has no way to
  make, and it turns one capability into a special case ahead of shelves and
  doors, which are its peers.
- **(c) Selection resolves to the bay, and the bay's own choices appear where it
  is.** **Chosen. Target 2:** click the bay; pick Drawers from what appears next
  to it, with a sensible default stack in place. Editing the stack is then
  direct — the fronts are drawn, and their heights are editable where they are
  drawn — so three drawers of specific heights is **≤ 3 more**.

(c) costs the most, because bays are not parts and have no geometry to pick.
That is the work R-20 names, and it is worth it because the same mechanism then
serves shelves, doors, panels and joints without a second special case.

This is the single interaction that most justifies the whole rebuild, because it
is the one people repeat.

### 7. How does somebody find a feature they do not know exists?

Three routes, all needed, none sufficient alone:

1. **Find by name, over everything** — a persistent search field and a keyboard
   shortcut, matching parameter names, option names *and* the words a woodworker
   would actually use: "kickboard" → toe kick, "beadboard" → grooves,
   "knock-down" or "no screws" → tab and slot, "rebate" → rabbet. This serves
   the person who knows what they want and not where it lives. It is small work,
   and it is the only thing in this architecture that helps somebody who has the
   word but not the place — which today is nobody's route, because there is no
   search at all.
2. **Choices as galleries** (R-18) — a joint chooser showing two rendered
   pictures makes tab-and-slot discoverable by *looking*. This is the only route
   that works for someone who does not have the word at all.
3. **Capabilities offered where they apply** — an empty bay offers shelves, a
   door or drawers as pictures, in place; a selected panel offers banding and
   effects. This is the only route that reaches someone who was not looking.

Note what is deliberately absent: a tour, a tips panel, a "did you know". The
principle is teach by showing, and all three routes above are things the user
walked into, not things that interrupted them.

---

## Arguing with the principles

The milestone preamble says its nine design principles are "written to be argued
with. If an item in this milestone conflicts with one, either the item or the
principle is wrong; say which." R-16 says the same thing harder: the principles
are starting material, **not the conclusion**. So it is worth being honest that
the architecture chosen below is largely the principles restated — which is a
weak position to argue from unless the principles survive being pushed on.

Two of them do not survive as written.

**Principle 6, "Never block, only explain", is already false, and should be.**
The tool blocks. `ExportBar` disables export whenever a diagnostic is an error,
and it is right to: cutting a file the pipeline knows is wrong is the exact
failure `CLAUDE.md` calls the worst outcome this codebase can have. J6 is a
blocked export, and the fix is not to unblock it. What the principle is
reaching for is that a block must never be a dead end — it must say what is
wrong, where the fix is, and what the fix costs, which is precisely what J6
shows the tool failing at. **Read it as "never block without a route out", and
R-21 is the item that owes the route.**

**Principle 1, "The model is the interface", overreaches, and the architecture
below quietly relies on the narrower version.** A good half of what this tool
holds has no geometry to touch: fit clearance, cutter diameter, remnant
threshold, tile overlap, safe layer names. There is nothing to click. The
principle's own second sentence — "a form describing it is a fallback, not the
main route" — reads as though the form were a concession, when in fact the
workshop surface *is* a form and should be an unapologetically good one.
**Principle 2 already says the true thing** ("anything with a visible
consequence is chosen by looking at the consequence"), and principle 1 is best
read as its corollary for the design surface only.

The other seven stand. Principle 3 (what you change every minute and what you
set once a year do not belong together) is the one this research most strongly
confirms: half the sidebar, measured, is the workshop.

One consequence worth stating plainly. Architecture B loses on principles 1 and
8, and A is what those principles imply — so if the principles were wrong, the
choice would be too. They were pushed on above and two needed rewording rather
than replacing. That is the honest strength of the argument: not that A won a
contest, but that the case against the principles it rests on is weaker than the
case for them.

---

## The architectures sketched

### A — The bench *(chosen)*

The model is the surface. Everything else floats over it, appears on selection,
or lives behind a door.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Kitchen run   2400 × 2000 · 34 parts · 5 sheets   ● ready to cut     │  top bar
│                        [ find… ⌘K ]   ↶ ↷  Workshop  Output  Export  │
├──────────────────────────────────────────────────────────────────────┤
│                                                    ┌───────────────┐ │
│                                                    │ Run › C1 ›    │ │
│                                                    │ Base › Bay 2  │ │  inspector
│                    the cabinet                     │───────────────│ │  (floats,
│                  (always, ~70%)                    │ ◻ shelves     │ │  dismissible,
│                                                    │ ◼ drawers     │ │  only what
│                                                    │ ◻ door        │ │  is selected)
│                                                    │  200 200 200  │ │
│                                                    └───────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│ ▐███▌ ▐██▌ ▐████▌ ▐██▌  +                                            │  run strip
└──────────────────────────────────────────────────────────────────────┘
```

**Four things, and that is the whole shell:**

1. **The bench.** The cabinet fills the window. Target ≥ 70% at 1440 × 900 and
   ≥ 60% at 1024 × 768, against 42.7% and 34.6% today.
2. **The run strip.** A scale elevation of the run along the bottom: a column
   per cabinet, boxes for carcasses, click to select, drag to reorder, `+` to
   add. About 90 px, collapsing to a row of chips when the window is short.
3. **The inspector.** ~300 px, floating over the model on the side away from the
   selection, dismissible, showing *only what applies to what is selected* with
   a clickable breadcrumb at the top. Selection always resolves — nothing
   narrower selected means the run is selected.
4. **Two doors in the top bar.** *Workshop* (machine, tooling, materials, solid
   stock, hardware, tape, nesting — the profile) and *Output* (sheets, cut list,
   part drawings with per-part DXF, labels, assembly steps, export preview).
   Plus *find*, the readiness chip, undo/redo and the project menu.

**What each selection shows** — this is the inventory R-17 has to cover. Between
them these account for every parameter the sidebar reaches today, plus the eight
it does not:

| Selected | Inspector shows |
|---|---|
| *(nothing)* → the run | project name, the opening and "Measure the room…", the cabinet list, add/duplicate/reorder |
| a cabinet | its name, its stack, add a carcass, duplicate, remove, its place along the run |
| a carcass | width/height/depth, top and bottom panel, back and its material, dividers and their spacing, construction, toe kick, hanging rail |
| a bay | shelves / door / drawers and their parameters, as pictures; the pin ladder's limits where they apply |
| a panel | what it is and how it joins (with a section), which sheet it is cut from, banding on its edges, surface effects on its faces |
| a door | fit, reveal, hinge side, handle, effects |
| a joint | the section, the clearances, and the joinery choice that produced it |

**Why this one.** It is the only sketch that moves the top five frictions at
once, and it finishes a mechanism the app already has: cabinet selection
already narrows the panel, already works, and is already the reason the sidebar
does not grow with the run. Part selection already raycasts, already isolates,
already highlights. What is missing is one wire between them.

**What it costs.** It is the largest item on the roadmap and the easiest to
half-finish. `ParamPanel.tsx` is 1305 lines and every one of them has to land
somewhere. The mitigation is R-17's own: land the shell and the selection
plumbing first, migrate every group, delete the sidebar in the same pass.

### B — The brief *(rejected)*

A document, but organised by **decision** rather than by data structure. Not the
current sidebar reordered — a specification the user fills in, in the language a
joiner uses talking to a client, with the model pinned beside it:

> **What are you building?** · a run of base units, a wall cabinet, a pantry…
> **How big, and where does it go?** · sizes, and the room it has to fit
> **What is inside it?** · per cabinet: bays, shelves, doors, drawers
> **How does it go together?** · joinery, backs, tops, banding
> **What are you cutting it on?** · machine, tooling, sheets, nesting

This is genuinely different, not a strawman, and it is good at things A is not.
Every capability becomes a question you are *asked*, which is a real answer to
F-6 — you cannot fail to discover surface effects if something asks whether you
want them. It reads like the trade. It would be quicker to build, because it is
a re-organisation of components that exist. And it degrades gracefully to a
phone.

**Rejected, and the reason that decides it is the first one:**

1. **It keeps the model as a picture beside a form.** The one thing this tool
   has that nothing else does is an exact geometry engine that runs in
   milliseconds and already renders what it will cut. An architecture that
   leaves that in the corner is not using its own advantage, and it concedes
   principles 1 and 8 rather than arguing with them. Everything the brief is
   good at, A can also do — a gallery phrased as a question is a gallery either
   way — but A can additionally be acted on by touching the cabinet, and B
   cannot be retrofitted into that without becoming A.
2. **Organising by decision does not remove the lookup, it relabels it.**
   Finding "drawers in that bay" becomes remembering which question covers bays
   rather than which group does. Better labels, same class of problem: a person
   holding a picture of a cabinet still has to translate it into somebody else's
   filing scheme before they can act. Direct selection removes the translation
   rather than improving it.
3. **The unit of change is wrong for repeat editing.** The brief is shaped
   around designing a cabinet once, front to back. Real use is dozens of small
   returns to one bay, one width, one joint — and a document organised by
   question has no way to show you *only* the part you are returning to.

Two arguments against B that do **not** hold, recorded so nobody leans on them:
it is not a wizard — laying the steps flat is precisely what stops it being one,
and a document you can jump around in no more forces the expert through the
beginner's path than the current sidebar does. And no interaction count can be
claimed against it here, because the only number in play for A is a target, not
a measurement.

**What is worth stealing from it, and should be:** R-18's galleries should be
labelled with the *question*, not the field name. "How should the boxes go
together?" reads better than "Carcass joint", and it is the phrasing that makes
a gallery legible to somebody who does not know the answer yet. That is a
change to R-18's design notes, recorded below.

### C — Three phases with a progression *(never a candidate; recorded so nobody re-proposes it)*

This is not a third sketch — it did not survive long enough to be one. It is
here because it is the obvious idea and somebody will have it again.

Design → cut → build as an enforced sequence with a "next" at each stage. It
maps suspiciously well onto the journeys, which is exactly the trap: the mapping
is how people *first* use the tool, not how they use it. Real use is a loop —
nest, see three setups, go back and shave 20 mm off a carcass, nest again. Any
architecture that makes going back feel like going backwards is wrong, and the
roadmap forbids the wizard shape for the same reason.

---

## Discovery audit

For each significant capability: where it is today, how deep, and whether that
route is good enough. Depth is pixels from the top of the sidebar with every
group open; ✕ marks a group closed at rest.

| Capability | Where | Depth | Explained? | Good enough? |
|---|---|---|---|---|
| Undo / redo / library / autosave | top bar | — | labels | **Yes** |
| Build guide, label sheet | tab | — | on the page | **Yes** |
| Reorder the run | Run group | 228 px | aria-labels | **Yes** |
| Cabinet types (base / wall / tall / stacked) | Run group | 388 px | tooltip | Weak — four words in a dropdown; R-18's gallery |
| Capped vs inset top | carcass | 697 px | tooltip | Weak — the difference is invisible in 3D by design; needs a cutaway |
| Toe kick | carcass | 901 px | none | Weak |
| Face-frame construction | carcass | 856 px | tooltip | Weak |
| Hanging rail | carcass | 1040 px | tooltip | Weak |
| Per-bay shelves / doors / drawers | carcass | 1076–1247 px | one tooltip | **Poor** — bays are numbered, not pointed at |
| Adjustable shelves on a 32 mm ladder | bay dropdown | 1096 px | none | **Poor** |
| Bottomless upper carcass | carcass ✕ | 1601 px | tooltip | **Poor** — only rendered when a stack exists |
| Stack another carcass | Stack ✕ | 2249 px | hint | **Poor** |
| Scribe to a crooked room | Opening ✕ | 2339 px | hint + wizard | Weak — the wizard is excellent, the group is closed |
| Remnant sheets, limited quantity | Material ✕ | 2728 px | tooltip | **Poor** |
| Face-frame stock (a board, not a sheet) | Solid stock ✕ | 3378 px | tooltip | **Bad** — and invisible until a carcass is face-framed |
| Tab-and-slot joinery | Joinery ✕ | 3550 px | **none** | **Bad** |
| Dogbone vs T-bone relief | Joinery ✕ | 3586 px | tooltip | **Bad** |
| Stopped dado | Joinery ✕ | 3700 px | tooltip | **Bad** |
| Screw holes | Joinery ✕ | 3739 px | tooltip | **Bad** |
| Inset vs overlay doors | Doors | 3958 px | none | Weak |
| Hinge catalogue, custom hardware | Hardware ✕ | 4110 px | tooltip | **Bad** |
| Drawer slides | Hardware ✕ | 4569 px | tooltip | **Bad** |
| Handles | Hardware ✕ | 4999 px | tooltip | **Bad** |
| Surface effects | Effects ✕ | 5224 px | none until added | **Bad** |
| Edge banding | Banding ✕ | 5442 px | hint | **Bad** — 24 unlabelled pills |
| Shelf pin rows | group ✕ | 5944 px | hint | **Bad** |
| Tiling / feed-through axis | Machine | 6377 px | tooltip | Weak — the diagnostics surface it loudly |
| Nesting strategies, incl. guillotine | Nesting ✕ | 6538 px | tooltip | **Bad** — the bottom of the column |
| A single part's drawing | Parts tab | — | — | Weak — you cannot see it and choose a part at the same time |
| A single part's DXF | — | — | — | **Absent** |
| Which sheet each role is cut from | — | — | — | **Absent** — five parameters, no control (F-3) |
| Bays of unequal width | — | — | — | **Absent** |
| Where the shelf-pin ladder starts and stops | — | — | — | **Absent** |

**Read this table as of R-16.** R-18 turned most of its unexplained rows into
pictures and R-19 explained the rest; what each of them changed is recorded in
its own section below rather than by editing the rows, so the measurement that
justified the work is still here to check the work against.

**Three rows in that table are a clear yes**, and two of the three are in the
top bar or a tab; the third, reordering the run, is 228 px down the sidebar — the
one geometric capability that is genuinely easy to find, and it is the one at the
top of the column. Everything else geometric is 500–6800 px down, and 15 of them
sit inside groups that are closed at rest and therefore render nothing until you
open them. That is the failure principle 9 exists to name.

---

## The rest of the roadmap, reconciled

What this research changes about the items that follow — the rest of Milestone F,
plus the release item in Milestone G, because it inherits from all of them. Every
change is also made in the item itself in [ROADMAP.md](ROADMAP.md).

| Item | Verdict |
|---|---|
| **R-17** Rebuild the interface | **Confirmed**, with the architecture above named and the counts to beat fixed. Its own design notes survive contact: split by frequency, make selection mean something, give the cabinet the window, make everything findable by name, do not build a wizard. Two additions: the **run strip** as the structural spine, and **selection always resolves** so there is no empty inspector to design. Two qualifications: for J3, fewer interactions is the *wrong* target — see below; and "every parameter still reachable" has to mean the eight in F-3 too, because eight are unreachable today. |
| **R-18** Every choice a picture | **Confirmed and re-scoped up.** F-9 (the cost of a choice is invisible) belongs here as well as F-6: each gallery option needs its consequence, not just its picture. Label galleries with the **question**, not the field name — the one idea worth keeping from architecture B. |
| **R-19** Find what you did not know to look for | **Confirmed, and one part promoted into R-17.** *Find by name* is small, is the cheapest fix for F-6, and R-17 cannot deliver "everything reachable by name" without it — so the search field ships with the shell. The showroom, the explanations in place and the quiet suggestions stay here. |
| **R-20** Configure by touching the cabinet | **Confirmed, and partly pulled forward.** "Click a bay to configure it in place" is not polish on top of R-17; it *is* R-17's selection model at the bay level, and J4 does not improve without it. Bays being unaddressable is the real work, exactly as the item says. Dragging, the section plane and click-to-restyle stay here. |
| **R-21** Diagnostics that show you | **Confirmed and re-scoped up.** F-1 is now this item's headline: the structured-fix mechanism must be *correct*, not just present, and "Set sheets to machine size" — which the item cites as the pattern to follow — is measurably a trap on the default project. Add: a fix that would raise a new blocking error must not be offered as a fix. Also add F-2's routing — the *fix* moves to the workshop surface, the diagnostic stays global, because these are the errors that block export — and F-13. |
| **R-22** Confidence at export, workshop view | **Confirmed, and given one more thing to own.** J7 makes "any single part re-exportable on its own" the highest-value line in the item, not an afterthought — it is the only journey in the seven that cannot be completed at all. F-10 adds one: the tablet cannot hover, so no explanation may live only in a `title`. And the profile R-17 makes reusable is `localStorage`, so it does not reach the tablet at all — whichever item takes that device seriously owns getting a project and a profile across the gap. |
| **R-23** Polish and accessibility | **Confirmed unchanged.** The dark-only finding is its light theme; the keyboard pass and the error boundary stand as written. |
| **R-24** Test the web app | **Confirmed unchanged**, and it now has something concrete to pin: the journey counts in this document, as Playwright walks. That is what stops R-17's numbers rotting. |
| **R-25** Release | **Confirmed unchanged.** |

**Nothing is dropped.** The one thing this research would have dropped — a
sidebar reorganisation — was never an item.

### The counts R-17 has to beat

| | Today | Target |
|---|---|---|
| J1 build the thing in my head | 11 | ≤ 8 |
| J2 reach three capabilities *and be told what they are* | 6, no explanation | ≤ 6, each explained in place |
| J3 fit a real room, by hand | 9, two angles guessed | **no guessed angle at any count** |
| J4 drawers in that bay | 5 | ≤ 3 |
| J5 change the joint | 3, cost invisible | ≤ 3, cost shown before committing |
| J6 first cuttable export from a fresh project | 3, off the beaten path, costing 2 sheets | ≤ 2, offered, with the cost stated |
| J7 re-cut one part | impossible | ≤ 3 |
| Controls the shell renders at rest | 39 | ≤ 20, all about the selection |
| Controls it can render at all | 129 default, 243 with every branch on | no ceiling set — but every one of them reachable |
| Cabinet's share of the window | 42.7% / 34.6% | ≥ 70% / ≥ 60% |
| Scroll per journey | 664–2682 px | ≤ 1 screen |

**Compare like with like.** 39 is the at-rest baseline and the one the ≤ 20
target is against; 129 and 243 are what the sidebar holds, and they are here
because they are what has to stay *reachable*, not what has to stay on screen.
Quoting 129 against 20 would claim a six-fold win where the honest one is
under two, which is the exact species of number this document exists to correct.

**J3 is the one that must not be optimised for count.** Twenty-one interactions
through the wizard is not friction: eleven are readings off a tape and the other
ten are turning the page. The target is to make the *by-hand* route
stop accepting a guessed angle, which will probably make it longer. Measuring fewer things is not
the same as measuring them faster, and this is the one place where a lower
number would be a worse tool.

---

## What R-17 built, and what it measured

R-17 executed architecture A. The numbers below were taken the same way as the
ones above — Playwright against `vite preview` on the production build, from a
cleared `localStorage` — on **2026-08-31**, and they replace the targets as the
figures the next item has to beat.

| | Today (R-16) | Target | R-17, measured |
|---|---|---|---|
| J1 build the thing in my head | 11 | ≤ 8 | **8**, no scrolling |
| J2 reach three capabilities *and be told what they are* | 6, no explanation | ≤ 6, each explained | **6**, each explained where it lands |
| J3 fit a real room, by hand | 9, two angles guessed | no guessed angle at any count | **no angle can be typed at all** |
| J4 drawers in that bay | 5 | ≤ 3 | **2** |
| J6 first cuttable export from a fresh project | 3, off the beaten path | ≤ 2, offered, cost stated | **2**, offered first, cost on the button |
| Controls the shell renders at rest | 39 | ≤ 20 | **20** |
| Cabinet's share of the window | 42.7% / 34.6% | ≥ 70% / ≥ 60% | **84.4% / 81.8%** gross; **76.0% / 67.9%** net of the inspector |
| Diagnostics entries on a fresh project | 14 | repeats collapsed | **7** |
| Scroll per journey | 664–2682 px | ≤ 1 screen | **0 px** on J1 and J4 |

**How the counts are taken now.** Controls at rest counts every `input`,
`select`, `textarea` and `button` in the whole page whose rectangle is on
screen, not only the ones in a panel — the shell has no sidebar to scope it
to any more, and scoping it to the inspector alone would flatter it by eight.
It is 8 in the top bar, 8 in the run strip (one cabinet, two carcasses, four
bays, and the `+`), 3 in the inspector and the explode slider. The share of the
window is given twice because the inspector floats over the model rather than
dividing the window: gross is the model's own rectangle, net subtracts the
inspector's card, and the honest comparison against 42.7% is the net one.

**J1 came in at 8 only because removing a carcass selects its neighbour.**
Selection costs an interaction the old sidebar did not charge — it rendered
every carcass's controls at once — so the floor for J1 under this architecture
is one select, three dimensions, one bay count, three bay choices and one
removal. Nine. What takes it to eight is that removing the upper carcass leaves
the base *selected*, the way every list behaves, so the walk starts with the
removal and never spends an interaction saying which box it means. That is a
real behaviour, not an accounting trick, and it is worth knowing that the
margin here is one.

**Three things the architecture said that the code disagreed with.**

- **The run strip is not a true scale elevation.** Its two axes are scaled
  independently: cabinet widths are in proportion to each other and carcass
  heights to each other, but the run fills the strip either way. A true
  elevation of a 900 × 2000 mm unit in a 96 px strip is 30 px wide, and a bay
  in it is 15 px — unusable as the thing that makes bays clickable, which is
  the strip's main job. The model above it is the drawing; the strip is a map.
- **The bay controls are on the carcass as well as on the bay.** Laying out a
  box is one job, and making each bay cost a selection would have put J1 back
  where it started. A bay selected in the strip still narrows to it alone —
  that is J4's route — and the bay's own inspector is where each option gets a
  sentence explaining it. The carcass's copies are dropdowns for the same
  reason: five explained options per bay is three screens to lay out one box.
- **Find-by-name has to open what it lands in.** A closed section keeps its
  controls in the page, just hidden, so the first version of the palette
  scrolled to a heading and called that an answer. It now opens every section
  above whatever it found. The same discovery: a closed `details` still lays
  its contents out unless the page says otherwise, which is why the "controls
  at rest" count was 22 before it was 20.

**What R-17 deliberately did not do**, so the next items are not surprised:
bays are still not clickable in the *model* (R-20 owns that; the run strip is
the stand-in), choices are still words rather than rendered pictures (R-18),
there is still no per-part DXF (R-22), and the interface is still dark only
(R-23).

---

## What R-18 built, and what it measured

Nineteen dropdowns of jargon became eleven galleries of rendered geometry.
Every picture is built by `buildProject` on a small sample seeded with the live
*workshop* — your sheet thickness, your cutter, your dado depth — so a
thumbnail is the tool's own output at 76 pixels rather than an icon somebody
drew once. Measured the same way as the numbers above, on **2026-08-31**.

| | R-17, measured | R-18, measured |
|---|---|---|
| J5 change the joint | 3, cost invisible | **3**, cost stated on hover before committing, 490 px of scroll |
| Controls the shell renders at rest | 20 | **20** — every gallery is inside a section closed at rest |
| Cabinet's share of the window | 84.4% / 81.8% gross; 76.0% / 67.9% net | **84.4% / 80.6%** gross; **76.0% / 68.7%** net |
| A fresh browser opens on | a set of defaults | **five renders of real cabinets to start from** |

**J5 is the one this item exists for.** R-16 measured switching from a stopped
dado to tab and slot as changing *nothing on screen*: same badge, same 21
parts, same 4 sheets. Hovering the option now builds the whole project as that
option would make it, puts it on the model, and says underneath:

> Tab and slot: 21 parts · 4 sheets · 222 cuts (−28). 1 warning fewer.

Parts and sheets really are unchanged — that was never the lie. The twenty-eight
cuts are the screw holes a knock-down joint does not need, and the warning is
the panel that no longer has to be turned over on the bed. Those are the
consequence, and until now the tool knew them and said nothing.

**The starter gallery is the only thing added to the resting state**, and only
on a browser that has never held a project: five live renders, dismissed with
Escape and never shown again. With it up the control count is 26; the moment it
is gone it is 20, which is the number the R-17 budget is against.

**What the audit table above looks like now.** Of the rows it rated *Bad* or
*Poor* for being unexplained, these are pictures of themselves: tab-and-slot
joinery, stopped dados, dogbone versus T-bone relief, capped versus inset tops,
face-frame construction, the bottomless upper carcass, per-bay shelves, doors
and drawers, adjustable shelves on a ladder, inset versus overlay doors, the
cabinet types, and the nesting strategies (as words, deliberately — see below).
Still weak and left to R-19: the toe kick and the hanging rail, which are
switches rather than choices; edge banding's 24 unlabelled pills; and the
hardware catalogue, where the picture that would help is of a hinge, not of
geometry this tool generates.

**Three places the design gave under contact with the code.**

- **A picture cannot always be honest.** A nesting strategy has no shape of its
  own — what it produces is a packing of *your* parts on *your* sheets — so
  rendering a sample sheet would have been a picture of somebody else's
  project. It is the one gallery with words where the pictures go, which is
  what R-18's "text-only fallback" line is for.
- **Corner relief does nothing under the default joinery**, and drawing it is
  what found that out. Relief bites on tab-and-slot slots and tab roots and
  nowhere else; under a stopped dado the cutter's own radius rounds the groove
  ends and the control changes not one byte. Three identical thumbnails would
  have been the honest render and a useless one, so the samples are drawn on a
  tab-and-slot box whatever the project uses, and a line under the gallery says
  why. See [ROADMAP.md](ROADMAP.md) R-18 and [JOINERY.md](JOINERY.md).
- **A closed section still renders.** The same discovery R-17 made about the
  control count, with a bigger bill: every gallery in the inspector was
  building and projecting geometry for a section nobody had opened. `Group` now
  says whether it is open, and a picture waits for that.

**And one bug, which R-17 left and R-18 found by walking into it.** Find-by-name
did not swallow the Enter key: the palette handled it, moved focus to the
control it had found, and Enter's own default action then landed on whatever
now had focus. Searching *knock-down* and pressing Enter **changed the carcass
joint to stopped dado** without a word. It was live from the moment the palette
shipped — `ChoiceField` was a row of buttons too — and the galleries would have
extended it to nine more parameters. Fixed both ends: the palette eats the key,
and the reveal focuses the option already in force rather than the first tile,
so arriving at a gallery neither changes the design nor previews something
nobody asked for.

---

## What R-19 built, and what it measured

R-18's answer to discovery was to make every *choice* a picture. This is the
rest: the capabilities that are not a choice between two options, the machining
already on a panel in front of you, and the person who does not yet know there
is a question to ask. Measured the same way as everything above — Playwright
against `vite preview` on the production build, from a cleared `localStorage` —
on **2026-09-01**.

| | R-17 / R-18, measured | R-19, measured |
|---|---|---|
| J2 reach three capabilities *and be told what they are* | 6 interactions, each explained where it lands | **13 named before a single click**, 23 explained one click later — two from the bench, through the project menu |
| Capabilities with a written explanation in the app | 0 | **23**, each citing the `docs/` section it came from |
| A panel's machining, explained | not addressed | **every purpose the pipeline emits**, with a section through your own cabinet |
| Controls the shell renders at rest | 20 | **20**, and 23 while a suggestion is up |
| Cabinet's share of the window | 84.4% / 80.6% gross; 76.0% / 68.7% net | **84.4% / 81.8%** gross; **76.0% / 67.9%** net, **73.5% / 63.7%** with a suggestion up |

The share figures come out at R-17's numbers rather than R-18's, to the decimal,
on a build that carries both — the same viewport rectangle measured the same
way. R-18's 1024 × 768 pair is the odd one out and nothing in this item touched
the shell's geometry, so the difference is in how that measurement was taken
rather than in the app. The control count reproduces exactly, which is the
figure the budget is actually against.

**Four things were built.**

- **The showroom.** One place, off the project menu and out of find-by-name,
  showing what this tool can cut: 23 capabilities in seven groups, 21 of them a
  render the real pipeline made on this browser's own sheets and cutter, each
  with what it is, why it is shaped that way, its numbers off the live project,
  and a button to where it is set. It changes nothing, which is what makes it
  safe to open mid-job. It is deliberately *not* in the top bar: the resting
  control count is a budget R-17 set at 20 and this is not worth one of them.
- **Machining, explained in place.** Selecting a panel used to say what it is.
  It now also lists what is cut into it, grouped by what put it there — *housing
  for a divider*, *screw clearance holes*, *hinge cup* — and opening one draws a
  section through **the live project** at that joint, zoomed to it. R-18 built
  the section renderer for thumbnails of samples; this points it at the user's
  own cabinet.
- **Starters that say what they teach.** Each of the five names the
  capabilities it is there to demonstrate, and a test asserts the geometry it
  builds really contains them. A lesson that quietly stopped being true would
  be worse than no lesson, because somebody loaded the design to look at it.
- **Six quiet suggestions**, one at a time, at the foot of the inspector: a box
  on the floor with no toe kick, a screwed-together carcass that could knock
  together, fixed shelves that could be a pin ladder, a plain front, an unbanded
  front, and a run that has never been measured against a room. Never modal,
  never animated, gone for good once seen.

**What the audit table looks like now.** Of the rows R-16 rated *Bad* or *Poor*,
R-18 turned twelve into pictures of themselves. This item takes the four it
left — the toe kick, the hanging rail, edge banding and the hardware catalogue —
and the ones that were never a control at all: the stopped dado's own notch and
stop, corner relief, screw holes, the half lap, the one-face rule, the drawer
box formula, slide holes, handles and the scribe strip. All of them are now in
the showroom, and eleven of them are also reachable by clicking the very
machining they produce on a panel.

**Two things this deliberately does not do.** There is no tour and no "did you
know" — principle 9's absent list from R-16 stands. And nothing here is required
to reach any design: every suggestion is a second route to a control that was
already there, so somebody who dismisses all six reaches the same cabinet in the
same number of interactions.

**Where an explanation cannot be a picture, it says so.** Edge banding takes two
millimetres off a blank and the corner angle is three tape readings; a tile
showing a door that looks exactly like an unbanded door would teach the opposite
of the truth. Those two are words, on the same reasoning R-18 gave for the
nesting strategies.

**And one thing found by writing it down.** The toe kick had no section anywhere
in `docs/` — R-18 had already flagged it as unexplained — so there was nothing
for its explanation to be answerable to. Grounding it in the nearest paragraph
that happened to mention it would have been exactly the drift the test exists to
catch, so `JOINERY.md` gained the section first and the app cites it.

---

## What R-20 built, and what it measured

R-17 gave the model the window; R-19 gave it words. This is the item that made
it answer back. Measured the same way as everything above — Playwright against
`vite preview` on the production build, from a cleared `localStorage` — on
**2026-09-01**.

| | R-17 / R-19, measured | R-20, measured |
|---|---|---|
| J4 drawers in that bay | 2, through the run strip | **2, by pointing at the bay itself** — or at anything standing in it — with 0 px of scrolling |
| Move a divider to make bays unequal | 3 (select the carcass, tick the switch, type) | **1** — drag it, snapped and with the dimension on screen |
| Set a fixed shelf's height | *not possible at any count* | **1** by dragging, or a switch and a field |
| Bays selectable by clicking the model | no | **yes**, and so is the space inside one |
| Controls the shell renders at rest | 20 | **21** |
| Cabinet's share of the window | 84.4% / 81.8% gross; 76.0% / 67.9% net | **unchanged**, to the decimal |

**The resting count went up by one, and it is the section button.** R-17 set
that budget at 20 to kill a 129-control sidebar, and the count it landed on
already carried one control that is not about the selection: the explode
slider, which is how you look at the cabinet rather than what the cabinet is.
The section plane is its sibling and it is the capability this item exists for —
the joinery is inside the panels and has never been visible at all. Burying it
in the project menu, the way R-19 buried the showroom, would have been the
consistent move for a *reference*; this is a tool you use on the model in front
of you, and it belongs on the model. One control, stated rather than hidden.

**Four things were built.**

- **Bays are pickable, as the space they are.** A bay produces no part, so the
  builder now records where each one stands and the 3D view raycasts those
  volumes — back-face only, so anything standing in the opening is nearer and
  wins, and what is left over is the empty space. Clicking it brings up that
  bay's own controls in the inspector — the same card that answers every other
  selection, never a second panel with a second copy of the parameters in it.
- **Clicking a panel offers what would change it.** A door leads with its bay's
  fronting; a shelf with the bay's insides and its heights; a divider with the
  bay count and the widths; a side panel with the box's size and how its panels
  meet; a scribe strip with the measured room. All of it is the *same*
  component the level above renders, filtered — `CarcassInspector` takes a list
  of which of its groups to show — so there is nothing to keep in step.
- **Dividers and fixed shelves are draggable**, writing `bayWidths` and
  `shelfGaps` through the ordinary undoable update, snapping to an equal pair,
  to the 32 mm module the box is bored on, and to a round ten, with the
  dimension and *which* snap it landed on shown while the hand is down. Every
  draggable thing keeps its field: dragging is for deciding, typing is for
  committing.
- **A section plane** that cuts the live assembly on any of the three axes,
  draggable by its border, flippable, with a slider for the millimetre. It is
  the first time the dados, tongues and hinge cups inside the panels have been
  visible in place.

**Three things the design gave under contact with the code.**

- **"Its controls, in the viewport" means the controls, not the card.** The
  first version took the criterion literally and moved the inspector card to
  whatever had just been clicked in the model. Walked in the running app, that
  is a 300 px panel over the middle of the cabinet — the one thing this
  architecture exists to keep clear, and the space R-17 spent an XL winning
  back. What the journey actually needed is that clicking a bay brings up *that
  bay's* controls at all; where they appear is better answered by "where
  controls always appear", which is also where the hand already looks. Docked.

- **The whole plane cannot be the grab handle.** A translucent sheet spanning
  the run sits between the pointer and every panel behind it, so the first
  thing anyone would do after cutting a section is drag the plane by accident
  instead of clicking a bay. Only its border is grabbable now; the sheet itself
  is a hint, at an opacity you can see past.
- **A snap on an equal footing with round numbers can never be reached.** Round
  tens are ten millimetres apart, so there is always one within five; the value
  that makes two openings equal is a single number somewhere between them, and
  it is the one people actually want. Named snaps get a wider target than
  generic ones, which is the difference between "equal openings" being
  reachable by hand and being decorative.

**And four bugs found by testing and reviewing it, all of the same family:**
*a drag that appears to work and does not.*

- The first version rounded *both* openings of a dragged pair to a tenth of a
  millimetre. Their sum then no longer matched the interior they share, which
  shifted every panel beyond them by up to a fifteenth of a millimetre — a drag
  on the first divider quietly re-cutting the far end of a three-bay box. The
  partner now takes the exact remainder.
- A drag seeded its new list from `bayWidths` or `shelfGaps` whenever the length
  matched, *including a list the builder had already rejected for not adding
  up*. The list it wrote did not add up either, so the panel did not move at
  all, with only the pre-existing "split evenly instead" note as feedback. Both
  now seed from the openings the builder actually produced, which is the only
  description of the cabinet that cannot be stale.
- Committing began on the first pixel of pointer movement, so a hand that shook
  while *clicking* a divider resized the cabinet and pushed an undo entry — and
  the click still went through as a selection. A drag now needs the same four
  pixels a pick already needed to tell itself from an orbit.
- The 32 mm snap moved the *gap* to a multiple of the pitch, which puts the
  lowest shelf on the ladder and every one above it a shelf thickness off it.
  It now snaps the shelf's own height above the floor of the opening, measured
  the way `pinHeights` measures it.

Three of the four are pinned in `apps/web/test/drag.test.ts`; the fourth is a
pointer threshold and was walked in the running app instead.

---

## What R-21 built, and what it measured

R-17 had already folded a first version of most of this item into the shell
it built — the readiness chip, repeats collapsed to a count, and the
structured-fix mechanism F-1 is about, because R-17 could not honestly claim
"J6 ≤ 2, offered" without *some* answer to the trap the old sidebar's "Set
sheets to machine size" button was. Measured against `vite preview` on the
production build, from a cleared `localStorage`, on **2026-09-02**:

| | R-16, measured | R-21, measured |
|---|---|---|
| J6 first cuttable export from a fresh project | 3, off the beaten path, costing 2 sheets (R-16) | **2**, both offered, cheapest-clear sorted first — unchanged from R-17, confirmed live rather than re-derived |
| Fix offered for the fresh project's 2 blocking errors | "Set sheets to machine size" — trades them for a worse one | **Two, honestly labelled**: "Rip the sheets…" (clears both) leads; "Set the sheets to the size of the bed" (leaves 1 blocking, costs 5 sheets) is still shown, never hidden, never claiming more than it does |
| Diagnostics panel's share of the window | 26.4%, permanently, every tab | **0% at rest**; docked to the bottom of the stage only while open, cabinet visible above it |
| Workshop errors visible before opening the door | no | **yes** — a count badge on the Workshop button itself |
| A part too big, a sheet needing setups, a sagging shelf | a sentence | a sentence **and a diagram**, drawn from the same numbers |
| Parts tab: rows visible while choosing one (F-13) | 2 of 21, drawing gone by row 15 | **21 of 21** — moot once R-17 turned the output pack into one scrolling document instead of a fixed-height tab fighting the old sidebar for space |

**What was actually built here**, since the rest was already standing:

- **Topic sections.** The collapsed groups (unchanged from R-17) are now
  bucketed under a heading per topic — Machine, Nesting, Joinery and so on —
  the section with the worst severity first. `apps/web/src/diagnosticsGrouping.ts`
  is the new home for the grouping and bucketing logic, pulled out of the
  component so it is importable by a plain test — a `.tsx` file never was.
- **Diagrams for anything with a shape.** `Diagnostic` gained an optional
  `spatial` field — a closed union, not a generic scene graph — set at the
  three places in `checkManufacturability` that already have the numbers: a
  part against the machine's travel with the overhang hatched, a sheet with a
  dashed line at every seam, a shelf's span against the 40×-thickness rule of
  thumb with what runs past it shaded. `DiagnosticDiagram.tsx` draws them as
  small inline SVGs; nothing about a diagram can say something its sentence
  does not, because both are read off the same payload.
- **A readiness sentence, not just a coloured dot.** The panel's own header
  now reads *"Not ready to cut — 2 blocking, 5 to check."* or *"Ready to cut
  — 6 to check."* — the top-bar chip stays terse for its size, the panel says
  it in full.
- **Export explains itself.** The button stopped being `disabled`; blocked,
  it stays a normal button styled to read as blocked, and clicking it opens
  the diagnostics list instead of doing nothing. Verified in the browser: a
  fresh project's Export DXF opens the panel rather than downloading; once
  the top fix clears the errors, the same click downloads the zip.
- **The workshop door's badge moved to where it is visible.** It used to sit
  inside the drawer's own header — which nobody sees until they have already
  opened it, defeating the point. It is on the `Workshop` button in the top
  bar now, and scoped to the topics the drawer can actually fix (`machine`,
  `nesting`, `hardware`), read from the one place — `diagnosticTopics.ts` —
  that also gates the panel's "open the workshop" link, so the two cannot
  drift apart about what is behind that door.
- **Docked, not floating.** Raised mid-session by the person running the app,
  who found the panel sitting as a card over the top-left corner of the
  cabinet: it now docks along the bottom of the stage, full width, the
  cabinet visible above it, with a drag handle on its top edge to resize.
  Measured at 1440×900: docked flush to the bottom of the viewport, leaving
  it visible from the top bar down to the panel — closer to a build tool's
  problem list than a dialog sitting on top of the model, which is also a
  more literal reading of "shown rather than described" than the card ever
  was.

**Defects found by testing it, not by reading it — all in the same
mechanism.** The first cut styled the blocked Export button with
`aria-disabled="true"` to keep it clickable while still reading as disabled.
It does not read as merely "disabled-looking" — Playwright's own
actionability check refuses to click an `aria-disabled` element at all,
which is exactly what a screen reader tells its user too: *disabled*, when
the button in fact still does something on every click. The attribute was
dropped; the button is an ordinary enabled control with a `blocked` class for
colour. Two more, both the "share a look that means something else" family:
the button painted itself in the same red as an actual blocking error while
a rebuild was merely in flight, on every keystroke that triggers one, which
is not what red means anywhere else in this UI; and the output pack's own
copy of the button, unlike the top bar's, did not special-case that same
in-flight state, so a click mid-rebuild could open the diagnostics list only
for it to read the stale, error-free previous build and say "Ready to cut" —
directly contradicting the click that had just refused to export. Both fixed
alongside the first. `apps/web/test/diagnostics.test.ts` and
`packages/core/test/pipeline.test.ts` cover the mechanism and the three
spatial payloads; the docking, the diagrams' legibility and this bug were
found driving the built app with Playwright, per `CLAUDE.md`'s own rule that
tests do not catch layout collapse.

---

## What this does not decide

Left open deliberately, for the item that hits them:

- ~~**Exactly how a bay becomes clickable.**~~ Answered by R-20: the builder
  records each opening as a volume, and the view picks it back-face first so a
  bay is the space nothing else in it claims. See above.
- **Whether the run strip is 3D or 2D.** It should be a scale elevation; whether
  it is drawn from the same three.js scene or as an SVG from the part boxes is
  an implementation choice for R-17.
- **What the workshop profile format is.** It is a subset of `ProjectParams` and
  it lives in the same store as the project library, but the exact keys are
  R-17's to name.
- **Mobile.** The tablet at the machine is R-22's workshop view. A phone is not
  a target and nothing here assumes one.

Ideas that came out of this research and are good but outside Milestone F have
gone to [feature_suggestions.md](feature_suggestions.md) rather than widening an
item.
