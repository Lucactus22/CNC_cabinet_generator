import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  fitOpening,
  frameOf,
  openingWireframe,
  runSize,
  tessellate,
  type BayVolume,
  type Part,
  type ProjectResult,
} from '@cabgen/core';
import { displayedProject, useStore, type SectionState } from '../store';
import { dragPlanFor, dragReadout, snapDrag, type DragPlan } from '../drag';
import { prefersReducedMotion, watchReducedMotion } from '../theme';

/** Every tone the 3D scene is drawn in. */
interface Scene {
  panel: number;
  panelSelected: number;
  panelFaded: number;
  edge: number;
  feature: number;
  room: number;
  bay: number;
  section: number;
  background: number;
  grid: number;
  gridFaint: number;
}

/**
 * The scene's own palette, one set per theme.
 *
 * The only colours in this app that are not in `styles.css`, because they are
 * three.js materials and a stylesheet cannot reach them. The plywood tones
 * hardly move between themes — a cabinet is the colour of a cabinet in any
 * light — while everything the model is *drawn against* does: a dark viewport
 * in the middle of a light window would defeat the whole point of R-23's light
 * theme, which is a tool that can be read in daylight. `SCENE.light` is
 * checked by eye against `styles.css`'s own `--bg` rather than by the contrast
 * test, which reads CSS; what it has to be is a shade of the window it sits
 * in, and a ground the panel tone stands out from.
 */
const SCENE: Record<'light' | 'dark', Scene> = {
  dark: {
    panel: 0xc8a578,
    panelSelected: 0xf0a04b,
    panelFaded: 0x6f6357,
    edge: 0x3a3128,
    feature: 0x3d2f1c,
    room: 0x6f93bb,
    bay: 0xf0a04b,
    section: 0x6f93bb,
    background: 0x14161a,
    grid: 0x2f353f,
    gridFaint: 0x22262e,
  },
  light: {
    panel: 0xdcb98d,
    panelSelected: 0xe08b1e,
    panelFaded: 0xb3a795,
    edge: 0x5c4a33,
    feature: 0x6b5334,
    room: 0x2f6ba0,
    bay: 0xc4741a,
    section: 0x2f6ba0,
    background: 0xe7e3db,
    grid: 0xbdb6a8,
    gridFaint: 0xd2ccc0,
  },
};

/** How much of the cabinet is left showing around an isolated part. */
const ISOLATED_OPACITY = 0.12;
const HOVER_OPACITY = 0.45;
/**
 * How far the pointer has to travel before a press counts as a drag rather than
 * a click. The same threshold the pick uses to tell a click from an orbit.
 */
const DRAG_SLOP = 4;
/** One press of an arrow, orbiting: about 6°, which is a nudge rather than a jump. */
const STEP = Math.PI / 30;
/** One press of + or −. */
const DOLLY = 1.15;

/** A bay is empty space, so it only ever shows as a tint over what is behind it. */
const BAY_HOVER_OPACITY = 0.1;
const BAY_SELECTED_OPACITY = 0.18;

/** What a click in the model landed on. A bay is a volume, not a part. */
export type Pick = { kind: 'part'; id: string } | { kind: 'bay'; id: string };

const same = (a: Pick | null, b: Pick | null): boolean =>
  a !== null && b !== null && a.kind === b.kind && a.id === b.id;

/**
 * Live assembly view, and the place the cabinet is worked on.
 *
 * Panels are extruded straight from their real machining outlines, so toe kick
 * notches and tenons show up exactly as they will be cut. Pockets and holes are
 * drawn as lines sitting just proud of the face they belong to: a full boolean
 * would look no clearer and would cost the frame budget for nothing.
 *
 * R-20 made the picture editable. Bays are pickable as volumes rather than
 * parts (they produce no panel of their own, so the builder hands out where
 * they stand); dividers and fixed shelves can be dragged, writing the same
 * parameters their fields write; and a section plane cuts the assembly open so
 * the joinery inside the panels can be seen at all.
 */
