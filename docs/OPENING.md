# Fitting an out-of-square room

Walls lean, corners are not 90°, floors slope and plaster bows. A cabinet built
perfectly square leaves a tapering gap down one side and rocks on the floor.
This is what the tool does about that, and — just as important — what it
deliberately does not.

## The decision everything else follows from: the carcass stays square

The obvious answer is to build the box to match the room. It is the wrong one.

- Every joint in this codebase assumes axis-aligned rectangles. A parallelogram
  carcass would need a different dado, a different notch and a different tab.
- Doors and drawer slides need parallel sides. A box that is 4 mm out of square
  has a door that binds at one corner and a drawer that runs on one runner.
- It is not how the trade solves it either. A cabinetmaker builds square and
  scribes the *interface* to the wall.

So the crookedness is absorbed in a handful of sacrificial parts at the edges of
the run. That is both the correct answer and by far the cheaper one: a filler
strip is a rip off a sheet, and it is planed to fit in five minutes on site.

## What you measure

Six numbers, all of them things you read off a tape rather than decide.

| Measurement | Why it matters |
|---|---|
| Width at the top, width at the floor | A leaning wall makes these differ |
| Height at the left, height at the right | A sloping floor makes these differ |
| Corner angle, at each end that meets a wall | Rarely 90° |
| Wall bow | Two width measurements say nothing about what the wall does between them |

Each end of the run is either **against a wall** — it has to be scribed to it —
or **open**, in which case nothing is made for it.

The head of the opening is taken as level, so a difference between the two
height measurements is read as a sloping floor rather than a sloping ceiling.
If yours is the other way round, the arithmetic is the same and only the
recommendation changes.

## How to measure it

**Measure the room…** in the Opening panel walks through the lot, one
measurement per page, with a sketch of what to hold the tape across. Nothing is
written to the project until the last page, so a walkthrough abandoned halfway
leaves the run exactly as it was.

The reason it exists rather than a panel of six numbers: one of those numbers
cannot be measured. Nobody owns a protractor that fits a room corner, so asking
for an angle gets a guess, and a guessed angle is worse than none — the fillers
are cut to it.

**The corner is a triangle, not an angle.** Mark the floor a measured distance
out from the corner along each wall, and measure between the marks. A square
corner gives

```
diagonal = √(along the back² + along the return²)
```

which is the 3-4-5 rule with the numbers left in. 600 mm and 800 mm read exactly
1000 mm when square, and 600 mm is roughly a base cabinet's depth so the mark
lands where the carcass will actually stand. Any two legs work. The angle comes
back out by the law of cosines:

```
cos(corner) = (back² + return² − diagonal²) / (2 × back × return)
```

Three readings that cannot be a triangle get no angle at all, rather than an
angle derived from a clamped cosine — the walkthrough says which reading is
impossible and why. Someone with a digital angle finder can type the angle
straight in instead; doing so clears the stored triangle, because a set of tape
readings that no longer describes the angle in use is a lie waiting to be found.

**The bow is a straightedge test.** Hold a batten, a level on its edge, or a
taut string flat against each wall, slide it about, and measure the widest gap
you can find behind it. Use the worst of the two walls.

**Everything else is a tape held across the opening**: the width at the back
wall twice, level with the top of the run and again at the floor; and the height
from the floor to whatever stops the run, once at each end.

Measure into the corner rather than to the skirting — take the skirting off
first, or the cabinets stand proud of it. A reading that looks more like a
dropped digit than a crooked room (a wall 100 mm out over the height of a run, a
bow no scribe could hide) is questioned rather than silently used.

## The derivation

**How far a corner drifts.** A return wall meeting the back wall at angle *a*
drifts sideways by

```
lean = depth / tan(a)
```

over the depth of the deepest cabinet in the run. It is positive when the corner
is acute and the wall closes in towards the front — which is the direction that
eats the width the carcass needs. At 88° over a 600 mm cabinet that is 21 mm,
which is more than most people expect from two degrees.

**Widths are measured at the back wall**, which is where a tape naturally goes.
A return wall then drifts sideways by its lean over the depth of the run, so it
intrudes into the run's footprint by `max(0, lean)` — at the front when the
corner is acute, and not at all when it is obtuse, because then the wall is only
ever further away than the tape said.

**The square envelope.**

```
envelope width  = min(width at top, width at floor)
                  − max(0, lean), at each walled end
                  − wall bow,     at each walled end
envelope height = min(height at left, height at right)
```

The bow is subtracted at each walled end because either wall may be the one that
bulges, and the box has to clear the bulge.

**Where the run stands.** Centred in the band that is clear over the *whole*
depth — not in the opening as it appears at the front. Centring it at the front
is what puts the back corner of an end cabinet into a wall that leans away, and
reports the whole thing as fitting. So, measured out from the run's own end:

```
inset = max(0, lean) + wall bow + spare / number of walled ends
```

where `spare` is the envelope less the run width. That is where the wall's *back*
line sits.

