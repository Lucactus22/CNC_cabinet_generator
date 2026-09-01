import {
  buildProject,
  defaultFaceFrame,
  defaultOpening,
  type Cabinet,
  type ProjectParams,
  type ProjectResult,
} from '@cabgen/core';

/**
 * The little cabinets the option pictures are drawn from.
 *
 * Each one goes through `buildProject` — the same pipeline the real design
 * uses — so a thumbnail is the tool's own output at a small size rather than
 * an artist's impression of it. The sample inherits the *workshop* from the
 * live project: your sheet thickness, your cutter, your dado depth, your fit
 * clearance. A picture of a 6 mm groove for someone running a 12 mm cutter
 * would be a lie with a picture's authority.
 *
 * What it does not inherit is the furniture. Thumbnails must not change size
 * or content because a cabinet somewhere in the run grew, or they could not be
 * cached at all — R-18's own risk note.
 */

/** One small box, deliberately stubby so a panel thickness is a visible fraction of it. */
function sampleCabinet(live: ProjectParams): Cabinet {
  const thin = [...live.materials].sort((a, b) => a.actualThickness - b.actualThickness)[0];
  const stock = live.stockMaterials[0];
  return {
    id: 'S',
    name: 'Sample',
    carcasses: [
      {
        id: 'B',
        name: 'Box',
        topStyle: 'capped',
        width: 420,
        height: 380,
        depth: 300,
        linkWidthToBelow: false,
        floor: 'own',
        toeKick: { enabled: false, height: 100, setback: 50 },
        hangingRail: { enabled: false, height: 100, screwDiameter: 6, screwSpacing: 400 },
        dividerCount: 0,
        bayWidths: [],
        bays: [
          { shelves: 'none', shelfCount: 0, shelfGaps: [], doors: 'none', drawerFrontHeights: [] },
        ],
        back: {
          style: 'groove',
          materialId: thin?.id ?? live.carcassMaterialId,
          inset: 12,
        },
        construction: 'frameless',
        faceFrame: defaultFaceFrame(stock?.id ?? ''),
      },
    ],
  };
}

/** A second box on top, for the choices that only exist in a stack. */
export function stackOn(p: ProjectParams): void {
  const cabinet = p.cabinets[0]!;
  const below = cabinet.carcasses[0]!;
  cabinet.carcasses.push({
    ...structuredClone(below),
    id: 'T',
    name: 'Upper',
    height: 300,
    topStyle: 'inset',
    linkWidthToBelow: true,
  });
}

export function sampleParams(
  live: ProjectParams,
  shape: (p: ProjectParams) => void,
): ProjectParams {
  // Cloned without the run: the workshop half is what the pictures depend on,
  // and cloning fifteen cabinets on every hover is the cost this avoids.
  const p = structuredClone({ ...live, cabinets: [], surfaceEffects: [] }) as ProjectParams;
  p.name = 'sample';
  p.cabinets = [sampleCabinet(live)];
  p.edgeBanding = {};
  p.surfaceEffects = [];
  // Engraved ids are noise at 76 pixels, and the opening would put scribe
  // strips beside a box that is not the user's run.
  p.labelParts = false;
  p.opening = { ...defaultOpening(p.carcassMaterialId), enabled: false };
  shape(p);
  // A cabinet preset names the materials the defaults ship with. A workshop
  // that stocks something else would otherwise render a back panel falling
  // back to a thickness nobody chose — the same failure `applyWorkshop`
  // reports out loud when a real project is repointed.
  const thin = [...p.materials].sort((a, b) => a.actualThickness - b.actualThickness)[0];
  for (const cabinet of p.cabinets) {
    for (const k of cabinet.carcasses) {
      if (!p.materials.some((m) => m.id === k.back.materialId)) {
        k.back.materialId = thin?.id ?? p.carcassMaterialId;
      }
      if (!p.stockMaterials.some((m) => m.id === k.faceFrame.materialId)) {
        k.faceFrame.materialId = p.stockMaterials[0]?.id ?? '';
      }
    }
  }
  return p;
}

const CACHE = new Map<string, ProjectResult>();
/** Twelve galleries of a few options each, with room for a couple of workshop changes. */
const CACHE_LIMIT = 200;

/**
 * Build a sample, or hand back the one already built for exactly these
 * numbers.
 *
 * Keyed on the sample's own parameters, which is the only key that cannot go
 * stale: everything a thumbnail depends on is in them by construction, so a
 * changed dado depth or a changed cutter misses the cache and a changed
 * cabinet width does not touch it.
 */
export function sampleProject(
  live: ProjectParams,
  shape: (p: ProjectParams) => void,
): ProjectResult {
  return cachedBuild(sampleParams(live, shape));
}

/**
 * The pipeline, run once per distinct set of parameters.
 *
 * Also what the starter gallery draws its renders from, which is why it is not
 * private to the samples: a starter is a whole project rather than a sample,
 * but the reason for keying on the parameters themselves is the same.
 */
export function cachedBuild(params: ProjectParams): ProjectResult {
  const key = JSON.stringify(params);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const built = buildProject(params);
  CACHE.set(key, built);
  if (CACHE.size > CACHE_LIMIT) {
    const oldest = CACHE.keys().next();
    if (!oldest.done) CACHE.delete(oldest.value);
  }
  return built;
}

/** For tests and for measuring: how many samples are being held. */
export const sampleCacheSize = (): number => CACHE.size;