export function Viewport3D({ hidden = false }: { hidden?: boolean }) {
  // The option under the pointer when a gallery is offering one, otherwise the
  // design itself. This is the only place a preview is allowed to show.
  const project = useStore(displayedProject);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const exploded = useStore((s) => s.exploded);
  const setExploded = useStore((s) => s.setExploded);
  const section = useStore((s) => s.section);
  const resolvedTheme = useStore((s) => s.resolvedTheme);

  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [hover, setHover] = useState<Pick | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // The drag in progress, off the render path: a plan captured when the panel
  // was grabbed, so a build landing mid-drag cannot move the ground under it.
  const drag = useRef<DragPlan | null>(null);

  const selected = useMemo<Pick | null>(
    () => focusOf(project.bays, selection),
    [project, selection],
  );

  /**
   * Everything a click in the model can land on, in one order, so a keyboard
   * can walk it.
   *
   * R-23 asks for a keyboard route to everything the 3D view does by pointing.
   * Most of it already had one — a bay is a button in the run strip, a
   * divider's position is a field beside it, the section plane is a slider —
   * but *a panel* had none at all: the only way to select one was to click it
   * or find it in the cut list on the other surface. Bays come first because
   * "drawers in that bay" is the interaction people repeat; both lists are in
   * the builder's own order, so stepping through them walks the run left to
   * right rather than in whatever order they were drawn.
   */
  const pickable = useMemo<Pick[]>(
    () => [
      ...project.bays.map((b) => ({ kind: 'bay' as const, id: b.id })),
      ...project.parts.map((p) => ({ kind: 'part' as const, id: p.id })),
    ],
    [project],
  );

  const stepSelection = (by: number): void => {
    if (pickable.length === 0) return;
    const at = pickable.findIndex((p) => same(p, selected));
    const from = at === -1 ? (by > 0 ? -1 : 0) : at;
    const next = pickable[(from + by + pickable.length) % pickable.length]!;
    select(selectionFor(project.bays, next));
  };

  useEffect(() => {
    if (!mount.current) return;
    // The theme is read once here rather than made a dependency: recreating
    // the engine would throw away the camera the user has orbited to. The
    // effect below hands a change to the live engine instead.
    const e = createEngine(
      mount.current,
      {
        // Clicking the same thing again, or the background, brings the rest of
        // the cabinet back — which means selecting the run, because selection
        // always resolves.
        onPick: (hit) => {
          const state = useStore.getState();
          const current = focusOf(state.project.bays, state.selection);
          if (hit === null || same(hit, current)) {
            select({ kind: 'run' });
            return;
          }
          select(selectionFor(state.project.bays, hit));
        },
        onHover: setHover,
        onDragStart: (partId) => {
          const state = useStore.getState();
          // Nothing is where the parameters say while the model is blown apart,
          // so a drag then would set a number off a panel that has been moved
          // for show.
          if (state.exploded > 0.001) return null;
          const plan = dragPlanFor(state.project, state.params, partId);
          drag.current = plan;
          if (plan) setDragging(dragReadout(plan, plan.from, null));
          return plan?.axis ?? null;
        },
        onDragMove: (deltaMm) => {
          const plan = drag.current;
          if (!plan) return;
          const { value, why } = snapDrag(plan, plan.from + deltaMm);
          setDragging(dragReadout(plan, value, why));
          // An ordinary parameter update: undoable, autosaved, and identical to
          // typing the number into the field this panel keeps.
          useStore.getState().update((p) => plan.commit(p, value));
        },
        onDragEnd: () => {
          drag.current = null;
          setDragging(null);
        },
        onSection: (at) => {
          const state = useStore.getState();
          if (!state.section) return;
          // Held inside the run: a cut dragged past the end of the cabinet takes
          // the whole model with it and leaves an empty frame on screen.
          const bounds = runBounds(state.project);
          const axis = state.section.axis;
          state.setSection({
            ...state.section,
            at: Math.min(bounds.max[axis], Math.max(bounds.min[axis], at)),
          });
        },
      },
      useStore.getState().resolvedTheme,
    );
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [select]);

  useEffect(() => {
    engine.current?.setScene(project);
  }, [project]);

  useEffect(() => {
    engine.current?.setTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    engine.current?.setHighlight(selected, hover);
  }, [selected, hover]);

  useEffect(() => {
    engine.current?.setExploded(exploded);
  }, [exploded]);

  useEffect(() => {
    engine.current?.setSection(section);
  }, [section]);

  const shown = hover ?? selected;
  const part =
    shown?.kind === 'part' ? (project.parts.find((p) => p.id === shown.id) ?? null) : null;
  const bay = shown?.kind === 'bay' ? (project.bays.find((b) => b.id === shown.id) ?? null) : null;

  return (
    <div className="viewport" style={hidden ? { display: 'none' } : undefined}>
      <div
        ref={mount}
        className="scene"
        style={{ position: 'absolute', inset: 0 }}
        tabIndex={0}
        role="group"
        aria-label="The cabinet. Arrow keys step through its bays and panels, shift and an arrow turns it round, plus and minus zoom, and Escape goes back to the run."
        onKeyDown={(e) => {
          // Zoom before the shift branch, because `+` *is* Shift and `=` on
          // most layouts: testing the modifier first made the key the label
          // advertises the one key that did nothing.
          if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            engine.current?.orbit(0, 0, 1 / DOLLY);
            return;
          }
          if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            engine.current?.orbit(0, 0, DOLLY);
            return;
          }
          // Shift turns the same arrows from "which thing" into "which way I
          // am looking at it", so orbiting — the one thing in here with no
          // control anywhere else — has a keyboard route too.
          if (e.shiftKey) {
            const swing = {
              ArrowLeft: [-STEP, 0],
              ArrowRight: [STEP, 0],
              ArrowUp: [0, -STEP],
              ArrowDown: [0, STEP],
            }[e.key];
            if (!swing) return;
            e.preventDefault();
            engine.current?.orbit(swing[0]!, swing[1]!, 1);
            return;
          }
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            stepSelection(1);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            stepSelection(-1);
          }
        }}
      />
      <div className="slider-row">
        <span>Explode</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={exploded}
          onChange={(e) => setExploded(Number(e.target.value))}
        />
      </div>
      <SectionControls project={project} />
      <div className="overlay">
        {dragging ? (
          <>
            <b>{dragging}</b>
            <br />
            release to keep it · the field beside it says the same number
          </>
        ) : part ? (
          <>
            <b>{part.label}</b> · {part.width.toFixed(1)} × {part.height.toFixed(1)} ×{' '}
            {part.thickness.toFixed(1)} mm
            <br />
            {countFeatures(part)}
            {selected?.kind === 'part' && (
              <>
                <br />
                isolated · click the background to show everything
              </>
            )}
          </>
        ) : bay ? (
          <>
            <b>{bay.label}</b> · {(bay.box.max.x - bay.box.min.x).toFixed(0)} ×{' '}
            {(bay.box.max.z - bay.box.min.z).toFixed(0)} mm opening
            <br />
            {bay.partIds.length > 0 ? `${bay.partIds.length} parts in it` : 'empty'}
          </>
        ) : (
          <>
            <b>{project.parts.length} parts</b> · click a bay to fill it, a panel to inspect it, and
            drag a divider or a fixed shelf to move it
            <br />
            or tab in here: arrows step through it, shift turns it round, + and − zoom
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The section plane's own chrome.
 *
 * The drag handle in the model is the point of it, but a plane you can only
 * grab is a plane you cannot put at 400 mm exactly — the same argument that
 * keeps a field beside every draggable panel.
 */
function SectionControls({ project }: { project: ProjectResult }) {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const bounds = useMemo(() => runBounds(project), [project]);

  if (!section) {
    return (
      <div className="section-row">
        <button
          onClick={() =>
            setSection({ axis: 'y', at: (bounds.min.y + bounds.max.y) / 2, flip: false })
          }
          title="Cut the assembly open on a plane, to see the joinery inside the panels"
        >
          Section
        </button>
      </div>
    );
  }

  const lo = bounds.min[section.axis];
  const hi = bounds.max[section.axis];
  return (
    <div className="section-row">
      <span>Section</span>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <button
          key={axis}
          className={axis === section.axis ? 'pill on' : 'pill'}
          onClick={() =>
            setSection({ ...section, axis, at: (bounds.min[axis] + bounds.max[axis]) / 2 })
          }
          title={AXIS_TITLE[axis]}
        >
          {AXIS_LABEL[axis]}
        </button>
      ))}
      <input
        type="range"
        min={lo}
        max={hi}
        step={1}
        value={Math.min(hi, Math.max(lo, section.at))}
        onChange={(e) => setSection({ ...section, at: Number(e.target.value) })}
      />
      <span className="mono">{section.at.toFixed(0)}</span>
      <button
        className="pill"
        onClick={() => setSection({ ...section, flip: !section.flip })}
        title="Look at the other half"
        aria-label="Look at the other half"
      >
        ⇄
      </button>
      <button
        className="pill"
        onClick={() => setSection(null)}
        title="Put the cabinet back together"
        aria-label="Put the cabinet back together"
      >
        ✕
      </button>
    </div>
  );
}

