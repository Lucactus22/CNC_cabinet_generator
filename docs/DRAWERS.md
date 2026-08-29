# Drawer boxes and undermount slides

A bay is either fronted with doors and shelves, or with a stack of drawers —
never both. Turning `BaySpec.drawerFrontHeights` on for a bay replaces its
doors and shelves entirely; a drawer over a door in the same bay is real
cabinetry, but it doubles the opening math this item has to get right for a
first cut, so it is out of scope. See the roadmap item, R-08.

The runner is chosen from the catalogue by id, the same way a hinge or a
shelf pin is (see [HARDWARE.md](HARDWARE.md)). The two shipped entries are
both Blum TANDEM plus BLUMOTION: **563H** for 12–16 mm drawer sides, **563F**
for 16–19 mm. Every number below is theirs; a different maker's runner is a
different entry, not a different code path.

## The width formula

Blum's own 563H sheet, in so many words: *"Inside drawer width must equal
opening width minus 42 for TANDEM to align and function properly."* The
563F sheet gives the same sentence with 49 instead, for its thicker sides.
That is the number the catalogue entry calls `widthDeduction`.

This project works in **outside** box width rather than inside, so the
formula is applied as:

```
outside width = bay's clear opening width − widthDeduction + 2 × side thickness
```

which is the same relationship — inside width plus both sides — read the
other way round. The bay's own clear opening comes from the `FrontOpening`
abstraction R-07 introduced, so a face-frame bay's drawer is sized to the
frame's own clear opening, between the stiles, exactly as a door would be.

## Picking a running length

Box **length** follows the runner's nominal length, not the cabinet depth:
Blum ship TANDEM in 229, 305, 381, 457 and 533 mm lengths, each needing a
little more cabinet depth behind it for the rear mounting bracket — 23 to
37 mm more, tightest on the shortest runner, according to Blum's own runner-
mounting table. Rather than encode that per-length table, the catalogue
entry carries one conservative `lengthClearance` (40 mm) that covers every
row; the builder picks the longest nominal length that still fits, which can
only ever under-pick a runner, never suggest one that does not fit. If even
the shortest runner needs more depth than the carcass has, the box is still
built — to the shortest length — and a note says so, rather than silently
producing no drawer at all.

## The box

Two sides, a sub-front, a back and a bottom, plus the visible drawer face —
the roadmap's own words for the two are different on purpose: the "front" is
the hidden member the face screws to, the "face" is what a woodworker points
at and calls the drawer front.

**The sides are what grow.** They reach forward into a pocket in the
sub-front and back into one in the back — the same relationship a capped
top's sides have with the top panel (`build/builder.ts`'s own capped-top
joints) — rather than the sub-front and back growing into the sides the way
a shelf grows into a carcass. That choice is not cosmetic: it is what keeps
the sub-front's and the back's own widths **stable** through the rest of the
pipeline, which is exactly the number `hardware/fit.ts` checks a box's width
against. A grown panel's box has moved by the time the pipeline is done
(see `LocalFrame`'s own "taken once, never re-derived" rule in
[ARCHITECTURE.md](ARCHITECTURE.md)); a panel that only ever *receives* a
pocket has not.

**The bottom** is captured the ordinary way — into the sides alone. Its
front edge simply meets the sub-front unjointed rather than being grooved
into it too, which is a real, common simplification: plenty of drawer boxes
rely on the two side grooves and glue at the front, not a third groove in a
sub-front a few millimetres wide. Its rear edge reaches the box's true back
from the start, because nothing constrains it there.

