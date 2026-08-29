import { ParamPanel } from './components/ParamPanel';
import { Viewport3D } from './components/Viewport3D';
import { SheetView } from './components/SheetView';
import { PartView } from './components/PartView';
import { Diagnostics } from './components/Diagnostics';
import { ExportBar } from './components/ExportBar';
import { cabinetPositions } from '@cabgen/core';
import { useStore, type ViewTab } from './store';

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: '3d', label: 'Assembly' },
  { id: 'sheets', label: 'Sheets' },
  { id: 'parts', label: 'Parts' },
];

export function App() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const project = useStore((s) => s.project);

  const sheets = project.nest.sheets.length;
  const boards = project.stockNest.sheets.length;
  const cabinets = project.params.cabinets;
  // The run end to end, and the tallest stack in it: the two numbers someone
  // checks against the wall before they cut anything.
  const runWidth = cabinetPositions(cabinets).reduce((a, c) => a + c.w, 0);
  const height = Math.max(0, ...cabinets.map((c) => c.carcasses.reduce((a, k) => a + k.height, 0)));

  return (
    <div className="app">
      <header className="topbar">
        <h1>Cabinet CNC Generator</h1>
        <span className="badge">
          {cabinets.length > 1 ? `${cabinets.length} cabinets · ` : ''}
          {runWidth.toFixed(0)} × {height.toFixed(0)} mm · {project.parts.length} parts · {sheets}{' '}
          sheets{boards > 0 ? ` · ${boards} board${boards === 1 ? '' : 's'}` : ''}
        </span>
        <span className="spacer" />
        <ExportBar />
      </header>

      <div className="main">
        <ParamPanel />
        <div className="content">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="view-slot">
            {/* The 3D view stays mounted so its WebGL context survives tab switches. */}
            <Viewport3D hidden={tab !== '3d'} />
            {tab === 'sheets' && <SheetView />}
            {tab === 'parts' && <PartView />}
          </div>

          <Diagnostics />
        </div>
      </div>
    </div>
  );
}
