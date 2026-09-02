import type { DiagnosticSpatial } from '@cabgen/core';

const W = 220;
const H = 108;
const PAD = 16;
const ERROR = 'var(--error)';
const WARN = 'var(--warn)';
const LINE = 'var(--line)';
const MUTED = 'var(--muted)';

/**
 * The picture next to the sentence, for the diagnostics that have a shape —
 * a part against the machine's envelope, a sheet with its seams, a shelf
 * against the span it is safe to. Every number drawn here comes from the
 * same `spatial` payload `machine/check.ts` built the message from, so the
 * picture cannot say something the sentence does not.
 */
export function DiagnosticDiagram({ spatial }: { spatial: DiagnosticSpatial }) {
  switch (spatial.kind) {
    case 'part-vs-machine':
      return <PartVsMachine s={spatial} />;
    case 'sheet-tiles':
      return <SheetTiles s={spatial} />;
    case 'shelf-span':
      return <ShelfSpan s={spatial} />;
  }
}

function Frame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg className="diagnostic-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {children}
    </svg>
  );
}

/**
 * The part's own blank against the machine's travel. The axis that never
 * moves is a hard wall, drawn solid with the overhang hatched; an axis the
 * stock feeds along is drawn open-ended, because a part too long for one
 * setup still cuts fine in several — that is a different diagnostic, not
 * this one.
 */
function PartVsMachine({ s }: { s: Extract<DiagnosticSpatial, { kind: 'part-vs-machine' }> }) {
  const boundedX = s.feedAxis !== 'x';
  const boundedY = s.feedAxis !== 'y';
  const short = Math.min(s.partW, s.partH);
  const long = Math.max(s.partW, s.partH);

  // Orient the part the way the check itself reasons about it: on a single
  // fixed axis, the short side is the one that has to fit; with both axes
  // fixed, pick whichever orientation overhangs least, since the real fit
  // check already tried both and rejected both.
  let pw: number, ph: number;
  if (boundedX && boundedY) {
    const overhangAsIs = Math.max(0, s.partW - s.travelX) + Math.max(0, s.partH - s.travelY);
    const overhangSwapped = Math.max(0, s.partH - s.travelX) + Math.max(0, s.partW - s.travelY);
    [pw, ph] = overhangSwapped < overhangAsIs ? [s.partH, s.partW] : [s.partW, s.partH];
  } else if (boundedX) {
    [pw, ph] = [short, long];
  } else {
    [pw, ph] = [long, short];
  }

  const envW = boundedX ? s.travelX : pw;
  const envH = boundedY ? s.travelY : ph;
  const drawW = Math.max(pw, envW);
  const drawH = Math.max(ph, envH);
  const scale = Math.min((W - PAD * 2) / drawW, (H - PAD * 2 - 14) / drawH);
  const ox = PAD;
  const oy = H - PAD - 14;

  const x = (v: number) => ox + v * scale;
  const y = (v: number) => oy - v * scale;

  const overW = Math.max(0, pw - envW);
  const overH = Math.max(0, ph - envH);

  return (
    <Frame
      title={`Part ${s.partW.toFixed(0)} by ${s.partH.toFixed(0)} millimetres against ${s.travelX.toFixed(0)} by ${s.travelY.toFixed(0)} millimetres of travel`}
    >
      {/* the envelope: solid on a fixed axis, dashed and arrowed where it feeds */}
      <rect
        x={x(0)}
        y={y(envH)}
        width={envW * scale}
        height={envH * scale}
        fill="none"
        stroke={LINE}
        strokeWidth={1.5}
        strokeDasharray={boundedX && boundedY ? undefined : '4 3'}
      />
      {/* the part */}
      <rect
        x={x(0)}
        y={y(ph)}
        width={pw * scale}
        height={ph * scale}
        fill="rgb(230 180 83 / 10%)"
        stroke={MUTED}
        strokeWidth={1.25}
      />
      {/* the overhang, hatched */}
      {overW > 0 && (
        <rect
          x={x(envW)}
          y={y(ph)}
          width={overW * scale}
          height={ph * scale}
          fill={ERROR}
          fillOpacity={0.35}
        />
      )}
      {overH > 0 && (
        <rect
          x={x(0)}
          y={y(ph)}
          width={pw * scale}
          height={overH * scale}
          fill={ERROR}
          fillOpacity={0.35}
        />
      )}
      {!boundedX && (
        <text x={x(pw) + 3} y={y(ph / 2)} fill={MUTED} fontSize={8}>
          feeds →
        </text>
      )}
      {!boundedY && (
        <text x={x(pw / 2)} y={y(ph) - 3} fill={MUTED} fontSize={8} textAnchor="middle">
          feeds ↑
        </text>
      )}
      <text x={ox} y={H - 3} fill={MUTED} fontSize={9}>
        {s.travelX.toFixed(0)} × {s.travelY.toFixed(0)} mm travel
      </text>
    </Frame>
  );
}