const AXIS_LABEL = { x: 'Across', y: 'Front', z: 'Up' } as const;
const AXIS_TITLE = {
  x: 'A plane across the run, cutting through the sides',
  y: 'A plane parallel to the wall, cutting through the doors and the back',
  z: 'A plane through the shelves, looking down into the box',
} as const;

/** Which bay volume, if any, the current selection points at. */
function focusOf(bays: BayVolume[], selection: ReturnType<typeof useStore.getState>['selection']) {
  if (selection.kind === 'part') return { kind: 'part' as const, id: selection.partId };
  if (selection.kind !== 'bay') return null;
  const found = bays.find(
    (b) =>
      b.cabinetId === selection.cabinetId &&
      b.carcassId === selection.carcassId &&
      b.index === selection.bay,
  );
  return found ? { kind: 'bay' as const, id: found.id } : null;
}

function selectionFor(bays: BayVolume[], hit: Pick) {
  if (hit.kind === 'part') return { kind: 'part' as const, partId: hit.id };
  const bay = bays.find((b) => b.id === hit.id);
  return bay
    ? {
        kind: 'bay' as const,
        cabinetId: bay.cabinetId,
        carcassId: bay.carcassId,
        bay: bay.index,
      }
    : { kind: 'run' as const };
}

function countFeatures(part: Part): string {
  const pockets = part.features.filter((f) => f.kind === 'pocket').length;
  const slots = part.features.filter((f) => f.kind === 'through').length;
  const holes = part.features.filter((f) => f.kind === 'drill').length;
  const bits: string[] = [];
  if (pockets) bits.push(`${pockets} pocket${pockets > 1 ? 's' : ''}`);
  if (slots) bits.push(`${slots} slot${slots > 1 ? 's' : ''}`);
  if (holes) bits.push(`${holes} hole${holes > 1 ? 's' : ''}`);
  return bits.length ? bits.join(' · ') : 'no machining';
}

