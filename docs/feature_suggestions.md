# Feature suggestions

Ideas that came out of the design research and are **not on the roadmap**.
Nothing here is committed to. It exists so a good idea is not lost, and so the
next person can see that something was considered rather than missed.

Each entry says what it is, why it might matter, and roughly what it would cost.
If one earns its place, promote it to [ROADMAP.md](ROADMAP.md) as a proper work
order. If it is a bad idea, delete it and say why in the commit.

Sizes are the same scale as the roadmap: S is a focused session, M is a day, L
is several, XL means split it.

---

## Getting to the design faster

### Type dimensions as arithmetic
`S` · Fields accept `600/2`, `2400-18*2`, `1220 - 40`. Woodworkers already do
this arithmetic on a scrap of wood; letting them type it removes a step and a
class of mistakes. Cheap, and disproportionately liked wherever it appears.

### Save a cabinet as a reusable type
`M` · You built the perfect drawer base once. Save it to your own library and
drop it into the next project. Turns the starter gallery from a fixed set into
something that grows with the user.

### Mirror and symmetry
`S` · Flip a cabinet, or link two so editing one edits the other. Kitchens are
full of symmetric pairs and there is currently no way to say so.

### Duplicate along a run
`S` · "Four of these, side by side." Common enough in a kitchen that doing it
one cabinet at a time is noticeable friction.

### AI "design a cabinet for me".
`L` · have an MCP server, or API to an AI provider be able to generate cabinets based on you desires. 

### more surface effects.
`L` ·  expand the surface effects feature to be more robust and better, add a load more surface effects and the possibility to add custom ones (maybe based on a 2D black and white PNG or an in software editor?, idk)

### beautify designs through ornaments
`L` ·  add a new feature where ornaments can be added to the cabinet, come with a standard libary of beautifull ornaments

### more door options
`L` ·  add more door design options in different interior styles. (maybe synergy with expanding the surface effects feature)

---

## Understanding what you are making

> "Explain this joint, in place" was promoted from this list to roadmap item
> R-19, along with worked examples and a capability overview.

### Compare two variants side by side
`M` · Fork the design, change something, see both at once with the differences
called out — sheets used, cost, part count. The question "is it worth the extra
sheet?" currently has no way to be asked.

### Show what changed after an edit
`S` · Briefly highlight the parts a change affected. Changing one number can
resize fifteen parts and add a sheet, and right now nothing says so.

### Estimated build time
`S` · Machine time from the cut length already computed, plus a rough assembly
estimate from the joint count. Useful for deciding whether a design is worth it
before committing a Saturday.

---

## Fitting the real world

### Photograph the room as a backdrop
`M` · Drop a photo of the alcove behind the 3D view, scaled to the measured
opening. Not a measurement tool — a sanity check, and a much better way to judge
proportion than an empty grid.

### Measure from a photo
`L` · Derive opening dimensions from a phone photo with a reference object in
frame. Genuinely useful for a crooked room, genuinely hard to make trustworthy.
Would need to show its working and let the user correct it. Only worth it if
R-05's manual entry proves to be a real obstacle.

### Full-size printed templates
`M` · A PDF tiled to A4 or A3 for hole patterns — hinge boring, shelf pins —
so somebody without a CNC can still build the design by hand. Widens who the
tool is for more than almost anything else here.

---

## Material and cost

### What can I make from this offcut?
`M` · Enter the remnants in the rack and find out which parts fit. A different
question from nesting and a very common one in a small shop. Pairs with R-11.

### Cost estimate
`S` · Sheet price and hardware price in, project cost out, updating live.
Changes design decisions in a way nothing else on this list does.

### Hardware shopping list
`S` · Every hinge, slide, pin and screw the design needs, counted, ready to
order. The cut list's obvious sibling and cheap once the hardware catalogue
(R-06) exists.

---

## Sharing and continuity

### Share a design by link
`M` · The whole project is JSON and the app is static, so a design compresses
into a URL. No backend, no accounts. Makes asking for advice trivial.

### Version history with named milestones
`M` · Not just undo — "this is the version I cut". Sits naturally on top of R-13
and answers "what did I actually build?" six months later.

### Community starter gallery
`L` · Shared designs, browsable, loadable. High value, but needs hosting and
moderation, which contradicts the no-backend constraint. Listed so the trade-off
is visible rather than rediscovered.

### Export to CAD software.
`XXL` ·  make it possible to export to CAD software like onshape, soldiworks and fusion360. 

---

## SW Architecture

### Redesign as a hosted platform
`XXL` · Have it be a SAAS (but free) product with the possibility (but never a requirement) to make an account, save and share your designs.

### extensibility
`XXL` · make it possible to easily extend the platform with new features (similar to onshapes feature scripts) this would synergize with the feature idea of an AI integration 


## Deliberately rejected

Recorded so nobody proposes them again without new information.

- **A materials database with live pricing.** Sheet prices are local, volatile,
  and vary by supplier; a stale number is worse than asking the user for theirs.