**The back stops short of the floor of the box**, by the runner's own
`bottomRecess` (13 mm, from Blum's front-view drawing) — Blum's own words are
that this is where the runner's own hardware runs, and a back reaching all
the way down would sit in it. The bottom is cut from the same material as the
sides here, and Blum's 13 mm figure assumes a bottom panel thinner than that;
where the sides are thicker than 13 mm — 563F's whole supported band — the
bottom's own thickness would eat into the back's own clearance and the two
would overlap. The clearance actually used is `max(bottomRecess, side
thickness)`, so the back always clears the bottom, and clears the runner's
own working zone by at least what Blum publish.

**Box joinery follows the project's carcass joint setting** for the sides'
own connection to the sub-front and back — a finger-jointed (tab-and-slot)
drawer box is real, desirable cabinetry, and neither the sub-front nor the
back is a face anyone sees once the box is behind its own drawer front. The
bottom's capture is always a plain housing joint, whatever that setting is —
the same reasoning [JOINERY.md](JOINERY.md) gives for a carcass's own back
panel: nobody finger-joints a floating bottom panel.

## The rear notch

Blum's drawer-back-preparation drawing gives a **35 mm minimum rear notch**,
cut into each rear corner of the box bottom, clearing the locking device that
engages the runner. That notch is cut here, reusing the same corner-notch
machinery a toe kick uses (`joinery/index.ts`'s `applyDrawerBottomNotch`),
just at the bottom's two rear corners instead of a side panel's two
front-bottom ones.

**Not modelled: the hook bore.** Blum's drawing also shows a Ø6 × 10 mm bore
for the locking device's own hook, positioned within that notch. It is a
real hole, but it is not named in the roadmap item's own design notes, and
adding it costs a feature for a mechanism this generator otherwise treats
generically — see the next section. Left out rather than guessed at.

## Slide mounting holes

Blum's real undermount hardware is a proprietary clip-on running system: the
runner attaches to the cabinet side and to the underside of the drawer box
through a captured profile, not a simple user-drilled screw pattern, and the
exact screw positions Blum publish (`A` and `B` in their own runner-mounting
table) are a different pair of offsets for every one of the five runner
lengths. Rather than transcribe that table, this generator bores a **generic,
symmetric pair of mounting holes**, held in `mountInset` (25 mm) from each
end of the runner — on the box's own two sides, and on the two cabinet
panels the bay is bounded by. It is the same kind of simplification the
0.1 default's hinge-plate holes are not: those genuinely are the maker's own
32 mm system; this is a stand-in for hardware this project cannot fully
model without a lookup table nobody would want to maintain by hand.

## What is checked

Two of the maker's own published limits are catalogue `requires`, checked
the same way a hinge's door-thickness range is (see HARDWARE.md's two kinds
of check):

- **Drawer side thickness** — 12–16 mm for 563H, 16–19 mm for 563F. Checked
  against the box's own side panels, found by the bottom's own joint pocket
  (`drawer-box-bottom`), which is the one feature on a side that survives the
  rest of the pipeline unmoved.
- **Drawer box width** — 170 mm minimum, from the side-adjustable locking
  device's own sheet (*"Minimum inside drawer width 170 (6-11/16 in)"*).
  Below that, Blum's standard hardware does not fit at all; they publish a
  separate narrow-drawer system for 95–124 mm boxes, which this project does
  not model. Checked against the sub-front, for the reason given above.

Both are **warnings**, not errors, matching the shipped hinges: the holes
can be cut and the runner simply will not run true. The shipped 12 mm back
material actually measures 11.9 mm — 0.1 mm under the default slide's own
minimum — which is not a rounding artefact, it is what "always measure your
own sheet" (see JOINERY.md's Tolerances table) means in practice: a project
that turns drawers on with the stock materials will see this warning until
the drawer box material is set to something that actually measures 12 mm or
more.

## The visible face

The drawer face is built exactly the way a door is: `doorLeafRect` fits it
to a slice of the bay's own `FrontOpening`, respecting the project's overlay
or inset setting and its reveal, and it carries the `drawer-face` `PartRole`
so surface effects target it exactly the way they target a door — the
Surface Effects panel offers "Drawer fronts" alongside "Doors" for exactly
this reason. A stack of *n* explicit front heights is sliced from the
opening top to bottom; if they do not add up (with a reveal between each) to
the opening's own height, the stack is split evenly instead and a note says
so, the same fallback `layoutBays` already uses for bay widths that do not
add up.