/** The run's own extent in assembly space, for the section slider's limits. */
function runBounds(project: ProjectResult): {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
} {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const part of project.parts) {
    for (const axis of ['x', 'y', 'z'] as const) {
      min[axis] = Math.min(min[axis], part.box.min[axis]);
      max[axis] = Math.max(max[axis], part.box.max[axis]);
    }
  }
  if (!Number.isFinite(min.x)) return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  return { min, max };
}

// ---------------------------------------------------------------------------

interface Engine {
  setScene: (project: ProjectResult) => void;
  /** Swing the camera round the model, in radians, and pull it in or out. */
  orbit: (azimuth: number, elevation: number, dolly: number) => void;
  setHighlight: (selected: Pick | null, hover: Pick | null) => void;
  setExploded: (v: number) => void;
  setSection: (section: SectionState | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  dispose: () => void;
}

interface Handlers {
  onPick: (hit: Pick | null) => void;
  onHover: (hit: Pick | null) => void;
  /** The assembly axis this panel may be dragged along, or null if it may not. */
  onDragStart: (partId: string) => 'x' | 'z' | null;
  onDragMove: (deltaMm: number) => void;
  onDragEnd: () => void;
  /** Where the section plane was dragged to, in assembly coordinates. */
  onSection: (at: number) => void;
}

/** Assembly axes, in three.js space: X = x, Y (depth) = -z, Z (height) = y. */
const AXIS_DIR: Record<'x' | 'y' | 'z', THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 0, -1),
  z: new THREE.Vector3(0, 1, 0),
};

