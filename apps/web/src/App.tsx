import { ParamPanel } from './components/ParamPanel';
import { Viewport3D } from './components/Viewport3D';
import { SheetView } from './components/SheetView';
import { PartView } from './components/PartView';
import { Diagnostics } from './components/Diagnostics';
import { ExportBar } from './components/ExportBar';
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
  const height =
    project.params.base.height + project.params.top.height;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Cabinet CNC Generator</h1>
        <span className="badge">
          {project.params.base.width} × {height} mm · {project.parts.length} parts · {sheets} sheets
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