/** The sheet's own content length, with a dashed line at every seam a re-setup needs. */
function SheetTiles({ s }: { s: Extract<DiagnosticSpatial, { kind: 'sheet-tiles' }> }) {
  const bandH = 34;
  const ox = PAD;
  const oy = 20;
  const scale = (W - PAD * 2) / s.length;
  const seams: number[] = [];
  for (let i = 1; i < s.tiles; i++) seams.push(i * s.step);

  return (
    <Frame title={`Sheet ${s.length.toFixed(0)} millimetres long, needing ${s.tiles} setups`}>
      <rect
        x={ox}
        y={oy}
        width={s.length * scale}
        height={bandH}
        fill="none"
        stroke={LINE}
        strokeWidth={1.5}
      />
      {seams.map((pos, i) => (
        <line
          key={i}
          x1={ox + pos * scale}
          y1={oy - 4}
          x2={ox + pos * scale}
          y2={oy + bandH + 4}
          stroke={WARN}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      ))}
      {Array.from({ length: s.tiles }, (_, i) => i).map((i) => {
        const from = i === 0 ? 0 : seams[i - 1]!;
        const to = i < seams.length ? seams[i]! : s.length;
        return (
          <text
            key={i}
            x={ox + ((from + to) / 2) * scale}
            y={oy + bandH / 2 + 3}
            fill={MUTED}
            fontSize={9}
            textAnchor="middle"
          >
            {i + 1}
          </text>
        );
      })}
      <text x={ox} y={oy + bandH + 18} fill={MUTED} fontSize={9}>
        {s.length.toFixed(0)} mm · {s.tiles} setups, {s.step.toFixed(0)} mm apart
      </text>
    </Frame>
  );
}

/** The shelf's own span, with the safe-to-40x-thickness limit marked and what runs past it shaded. */
function ShelfSpan({ s }: { s: Extract<DiagnosticSpatial, { kind: 'shelf-span' }> }) {
  const y = 40;
  const ox = PAD;
  const scale = (W - PAD * 2) / s.span;
  const limitX = ox + s.limit * scale;
  const endX = ox + s.span * scale;
  const sagY = y + 16;

  return (
    <Frame
      title={`Shelf spanning ${s.span.toFixed(0)} millimetres, safe to about ${s.limit.toFixed(0)}`}
    >
      {/* supports at either end */}
      <path d={`M${ox - 6},${y + 6} L${ox},${y - 6} L${ox + 6},${y + 6} Z`} fill={MUTED} />
      <path d={`M${endX - 6},${y + 6} L${endX},${y - 6} L${endX + 6},${y + 6} Z`} fill={MUTED} />
      {/* the safe run */}
      <line x1={ox} y1={y} x2={limitX} y2={y} stroke={MUTED} strokeWidth={2} />
      {/* what runs past the rule of thumb */}
      <line x1={limitX} y1={y} x2={endX} y2={y} stroke={WARN} strokeWidth={2} />
      <line x1={limitX} y1={y - 8} x2={limitX} y2={y + 8} stroke={WARN} strokeWidth={1.25} />
      {/* the sag it reads as */}
      <path
        d={`M${ox},${y} Q${(ox + endX) / 2},${sagY} ${endX},${y}`}
        fill="none"
        stroke={WARN}
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <text x={ox} y={y + 24} fill={MUTED} fontSize={9}>
        {s.span.toFixed(0)} mm span
      </text>
      <text x={limitX} y={y - 12} fill={WARN} fontSize={9} textAnchor="middle">
        ~{s.limit.toFixed(0)} mm safe
      </text>
    </Frame>
  );
}
