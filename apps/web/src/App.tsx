import { Viewport3D } from './components/Viewport3D';
import { OutputPack } from './components/OutputPack';
import { Inspector } from './components/Inspector';
import { RunStrip } from './components/RunStrip';
import { TopBar, useShortcuts } from './components/TopBar';
import { WorkshopDrawer } from './components/WorkshopDrawer';
import { CommandPalette } from './components/CommandPalette';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { StarterGallery } from './gallery/StarterGallery';
import { useStore } from './store';

/**
 * The bench.
 *
 * The cabinet is the surface, not a picture beside a form: it fills the window,
 * the run is drawn to scale along the bottom, and everything else floats over
 * it, appears because something is selected, or lives behind a door. See
 * docs/UX.md — this is architecture A, and the one it was chosen over is
 * written down there too.
 */
export function App() {
  const surface = useStore((s) => s.surface);
  const workshopOpen = useStore((s) => s.workshopOpen);
  const diagnosticsOpen = useStore((s) => s.diagnosticsOpen);
  const startersOpen = useStore((s) => s.startersOpen);
  useShortcuts();

  return (
    <div className="app">
      <TopBar />

      <div className="stage">
        {/* The 3D view stays mounted so its WebGL context survives a trip to
            the output pack and back. */}
        <Viewport3D hidden={surface !== 'bench'} />
        {surface === 'output' && <OutputPack />}

        {surface === 'bench' && <Inspector />}
        {diagnosticsOpen && <DiagnosticsPanel />}
        {workshopOpen && <WorkshopDrawer />}
        {startersOpen && <StarterGallery />}
      </div>

      {surface === 'bench' && <RunStrip />}
      <CommandPalette />
    </div>
  );
}
