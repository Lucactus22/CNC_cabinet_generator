# The hardware catalogue

A project does not carry a hinge's dimensions. It carries the **id** of a
catalogue entry, and the entry carries both the boring pattern and the rules for
when that pattern may be used.

The reason is the one this whole generator exists for: a hinge is a physical
thing somebody buys, and the holes have to match the one in their hand. Three
makes of 35 mm hinge look identical in a drawing and differ by a millimetre in
the cup. Pinning those numbers to a make, with a source beside them, is the only
way the file and the hardware agree.

## What is in it

| Kind | Entries | What it bores |
|---|---|---|
| Hinge | IKEA UTRUSTA 110°, Blum CLIP top BLUMOTION 110°, Hettich Sensys 8645i | Cup, dowels, mounting plate holes |
| Shelf pin | 5 mm, 1/4 in | The 32 mm ladder in each bay side |
| Handle | 96 / 128 / 160 / 320 mm bar, knob | Clearance holes through the door |
| Drawer slide | Blum TANDEM plus BLUMOTION 563H, 563F | Sizes the drawer box; mounting holes on the box sides and the cabinet sides |

`hardware/catalogue.ts` holds all of it. Add a make by writing an entry and
listing it in `CATALOGUE` — nothing else changes.

### The hinges

All three are the same European pattern — a 35 mm cup with two Ø8 mm dowels
45 mm apart, 9.5 mm behind the cup's centre line. They differ in what the maker
publishes around it:

| | UTRUSTA | Blum CLIP top BLUMOTION | Hettich Sensys 8645i |
|---|---|---|---|
| Cup depth | 13 | 13 | 12.8 |
| Dowel depth | 12 | 13 | 11 |
| Boring distance allowed | 3–6 | 3–7 | 3–6 |
| Door thickness | 16–24 | 16–26 | 15–24 |

Blum's own CLIP top BLUMOTION 110° sheet is the source for the middle column:
*"Boring distance range 3 mm to 7 mm"*, *"All 35 mm and 8 mm holes must be a
minimum of 13 mm deep"*, and a minimum-reveal table whose door thicknesses run
16, 19, 22, 24, 26 with *"thickness greater than 26 trial app. recommended"*.
Hettich's Sensys 8645i sheet is the source for the right one: a 35 mm cup bored
12.8 mm deep, the TB pattern with 8 × 11 mm expanding sockets, for a 15–24 mm
door. One number there is **not** theirs: they publish no boring distance range
on that sheet, so the entry carries the 3–6 mm the 110° overlay family is
commonly set out to. That only ever produces a warning, never a hole.

Hettich publish the same hinge in three drilling patterns — TB 45 × 9.5,
TS 48 × 6 and TH 52 × 5.5 — which is exactly why the pattern is data on an entry
rather than a constant in the boring code. Only the 45 × 9.5 one is shipped,
because that is the one the other two entries share.

### The shelf pins

Only the three numbers the *pin* decides live on the entry: diameter, hole
depth, and the pitch it indexes on. Where the ladders go — 37 mm in from the
front, held short of the top and bottom of the bay — is a layout choice and
stays in the joinery settings, because it is the same choice whichever pin is in
the drawer.

Both shipped pins index at 32 mm. Kreg's 1/4 in jig steps at 1-1/4 in, which is
the same thing, so an imperial pin does not mean a different ladder.

### The handles

Off by default. A handle bores holes right through the front of a finished door,
and that is not something to produce because a checkbox happened to be ticked.

Fixing centres are multiples of the 32 mm system — 96 is three pitches, 128
four, 160 five, 320 ten — which is why those are the sizes every maker stocks.
The screws are M4, so the clearance hole is 4.5 mm.

**Overall length is not fixed by the centres**, and the entry says so. A 128 mm
bar is sold at 136, 178 and 192 mm overall depending on the design. The entries
carry a typical T-bar figure, and it decides nothing that is cut — it is only
what the overhang warning is measured against — so set it to the handle in your
hand and the warning becomes true for that handle.

The holes are **through** holes, so they can be cut from whichever face the door
is already on the bed for. A handle never adds a flip.

## Where a handle goes

This is the one hardware decision that is taste rather than specification, so it
is a setting rather than a catalogue number, with a conventional default:

| | Default | |
|---|---|---|
| Runs | Up the door | Or across it, centred on the width |
| Sits at the | Top of the door | Or the bottom, or the middle |
| From that end | 50 mm | End of the door to the nearest screw |
| From the edge | 35 mm | The **opening** edge — away from the hinges |

A vertical handle is referenced to the opening edge because that is the edge a
hand reaches for; the hinge side comes from the door itself, so a door hinged
left and one hinged right both get their handle where you would expect.

Because nobody can check taste, the diagnostics read the placement back as a
sentence:

> 2 doors are drilled for a 128 mm bar handle, vertical, 50 mm from the top of
> the door, 35 mm in from the opening edge.

## Two kinds of check, and why the severities differ

**A requirement** is the maker's published limit — *this hinge needs a door at
least 16 mm thick*. Breaking one is a **warning**: the holes can be cut, and the
hardware simply will not work.

**A derived check** is arithmetic on the boring pattern itself — a 13 mm cup in
an 11.9 mm door. Breaking one is an **error**: the panel is ruined.

Requirements are evaluated only against panels the hardware **actually landed
on**, found by the holes it left. A project with no doors hears nothing about
hinges, however thin its door material is set.

The measures a requirement can be about are a short closed list rather than a
free-form predicate. That is deliberate. A requirement has to survive being
written to a project file and read back, and a function does not.

Which of them a rule may use depends on what the hardware is bored into:

| Kind | Can be about |
|---|---|
| Hinge | Door thickness, width, height, and carcass panel thickness |
| Handle | Door thickness, width, height |
| Shelf pin | Carcass panel thickness |

A shelf pin never touches a door, so a rule about door thickness on one can
never fire — and a rule that can never fire is worse than no rule, because it
reads on screen as a guard that is in place. The picker offers only the measures
that apply, and a rule from a file that names another one is reported, as is a
rule with neither a minimum nor a maximum.

## Making an entry your own

A built-in entry is read-only: it is what its maker publishes, and quietly
editing it would leave a project claiming to be cut to a hinge it is not.
**Copy and edit…** makes a copy that belongs to the project, named, editable
down to the last hole, and saved in the file — so whoever opens it next cuts the
same holes on the same hardware.

Its fitting rules are editable too. Without that, a copied hinge for 26 mm doors
would keep warning about the 24 mm limit of the one it was copied from.

If a project names hardware that is not in the catalogue and not in its own
entries — an id someone typed, or a colleague's custom hinge that did not travel
with the file — a hinge or a shelf pin falls back to the default **and says
so**. Falling back silently would cut the job to hardware its author never
chose.

A **handle** does not fall back. It bores nothing at all, and says that instead.
A cabinet cannot be built without a hinge pattern and a pin, so falling back
there is the lesser harm; a handle can, and falling back would drill holes right
through the front of a finished door for hardware nobody chose.

An entry read back from a file that is missing any of the numbers its boring is
made of is **dropped** rather than patched — there is no honest way to guess a
hinge's cup depth — and the id then reports as missing. Fields that only
describe, like the fitting rules, are filled in instead, because nothing is
machined from them.

A custom entry sharing an id with a built-in is used in preference to it, and
that is reported too. Either way round would be wrong silently: preferring the
built-in throws away numbers somebody typed, preferring the project's makes a
shadowed entry look like the shipped one.

## Opening a project written before the catalogue

The hinge's dimensions and the shelf pin's used to be fields on the project.
A file written then is migrated on open:

- numbers that match a built-in **select that entry**;
- numbers that do not **become an entry of the project's own**, called *Hinge
  from this project*, with the 3–8 mm boring distance range the old code
  enforced.

Snapping a hinge somebody had dialled in back to the default would re-bore their
doors a couple of millimetres from where the ones already hanging in their
kitchen are.

## Deliberately not here

**A separate face-frame hinge entry.** R-07 brought the frame a hinge bores
into, and it turned out not to need one: a face-frame stile takes the same
cup, the same dowels and the same 32 mm mounting-hole pattern any built-in
entry already publishes, just read from the stile's own door-side edge
instead of the carcass's front edge. See [DOORS.md](DOORS.md) for the two
readings side by side. A maker whose face-frame plate genuinely differs —
a different hole pattern, not just a different reference edge — is still a
plain `HingeEntry` away; nothing about the catalogue's shape stops one being
added.
