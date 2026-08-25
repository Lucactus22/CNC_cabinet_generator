# Working in this repository

Parametric cabinet designer that outputs CNC-ready DXF. Read this first, then
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Orientation

| I want to… | Read |
|---|---|
| Understand how it fits together | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Know what to build next | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Understand a joint | [docs/JOINERY.md](docs/JOINERY.md) |
| Understand the output format | [docs/DXF.md](docs/DXF.md) |
| Understand doors and hinges | [docs/DOORS.md](docs/DOORS.md) |
| Understand surface decoration | [docs/EFFECTS.md](docs/EFFECTS.md) |
| Know what it does, as a user | [README.md](README.md) |

## Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 182 tests, ~2s
npm run typecheck    # both packages
npm run build        # production build of the web app
```

There is no linter yet — that is roadmap item R-02.

## What this project is about

It generates files that get cut into plywood. A wrong number is not a failed
test, it is a ruined sheet and a wasted afternoon. That shapes everything:

**Get the domain right, and prove it.** Dimensions come from published
specifications, not from memory. When a number matters — the dogbone bulge, the
hinge cup centre, the drawer box width formula — find the source, cite it in a
comment, and pin it in a test.

**Say what is wrong.** If a configuration cannot be made, the diagnostics must
say so, name the part, and name the parameter that fixes it. Silently producing
a wrong cabinet is the worst outcome this codebase can have. There is currently
one option that does exactly that, and it is roadmap item R-01.

**Prefer honest limits to false capability.** Dowel and Confirmat joinery is
absent because a 3-axis router cannot bore into a panel edge. That is documented
as a reason, not hidden. Do the same with anything you cannot do properly.

## Conventions

**Comments explain why, never what.** The code says what it does. A comment
earns its place by explaining a constraint, a trade-off, or a failure it
prevents. If a comment restates the line below it, delete it.

**Name things as a woodworker would.** `stopFrontAtY`, `exposed`, `capped`,
`boringDistance`. Not `flag2`, not `doStuff`. Diagnostics are sentences someone
would say out loud, not error codes.

**Keep the core pure.** `packages/core` has no runtime dependencies, no I/O and
no UI. Do not add any. The pipeline is synchronous and deterministic; keep it
that way — the UI runs it on every keystroke and relies on stable output.

**Reuse the joint machinery.** Several things that are not obviously dados — the
upper carcass standing on the base, the capped top lapping the sides — are
implemented as dado joints with a depth override, and inherit stopped-groove and
auto-notching behaviour for free. Look for that leverage before writing a new
strategy.

## Definition of done

An item is not finished until all of these are true:

- [ ] `npm test` and `npm run typecheck` pass
- [ ] New behaviour is covered by tests that say *why the failure would matter*
- [ ] It has been checked in the running app, not just in tests
- [ ] Every diagnostic it can produce has been seen to fire
- [ ] The docs that describe the changed area are true again
- [ ] The roadmap item's acceptance criteria are ticked

## Testing

Pin behaviour that would be expensive to get wrong in plywood, not
implementation details. Three kinds carry their weight:

1. **Construction values** — exact numbers with a source. `tan(82.5°)` for the
   dogbone sweep; the hinge cup centre at boring distance plus radius.
2. **Invariants** — mirrored side panels are exact mirrors; every part lands on
   its box; no part crosses a tile seam it could have avoided.
3. **Diagnostics** — every warning and error has a test that makes it fire.

When a test fails, work out whether the code or the assertion is wrong before
changing either. Several assertions in this repo were wrong on first writing,
and finding that out was the point.

## Verifying in the app

Tests do not catch layout collapse, a blank canvas or a control that does
nothing. Build, serve, and drive it:

```bash
cd apps/web && npx vite build && npx vite preview --port 4173 --strictPort
```

Then drive it with Playwright (Chromium is at `/opt/pw-browsers/chromium`),
screenshot the area you changed, and read the screenshot. Watch the console for
errors while you are there.

## Git

Work on the branch you were given. Commit messages explain the reasoning, not
just the change — what was wrong, why this fixes it, what it costs. If a bug was
found on the way, say what it was and how it would have shown up.
