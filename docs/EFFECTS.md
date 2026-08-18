# Surface effects

Decorative machining applied to a chosen face of a chosen panel: beadboard,
panelling, fluting. Effects are separate from joinery on purpose — they only
ever *add* features, never change an outline, so they compose with either
carcass joint and need no special handling in the nester or the exporter.

## Grooves

Evenly spaced grooves across a face. Vertical grooves on a back panel give the
beadboard look.

| Setting | Meaning |
|---|---|
| Surface | Which panels: by role (back, sides, dividers…) in one or both carcasses, or a single selected part |
| Face | `inside` looks into the cabinet, `outside` is the other one |
| Direction | `vertical` or `horizontal`, as seen on the assembled cabinet |
| Spacing | Centre-to-centre |
| Groove width | Cannot be narrower than your cutter |
| Groove depth | Must be less than the panel thickness |
| Edge margin | Held in from the visible area |
| Spacing fit | `even` or `exact` — see below |

### `even` vs `exact`

**`even`** divides the face into a whole number of equal bays and puts a groove
on every internal boundary. Ask for 60 mm across an 864 mm panel and you get 14
bays at 61.74 mm. This is how panelling is normally set out, and it is why the
result looks regular rather than having an odd sliver at one end. It is the
default.

**`exact`** honours the spacing literally and centres the run, letting the end
margins fall where they may.

### The visible area

Effects work inside the part's **exposed region**: the area still on show once
the cabinet is together.

A back panel captured in grooves is larger than the face you see — it grows by
one dado depth on each of its four edges. Grooving across that tongue would show
as a nick at the joint line and weaken the panel where it is thinnest, so the
region excludes it automatically. The **edge margin** is measured from there, so
a margin of zero means grooves running the full height of what you can actually
see.

## The both-sides warning

Machining a panel on both faces means turning it over on the bed, which is the
main source of error on a hobby machine. So an effect placed on the face
*opposite* to whatever is already machined raises a warning naming the panel and
suggesting the other face:

> Base side, left: the grooves effect is on the outside face, but the panel is
> already machined on the other one, so it now has to be turned over on the bed.
> Putting the effect on the other face would avoid that.

A back panel usually has no other machining, so grooves on either face are free.
A side panel already carries its dados on the inside, so grooving the inside is
free and grooving the outside costs a flip.

Note that an engraved part label never counts as machining a face — it is a
reference marking, and it follows whichever face is already being worked rather
than becoming a reason to flip a panel.

Second-face geometry goes to `_FLIP` layers, mirrored across the sheet; see
[DXF.md](DXF.md).

## Adding another effect

The effect system is a registry. To add one, say a V-groove or a chamfered edge:

1. Add its shape to the `SurfaceEffect` union in `model/types.ts`.
2. Write an applier in `effects/` with the `EffectApplier` signature: it
   receives the part, its frame, the region and the target face, and returns
   features plus warnings.
3. List it in `EFFECTS` in `effects/index.ts` and give it a label in
   `EFFECT_LABELS`.

Nothing else changes. The builder, the joinery, the nester and the DXF writer
all see ordinary features, and the UI picks the new effect up from the registry.

Effects resolve direction against the panel's own frame rather than the sheet,
so an applier does not need to care how a panel is oriented or nested. Use
`resolveRunAxis` for anything that has a direction.