function createEngine(host: HTMLElement, handlers: Handlers, theme: 'light' | 'dark'): Engine {
  let ink: Scene = SCENE[theme];
  // The last project built, kept so a theme change can rebuild the same scene
  // in the other palette without the caller having to hand it back.
  let shown: ProjectResult | null = null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ink.background);

  const camera = new THREE.PerspectiveCamera(38, 1, 10, 30000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Per-material rather than global, so the section plane's own handle — which
  // lies exactly on the cut — is not clipped away by it.
  renderer.localClippingEnabled = true;
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  // The camera coasting to a stop is the one piece of real motion in this app.
  // Somebody who has asked for less of it gets an orbit that stops when the
  // pointer does, which is the same control without the glide — and gets it
  // the moment they ask, rather than on the next reload.
  controls.enableDamping = !prefersReducedMotion();
  controls.dampingFactor = 0.08;
  const unwatchMotion = watchReducedMotion((reduced) => {
    controls.enableDamping = !reduced;
  });

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(0.6, 0.4, 1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-0.7, -0.3, 0.4);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);
  // The bays, as volumes nothing else in the model provides: kept in their own
  // group so an empty opening can be picked without joining the part list or
  // fading with a selected panel.
  const bayGroup = new THREE.Group();
  scene.add(bayGroup);
  // The measured opening, drawn around the square run so it is obvious what is
  // being taken up where.
  const room = new THREE.Group();
  scene.add(room);
  const sectionGroup = new THREE.Group();
  scene.add(sectionGroup);
  let grid = new THREE.GridHelper(6000, 30, ink.grid, ink.gridFaint);
  grid.position.y = -1;
  scene.add(grid);

  // Ghosted panels are sorted back to front by three.js, but the isolated one
  // must come first so it is never washed out by what is in front of it.
  renderer.sortObjects = true;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let meshes: Array<{ mesh: THREE.Mesh; part: Part; home: THREE.Vector3; away: THREE.Vector3 }> =
    [];
  let bayMeshes: Array<{ mesh: THREE.Mesh; bay: BayVolume }> = [];
  let selected: Pick | null = null;
  let hovered: Pick | null = null;
  let explode = 0;
  let framed = false;
  let section: SectionState | null = null;
  // One plane and one array, both mutated in place: three.js recompiles a
  // material's program when the *number* of clipping planes changes, so
  // dragging the cut has to move the plane rather than hand out a new one.
  const clipPlane = new THREE.Plane();
  const clip: THREE.Plane[] = [];
  /** The border of the section plane: the only part of it a pointer can grab. */
  let sectionGrab: THREE.Mesh | null = null;

  const resize = (): void => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  /**
   * A drag under way: either a panel being moved, or the section plane.
   *
   * `perMm` is how far one millimetre along the drag axis moves on screen,
   * measured once at the grab. Re-measuring it every frame would make the
   * panel accelerate away from the pointer as the perspective changed.
   *
   * Nothing is written until the pointer has travelled `DRAG_SLOP` pixels.
   * Without that, a hand that shakes by a pixel while *clicking* a divider
   * resizes the cabinet and pushes an undo entry, while the click that
   * selected it goes through as normal — the very threshold `onClick` already
   * uses to tell a pick from an orbit.
   */
  let dragging: {
    what: 'part' | 'section';
    perMm: THREE.Vector2;
    from: { x: number; y: number };
    at0: number;
    live: boolean;
  } | null = null;

  const screenOf = (world: THREE.Vector3): THREE.Vector2 => {
    const ndc = world.clone().project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ndc.x + 1) / 2) * r.width, ((1 - ndc.y) / 2) * r.height);
  };

  /** Screen movement per millimetre along `dir`, taken at `world`. */
  const perMillimetre = (world: THREE.Vector3, dir: THREE.Vector3): THREE.Vector2 => {
    const a = screenOf(world);
    const b = screenOf(world.clone().addScaledVector(dir, 10));
    return b.sub(a).divideScalar(10);
  };

  const setPointer = (ev: { clientX: number; clientY: number }): void => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (dragging) {
      const moved = new THREE.Vector2(ev.clientX - dragging.from.x, ev.clientY - dragging.from.y);
      if (!dragging.live && moved.length() <= DRAG_SLOP) return;
      dragging.live = true;
      const lenSq = dragging.perMm.lengthSq();
      // A drag axis pointing straight at the camera has no screen direction to
      // project onto; ignoring it beats dividing by nothing and flinging the
      // panel to the far side of the cabinet.
      if (lenSq > 1e-6) {
        const mm = moved.dot(dragging.perMm) / lenSq;
        if (dragging.what === 'part') handlers.onDragMove(mm);
        else handlers.onSection(dragging.at0 + mm);
      }
      return;
    }
    setPointer(ev);
    const hit = pick();
    if (!samePick(hit, hovered)) {
      hovered = hit;
      handlers.onHover(hit);
      applyHighlight();
    }
    renderer.domElement.style.cursor = cursorFor(hit);
  };

  // A drag to orbit ends with a click event on the canvas, so selection has to
  // distinguish the two: only a press that barely moved counts as a pick.
  let pressAt: { x: number; y: number } | null = null;

  const onPointerDown = (ev: PointerEvent): void => {
    pressAt = { x: ev.clientX, y: ev.clientY };
    setPointer(ev);

    const onHandle = sectionHandleUnderPointer();
    if (onHandle && section) {
      beginDrag('section', onHandle, AXIS_DIR[section.axis], ev, section.at);
      return;
    }

    const hit = pick();
    if (hit?.kind !== 'part') return;
    const axis = handlers.onDragStart(hit.id);
    if (!axis) return;
    const found = meshes.find((m) => m.part.id === hit.id);
    if (!found) return;
    beginDrag('part', centreOf(found.part), AXIS_DIR[axis], ev, 0);
  };

  function beginDrag(
    what: 'part' | 'section',
    world: THREE.Vector3,
    dir: THREE.Vector3,
    ev: PointerEvent,
    at0: number,
  ): void {
    dragging = {
      what,
      perMm: perMillimetre(world, dir),
      from: { x: ev.clientX, y: ev.clientY },
      at0,
      live: false,
    };
    // Orbiting while a panel is being moved would spin the cabinet under the
    // hand and take the drag axis with it.
    controls.enabled = false;
    renderer.domElement.setPointerCapture(ev.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  }

  const onPointerUp = (ev: PointerEvent): void => {
    if (!dragging) return;
    const what = dragging.what;
    dragging = null;
    controls.enabled = true;
    if (renderer.domElement.hasPointerCapture(ev.pointerId))
      renderer.domElement.releasePointerCapture(ev.pointerId);
    if (what === 'part') handlers.onDragEnd();
  };

  const onClick = (ev: MouseEvent): void => {
    const moved = pressAt ? Math.hypot(ev.clientX - pressAt.x, ev.clientY - pressAt.y) : 0;
    pressAt = null;
    if (moved > 4) return;
    handlers.onPick(pick());
  };

  // A pointer that has left the canvas is not hovering anything, and a stale
  // highlight is a lie about what a click would land on.
  const onPointerLeave = (): void => {
    if (dragging || hovered === null) return;
    hovered = null;
    handlers.onHover(null);
    applyHighlight();
  };

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('click', onClick);

  /**
   * What is under the pointer.
   *
   * Bay volumes are drawn back-face only, so a ray inside one hits the far
   * wall of the opening: anything standing in the bay — a shelf, a door, a
   * hanging rail — is nearer and wins, and what is left is the empty space,
   * which is exactly what a bay is. The back panel sits just beyond that far
   * wall and is picked from behind the cabinet instead.
   */
  function pick(): Pick | null {
    raycaster.setFromCamera(pointer, camera);
    const candidates: THREE.Object3D[] = meshes.map((m) => m.mesh);
    if (explode <= 0.001) candidates.push(...bayMeshes.map((b) => b.mesh));
    const hits = raycaster.intersectObjects(candidates, false).filter(notClipped);
    const first = hits[0];
    if (!first) return null;
    const part = meshes.find((m) => m.mesh === first.object);
    if (part) return { kind: 'part', id: part.part.id };
    const bay = bayMeshes.find((b) => b.mesh === first.object);
    return bay ? { kind: 'bay', id: bay.bay.id } : null;
  }

  /** A hit on the cut-away half of a sectioned model is not a hit at all. */
  function notClipped(hit: THREE.Intersection): boolean {
    return clip.every((plane) => plane.distanceToPoint(hit.point) >= -1e-6);
  }

  function sectionHandleUnderPointer(): THREE.Vector3 | null {
    if (!section || !sectionGrab) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(sectionGrab, false);
    return hits[0] ? hits[0].point.clone() : null;
  }

  function cursorFor(hit: Pick | null): string {
    if (!hit) return 'default';
    if (hit.kind === 'bay') return 'pointer';
    const part = meshes.find((m) => m.part.id === hit.id)?.part;
    return part && (part.role === 'divider' || part.role === 'shelf') ? 'grab' : 'pointer';
  }

  let raf = 0;
  const tick = (): void => {
    raf = requestAnimationFrame(tick);
    controls.update();
    for (const m of meshes) m.mesh.position.lerpVectors(m.home, m.away, explode);
    renderer.render(scene, camera);
  };
  tick();

  /**
   * Point every panel's material at the clip array, or away from it.
   *
   * A bay's own material is cut too, but its `side` is left alone: it is
   * back-face only on purpose, which is what makes a ray inside an opening
   * come out at the far wall rather than stopping on the front of the bay and
   * hiding every shelf standing in it.
   */
  function retargetClipping(): void {
    for (const mat of materialsIn(root)) {
      mat.clippingPlanes = clip;
      // A cut prism is an open shell, so its inside faces have to be drawn or
      // the panel would look like a hole rather than a section through it.
      mat.side = clip.length > 0 ? THREE.DoubleSide : THREE.FrontSide;
      mat.needsUpdate = true;
    }
    for (const mat of materialsIn(bayGroup)) {
      mat.clippingPlanes = clip;
      mat.needsUpdate = true;
    }
  }

  function materialsIn(group: THREE.Group): THREE.Material[] {
    const out: THREE.Material[] = [];
    group.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) out.push(...m);
      else if (m) out.push(m);
    });
    return out;
  }

  function applySection(next: SectionState | null): void {
    const wasCutting = clip.length > 0;
    section = next;
    disposeGroup(sectionGroup);
    sectionGrab = null;

    if (next) {
      const dir = AXIS_DIR[next.axis].clone();
      if (next.flip) dir.negate();
      // `normal · p + constant ≥ 0` is kept, so the constant is the cut's own
      // coordinate, negated — and flipping the normal flips its sign with it.
      clipPlane.set(dir, next.flip ? next.at : -next.at);
      if (!wasCutting) clip.push(clipPlane);
      const built = sectionHandle(next, root, ink);
      sectionGroup.add(built.fill, built.grab);
      sectionGrab = built.grab;
    } else if (wasCutting) {
      clip.length = 0;
    }

    if (wasCutting !== clip.length > 0) retargetClipping();
  }

  return {
    setScene(project) {
      shown = project;
      disposeGroup(root);
      disposeGroup(room);
      disposeGroup(bayGroup);
      meshes = [];
      bayMeshes = [];
      const bounds = new THREE.Box3();

      for (const part of project.parts) {
        const built = buildPart(part, ink);
        if (!built) continue;
        root.add(built.group);
        meshes.push(built);
        bounds.expandByObject(built.group);
      }

      for (const bay of project.bays) {
        const mesh = buildBay(bay, ink);
        bayGroup.add(mesh);
        bayMeshes.push({ mesh, bay });
      }

      const view = bounds.clone();
      for (const loop of drawRoom(project, ink)) {
        room.add(loop);
        view.expandByObject(loop);
      }

      // Explode outwards from the middle of the unit.
      const centre = bounds.getCenter(new THREE.Vector3());
      for (const m of meshes) {
        const dir = m.home.clone().sub(centre);
        if (dir.lengthSq() < 1) dir.set(0, 1, 0);
        m.away.copy(m.home).add(dir.normalize().multiplyScalar(180));
      }

      if (!framed && !view.isEmpty()) {
        framed = true;
        const size = view.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z);
        controls.target.copy(centre);
        camera.position
          .copy(centre)
          .add(new THREE.Vector3(radius * 0.9, radius * 0.35, radius * 1.3));
        camera.near = radius / 100;
        camera.far = radius * 20;
        camera.updateProjectionMatrix();
      }
      // The new materials know nothing about the cut that is already open.
      applySection(section);
      retargetClipping();
      applyHighlight();
    },
    setHighlight(sel, hov) {
      selected = sel;
      hovered = hov;
      applyHighlight();
    },
    setExploded(v) {
      explode = v;
      bayGroup.visible = v <= 0.001;
    },
    // The pointer orbits by dragging; this is the same movement for a
    // keyboard. Done on the camera's own spherical coordinates rather than
    // through OrbitControls, whose rotate methods are not part of its API —
    // `update()` afterwards is what keeps damping and the target in step.
    orbit(azimuth, elevation, dolly) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += azimuth;
      // Held off the poles: straight overhead flips the horizon and leaves
      // the next press turning the model the wrong way.
      spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi + elevation));
      spherical.radius = Math.max(camera.near * 4, spherical.radius * dolly);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
    },
    // The scene's colours are three.js materials, not stylesheet rules, so a
    // theme change has to rebuild them. Everything the camera is pointed at is
    // rebuilt from the same project, which is also what keeps the view — the
    // frame is only taken once, and `framed` is already true by now.
    setTheme(next) {
      // Every panel is extruded again by the `setScene` below, so a call that
      // changes nothing — the effect firing on mount for the theme the engine
      // was built with — is worth stepping over rather than paying for.
      if (SCENE[next] === ink) return;
      ink = SCENE[next];
      scene.background = new THREE.Color(ink.background);
      scene.remove(grid);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      grid = new THREE.GridHelper(6000, 30, ink.grid, ink.gridFaint);
      grid.position.y = -1;
      scene.add(grid);
      if (shown) this.setScene(shown);
    },
    setSection(next) {
      applySection(next);
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      unwatchMotion();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      disposeGroup(root);
      disposeGroup(room);
      disposeGroup(bayGroup);
      disposeGroup(sectionGroup);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  /**
   * Selecting a part isolates it: everything else drops to a ghost so the panel
   * can be inspected in place, still surrounded by enough of the carcass to
   * read where it sits. Selecting a bay does not — a bay is the space, and
   * fading the panels that define it would leave nothing to see.
   */
  function applyHighlight(): void {
    const focus = hovered ?? selected;
    const focusPart = focus?.kind === 'part' ? focus.id : null;
    const isolating = selected?.kind === 'part';

    for (const m of meshes) {
      const mat = m.mesh.material as THREE.MeshLambertMaterial;
      const isFocus = m.part.id === focusPart;

      if (!focusPart) mat.color.setHex(ink.panel);
      else if (isFocus) mat.color.setHex(ink.panelSelected);
      else mat.color.setHex(ink.panelFaded);

      const opacity = !isolating
        ? focusPart && !isFocus
          ? HOVER_OPACITY
          : 1
        : isFocus
          ? 1
          : ISOLATED_OPACITY;

      mat.opacity = opacity;
      mat.transparent = opacity < 1;
      mat.depthWrite = opacity >= 1;
      mat.needsUpdate = true;

      // Feature lines belong to the panel, so they fade with it.
      m.mesh.traverse((o) => {
        if (!(o instanceof THREE.LineLoop)) return;
        const lm = o.material as THREE.LineBasicMaterial;
        lm.transparent = opacity < 1;
        lm.opacity = opacity;
      });
    }

    for (const b of bayMeshes) {
      const mat = b.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity =
        selected?.kind === 'bay' && selected.id === b.bay.id
          ? BAY_SELECTED_OPACITY
          : hovered?.kind === 'bay' && hovered.id === b.bay.id
            ? BAY_HOVER_OPACITY
            : 0;
    }
  }
}