**The gap each strip covers.** A strip is a flat panel standing in one plane,
where the wall has spent as much of its lean as it has travelled to get there:

```
gap(z, d) = inset + (width(z) − narrowest width) / number of walled ends
            − lean × d / run depth
```

`d` is how far forward of the back wall that strip's plane sits. At the front of
the deepest carcass, `d` is the full run depth and the whole lean has been spent;
a box set back 200 mm in a 600 mm run is only two thirds of the way along it and
its strip sees two thirds of the drift. Cutting every strip in a stepped stack
to the deepest one's gap leaves the set-back filler short of the plaster on an
acute corner, and planing half of it away on an obtuse one.

One width measurement cannot say which of two walls is doing the leaning, so the
change with height is split between the walls that are actually there. Set an
end to *open* and all of it is attributed to the one wall that is left, where it
belongs.

## What gets made

**One part per front plane at each walled end**, cut to

```
width(z) = gap(z) + scribe allowance
```

so a uniform strip of material is left to plane off all the way up, rather than
20 mm at one end and nothing at the other. It is called a **scribe strip** when
the allowance and the standoff from a bowing wall are all there is to it, and a
**filler panel** when it is covering a real gap as well. Same part, and a
woodworker names it by its width.

*Per front plane*, because carcasses step back from each other in depth and can
differ in width. A single strip run up the whole stack would stand proud of the
shallower boxes with nothing behind it, and float clear of the narrower ones
with nothing to fix it to; one per stretch follows the side the way a filler
actually does, and is cut to the gap at *its* plane. Boxes that agree on both
depth and width share a stretch and share a strip, because a joint line where
the side is continuous is a joint line nobody wants. Each runs from the top of
the toe kick, or from its own floor, to the top of its stretch.

**It is tapered** when the opening's width changes over the height of the run,
which is the one genuinely new piece of geometry in this: a trapezoid rather
than a rectangle. `buildOutline` composes a rectangle with corner notches and
edge tabs; the taper cuts one vertical edge back at one end and is deliberately
no more general than that. Nesting works off bounding boxes, so a tapered part
nests as its bounding rectangle and wastes the offcut. That is accepted rather
than complicating the packer for one part.

A leaning **corner** does not taper anything: it is the same drift at every
height, so it simply makes that end's strip wider or narrower.

**Nothing is made where there is nothing to take up.** A square opening the run
already fills, against a wall measured dead flat, produces no scribe parts at
all and geometry identical to a project that was never measured. Tell it the
wall bows 3 mm and you get a strip to scribe.

**No fixings are machined for it.** Where the strip finally lands is decided
against the plaster, not on the screen, so drilling for it here would put the
holes in the wrong place. Screw it through the cabinet side, or pocket-screw it
from behind, once it is scribed.

## The sloping floor

The run stands level on the high end of the floor and is packed down at the
other. The difference is reported as a **levelling allowance** with a
recommendation — cut the toe kick that much oversize and scribe it to the floor,
or stand the cabinets on adjustable feet — and nothing is silently altered. A
toe kick quietly made 14 mm taller than the number on screen is exactly the kind
of surprise this tool exists to avoid.

## What it tells you

The derivation is shown in full in the parameter panel and in the diagnostics,
whether or not anything is wrong, because it is the number you will want to
check against your tape before cutting a sheet:

> The opening will take a square box 922 × 2400 mm. The run is 900 × 2000 mm,
> leaving 22 mm across and 400 mm of height.
>
> The opening is 12 mm narrower at the bottom than at the top. The strips follow
> 6 mm of that; a 20 mm scribe allowance covers the remaining 6 mm with 14 mm to
> spare.
>
> The opening is 3 mm out of flat where the wall bows, so a 20 mm scribe strip
> each end covers it with 17 mm to spare.

It **warns** when a measurement is further out than the scribe allowance can
take up, naming the measurement and how far short the strip runs — but only
about what the blank is *not* already cut to. A corner is measured at its own
end, so its lean is cut in exactly and nothing is left for the plane; warning
about it would be a false alarm, and a warning that cries wolf is worse than no
warning. What is left for the allowance is:

| Measurement | What the plane still has to take off |
|---|---|
| Corner angle | Nothing: cut in exactly |
| Width at top vs floor | Nothing with one wall; half of it with two, since the split between them is a guess |
| Wall bow | All of it: no measurement predicts a bow |

It **errors** when the run will not go into the envelope at all, across or in
height.

## Deliberately not done

- **Room modelling.** This is about *one opening a cabinet run has to fit*, not
  a floor plan. There is no second wall, no window, no return leg.
- **A non-rectangular carcass.** See the top of this file.
- **Curved or bowed parts.** The bow is a number the scribe allowance has to
  clear, not a shape anything is cut to. Scribing a bow is hand work.
- **Automatic resizing of the cabinets.** The tool says what will fit; you
  decide what to build. Silently shrinking a carcass to suit a measurement
  someone mistyped is the worst failure mode available here.
