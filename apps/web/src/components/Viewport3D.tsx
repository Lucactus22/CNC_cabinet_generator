import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { frameOf, tessellate, type Part, type ProjectResult } from '@cabgen/core';
import { useStore } from '../store';

const COLOURS = {
  panel: 0xc8a578,
  panelSelected: 0xf0a04b,
  panelFaded: 0x6f6357,
  edge: 0x3a3128,
  feature: 0x3d2f1c,
};

/**
 * Live assembly view.
 *
 * Panels are extruded straight from their real machining outlines, so toe kick
 * notches and tenons show up exactly as they will be cut. Pockets and holes are
 * drawn as lines sitting just proud of the face they belong to: a full boolean
 * would look no clearer and would cost the frame budget for nothing.
 */
export function Viewport3D({ hidden = false }: { hidden?: boolean }) {
  const project = useStore((s) => s.project);
  const selected = useStore((s) => s.selectedPartId);
  const select = useStore((s) => s.select);
  const exploded = useStore((s) => s.exploded);
  const setExploded = useStore((s) => s.setExploded);

  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!mount.current) return;
    const e = createEngine(mount.current, {
      onPick: (id) => select(id),
      onHover: setHover,
    });
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
    engine.current?.setHighlight(selected, hover);
  }, [selected, hover]);

  useEffect(() => {
    engine.current?.setExploded(exploded);
  }, [exploded]);

  const shown = hover ?? selected;
  const part = useMemo(
    () => project.parts.find((p) => p.id === shown) ?? null,
    [project.parts, shown],
  );

  return (
    <div className="viewport" style={hidden ? { display: 'none' } : undefined}>
      <div ref={mount} style={{ position: 'absolute', inset: 0 }} />
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
      <div className="overlay">
        {part ? (
          <>
            <b>{part.label}</b> · {part.width.toFixed(1)} × {part.height.toFixed(1)} ×{' '}
            {part.thickness.toFixed(1)} mm
            <br />
            {countFeatures(part)}
          </>
        ) : (
          <>
            <b>{project.parts.length} parts</b> · drag to orbit, scroll to zoom, click a panel
          </>
        )}
      </div>
    </div>
  );
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

// ---------------------------------------------------------------------------

interface Engine {
  setScene: (project: ProjectResult) => void;
  setHighlight: (selected: string | null, hover: string | null) => void;
  setExploded: (v: number) => void;
  dispose: () => void;
}

function createEngine(
  host: HTMLElement,
  handlers: { onPick: (id: string | null) => void; onHover: (id: string | null) => void },
): Engine {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);

  const camera = new THREE.PerspectiveCamera(38, 1, 10, 30000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(0.6, 0.4, 1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-0.7, -0.3, 0.4);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);
  const grid = new THREE.GridHelper(6000, 30, 0x2f353f, 0x22262e);
  grid.position.y = -1;
  scene.add(grid);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let meshes: Array<{ mesh: THREE.Mesh; part: Part; home: THREE.Vector3; away: THREE.Vector3 }> = [];
  let selectedId: string | null = null;
  let hoverId: string | null = null;
  let explode = 0;
  let framed = false;

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

  const onPointerMove = (ev: PointerEvent): void => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    const hit = pick();
    const id = hit?.part.id ?? null;
    if (id !== hoverId) {
      hoverId = id;
      handlers.onHover(id);
      renderer.domElement.style.cursor = id ? 'pointer' : 'default';
    }
  };
  const onClick = (): void => handlers.onPick(pick()?.part.id ?? null);

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('click', onClick);

  function pick(): { part: Part } | null {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      meshes.map((m) => m.mesh),
      false,
    );
    if (hits.length === 0) return null;
    const found = meshes.find((m) => m.mesh === hits[0]!.object);
    return found ? { part: found.part } : null;
  }

  let raf = 0;
  const tick = (): void => {
    raf = requestAnimationFrame(tick);
    controls.update();
    for (const m of meshes) m.mesh.position.lerpVectors(m.home, m.away, explode);
    renderer.render(scene, camera);
  };
  tick();

  return {
    setScene(project) {
      disposeGroup(root);
      meshes = [];
      const bounds = new THREE.Box3();

      for (const part of project.parts) {
        const built = buildPart(part);
        if (!built) continue;
        root.add(built.group);
        meshes.push(built);
        bounds.expandByObject(built.group);
      }

      // Explode outwards from the middle of the unit.
      const centre = bounds.getCenter(new THREE.Vector3());
      for (const m of meshes) {
        const dir = m.home.clone().sub(centre);
        if (dir.lengthSq() < 1) dir.set(0, 1, 0);
        m.away.copy(m.home).add(dir.normalize().multiplyScalar(180));
      }

      if (!framed && !bounds.isEmpty()) {
        framed = true;
        const size = bounds.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z);
        controls.target.copy(centre);
        camera.position.copy(centre).add(new THREE.Vector3(radius * 0.9, radius * 0.35, radius * 1.3));
        camera.near = radius / 100;
        camera.far = radius * 20;
        camera.updateProjectionMatrix();
      }
      applyHighlight();
    },
    setHighlight(sel, hov) {
      selectedId = sel;
      hoverId = hov;
      applyHighlight();
    },
    setExploded(v) {
      explode = v;
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      disposeGroup(root);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  function applyHighlight(): void {
    const focus = hoverId ?? selectedId;
    for (const m of meshes) {
      const mat = m.mesh.material as THREE.MeshLambertMaterial;
      if (!focus) mat.color.setHex(COLOURS.panel);
      else if (m.part.id === focus) mat.color.setHex(COLOURS.panelSelected);
      else mat.color.setHex(COLOURS.panelFaded);
    }
  }
}

interface BuiltPart {
  group: THREE.Group;
  mesh: THREE.Mesh;
  part: Part;
  home: THREE.Vector3;
  away: THREE.Vector3;
}

/** Extrude one panel from its machining outline and place it in the assembly. */
function buildPart(part: Part): BuiltPart | null {
  const outline = tessellate(part.outline, 0.4);
  if (outline.length < 3) return null;

  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const f of part.features) {
    if (f.kind !== 'through') continue;
    const hole = tessellate(f.path, 0.4);
    if (hole.length >= 3) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: part.thickness,
    bevelEnabled: false,
  });
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: COLOURS.panel }),
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

  addFeatureLines(mesh, part, f);

  return { group, mesh, part, home, away: home.clone() };
}

/** Draw pockets and holes on the face they belong to, a hair proud of it. */
function addFeatureLines(mesh: THREE.Mesh, part: Part, f: ReturnType<typeof frameOf>): void {
  const material = new THREE.LineBasicMaterial({ color: COLOURS.feature });
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
  void f;
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