const samePick = (a: Pick | null, b: Pick | null): boolean =>
  (a === null && b === null) || same(a, b);

/** Assembly-space centre of a part, in three.js coordinates. */
function centreOf(part: Part): THREE.Vector3 {
  return new THREE.Vector3(
    (part.box.min.x + part.box.max.x) / 2,
    (part.box.min.z + part.box.max.z) / 2,
    -(part.box.min.y + part.box.max.y) / 2,
  );
}

/**
 * A bay, as the space it is.
 *
 * Back-face only and unlit: it must never hide what stands in front of it, and
 * a lit box in the middle of a cabinet would read as a panel that is not there.
 */
function buildBay(bay: BayVolume, ink: Scene): THREE.Mesh {
  const w = bay.box.max.x - bay.box.min.x;
  const d = bay.box.max.y - bay.box.min.y;
  const h = bay.box.max.z - bay.box.min.z;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(w, 1), Math.max(h, 1), Math.max(d, 1)),
    new THREE.MeshBasicMaterial({
      color: ink.bay,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  mesh.position.set(
    (bay.box.min.x + bay.box.max.x) / 2,
    (bay.box.min.z + bay.box.max.z) / 2,
    -(bay.box.min.y + bay.box.max.y) / 2,
  );
  return mesh;
}

/**
 * The section plane: a barely-there sheet so you can see where the cut is, and
 * a frame around it that is the only thing you can grab.
 *
 * The frame matters. A grabbable sheet spanning the whole run would sit between
 * the pointer and every panel behind it, and the first thing anyone did after
 * cutting a section would be to drag the plane instead of clicking a bay.
 */
function sectionHandle(
  section: SectionState,
  root: THREE.Group,
  ink: Scene,
): { fill: THREE.Mesh; grab: THREE.Mesh } {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(1.08);
  const centre = bounds.getCenter(new THREE.Vector3());

  const [w, h] = { x: [size.z, size.y], y: [size.x, size.y], z: [size.x, size.z] }[section.axis];
  const width = Math.max(w!, 1);
  const height = Math.max(h!, 1);
  const band = Math.max(12, Math.min(width, height) * 0.05);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color: ink.section,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const grab = new THREE.Mesh(
    frameGeometry(width, height, band),
    new THREE.MeshBasicMaterial({
      color: ink.section,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  for (const mesh of [fill, grab]) {
    if (section.axis === 'x') {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(section.at, centre.y, centre.z);
    } else if (section.axis === 'y') {
      mesh.position.set(centre.x, centre.y, -section.at);
    } else {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(centre.x, section.at, centre.z);
    }
  }
  return { fill, grab };
}

/** A rectangular ring, `band` wide, centred on the origin. */
function frameGeometry(width: number, height: number, band: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();

  const inner = new THREE.Path();
  const iw = Math.max(width / 2 - band, 0);
  const ih = Math.max(height / 2 - band, 0);
  inner.moveTo(-iw, -ih);
  inner.lineTo(-iw, ih);
  inner.lineTo(iw, ih);
  inner.lineTo(iw, -ih);
  inner.closePath();
  shape.holes.push(inner);

  return new THREE.ShapeGeometry(shape);
}

/**
 * The measured opening as line loops: the two return walls, the head, and the
 * floor sloping under the run.
 *
 * The geometry comes from the core, off the very numbers the scribe parts are
 * cut from, so what is on screen cannot drift from what is machined.
 */
function drawRoom(project: ProjectResult, ink: Scene): THREE.LineLoop[] {
  const { opening, cabinets } = project.params;
  if (!opening.enabled) return [];
  const run = runSize(cabinets);
  const loops = openingWireframe(opening, fitOpening(opening, run), run);
  if (loops.length === 0) return [];

  const material = new THREE.LineBasicMaterial({ color: ink.room });
  return loops.map((loop) => {
    const geom = new THREE.BufferGeometry().setFromPoints(
      loop.map((p) => new THREE.Vector3(p.x, p.z, -p.y)),
    );
    return new THREE.LineLoop(geom, material);
  });
}

interface BuiltPart {
  group: THREE.Group;
  mesh: THREE.Mesh;
  part: Part;
  home: THREE.Vector3;
  away: THREE.Vector3;
}

/** Extrude one panel from its machining outline and place it in the assembly. */
function buildPart(part: Part, ink: Scene): BuiltPart | null {
  const outline = tessellate(part.outline, 0.4);
  if (outline.length < 3) return null;

  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const f of part.features) {
    if (f.kind !== 'through') continue;
    const hole = tessellate(f.path, 0.4);
    if (hole.length >= 3)
      shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: part.thickness,
    bevelEnabled: false,
  });
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color: ink.panel,
      transparent: true,
      opacity: 1,
      // Ghosted panels must not occlude the one being looked at, so they are
      // drawn without writing depth and after the solid geometry.
      depthWrite: true,
    }),
  );

  const group = new THREE.Group();
  group.add(mesh);

  // Local (u, v, n) is right-handed, so using it directly as the basis keeps
  // the winding correct. Extrusion runs along +z, which maps to the outward
  // normal, so the body is pushed back by its thickness to sit under face A.
  const f = frameOf(part);
  const u = new THREE.Vector3(f.u.x, f.u.z, -f.u.y);
  const v = new THREE.Vector3(f.v.x, f.v.z, -f.v.y);
  const n = new THREE.Vector3(f.n.x, f.n.z, -f.n.y);
  const origin = new THREE.Vector3(f.origin.x, f.origin.z, -f.origin.y);

  const basis = new THREE.Matrix4().makeBasis(u, v, n);
  mesh.quaternion.setFromRotationMatrix(basis);
  const home = origin.clone().addScaledVector(n, -part.thickness);
  mesh.position.copy(home);

  addFeatureLines(mesh, part, ink);

  return { group, mesh, part, home, away: home.clone() };
}

/** Draw pockets and holes on the face they belong to, a hair proud of it. */
function addFeatureLines(mesh: THREE.Mesh, part: Part, ink: Scene): void {
  // One material per panel, so a panel's lines fade with it rather than with
  // every other panel's.
  const material = new THREE.LineBasicMaterial({ color: ink.feature, transparent: false });
  const lift = 0.35;

  for (const feat of part.features) {
    let pts: Array<{ x: number; y: number }> | null = null;
    let side: 'A' | 'B' = 'A';

    if (feat.kind === 'pocket') {
      pts = tessellate(feat.path, 0.4);
      side = feat.side;
    } else if (feat.kind === 'drill') {
      pts = circlePoints(feat.x, feat.y, feat.diameter / 2);
      side = feat.side;
    }
    if (!pts || pts.length < 2) continue;

    // Local z: face A sits at the panel's thickness, face B at zero.
    const z = side === 'A' ? part.thickness + lift : -lift;
    const geom = new THREE.BufferGeometry().setFromPoints(
      pts.map((p) => new THREE.Vector3(p.x, p.y, z)),
    );
    mesh.add(new THREE.LineLoop(geom, material));
  }
}

function circlePoints(cx: number, cy: number, r: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => {
      const anyO = o as THREE.Mesh;
      anyO.geometry?.dispose?.();
      const m = anyO.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
  }
}
