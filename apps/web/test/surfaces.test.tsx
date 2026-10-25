import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AtMachine } from '../src/components/AtMachine';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ExportPreview } from '../src/components/ExportPreview';
import { RunStrip } from '../src/components/RunStrip';
import { useStore } from '../src/store';
import { exportableParams, resetStore, settled } from './setup/harness';
import { saveBlob, saveText } from '../src/download';
import { PartView } from '../src/components/PartView';
import { exportProject } from '@cabgen/core';

// Nothing in jsdom can receive a download; what matters is whether one was asked for.
vi.mock('../src/download', async (original) => ({
  ...(await original<typeof import('../src/download')>()),
  saveBlob: vi.fn(),
  saveText: vi.fn(),
}));

/**
 * The surfaces either side of the bench: the run drawn to scale along the
 * bottom, the beat before real material is committed, the view meant to be
 * read standing at the machine, and what is left when a render throws.
 */

beforeEach(() => resetStore());

describe('the run strip', () => {
  it('is the project drawn out, and clicking a bay selects that bay', async () => {
    render(<RunStrip />);
    // A bay produces no part of its own, so this is the only place in the
    // shell that can name one — which is why the strip draws them.
    await userEvent.click(screen.getByRole('button', { name: 'Base, bay 2' }));
    expect(useStore.getState().selection).toEqual({
      kind: 'bay',
      cabinetId: 'C1',
      carcassId: 'B',
      bay: 1,
    });
  });

  it('grows a column when a cabinet is added to the run', async () => {
    render(<RunStrip />);
    expect(useStore.getState().params.cabinets.length).toBe(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add a cabinet to the end of the run' }),
    );
    // A type, not a blank box: a new cabinet starts from base, wall, tall or
    // stacked, each shown as what it produces rather than named in a menu.
    await userEvent.click(screen.getByRole('button', { name: /Wall/ }));
    await settled();
    expect(useStore.getState().params.cabinets.length).toBe(2);
  });
});

describe('the export preview', () => {
  it('shows what is about to be produced before anything is downloaded', async () => {
    await resetStore(exportableParams());
    act(() => useStore.setState({ exportPreviewOpen: true }));
    render(<ExportPreview />);

    const dialog = screen.getByRole('dialog', { name: 'Export preview' });
    expect(within(dialog).getByText('About to cut')).toBeTruthy();
    // Every sheet the zip will carry, named the way the file will be.
    const project = useStore.getState().project;
    expect(project.nest.sheets.length).toBeGreaterThan(0);
    expect(within(dialog).getByText(new RegExp(`${project.parts.length} parts`))).toBeTruthy();
    expect(
      within(dialog).getByText(new RegExp(`${project.assembly.steps.length} assembly steps`)),
    ).toBeTruthy();
  });

  it('backs out without writing anything', async () => {
    await resetStore(exportableParams());
    act(() => useStore.setState({ exportPreviewOpen: true }));
    render(<ExportPreview />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the design' }));
    expect(useStore.getState().exportPreviewOpen).toBe(false);
  });

  it("reads out the export's own instructions, the same ones the zip carries", async () => {
    // How to set the tiles up, when to turn a sheet over, which hole was left
    // off a seam: before this, every one of them was computed and thrown away,
    // so a zip could arrive missing a hinge hole with nothing to say so.
    await resetStore(exportableParams());
    act(() => useStore.setState({ exportPreviewOpen: true }));
    render(<ExportPreview />);
    const bundle = exportProject(useStore.getState().project);
    expect(bundle.warnings.length).toBeGreaterThan(0);
    const dialog = screen.getByRole('dialog', { name: 'Export preview' });
    expect(within(dialog).getByRole('heading', { name: 'Before you cut' })).toBeTruthy();
    for (const w of bundle.warnings) expect(within(dialog).getByText(w)).toBeTruthy();
    const txt = bundle.files.find((f) => f.name.endsWith('-before-you-cut.txt'))!;
    for (const w of bundle.warnings) expect(txt.dxf).toContain(w);
    expect(within(dialog).getByText(txt.name)).toBeTruthy();
  });

  it('downloads the zip when the design is still cuttable', async () => {
    await resetStore(exportableParams());
    vi.mocked(saveBlob).mockClear();
    act(() => useStore.setState({ exportPreviewOpen: true }));
    render(<ExportPreview />);
    await userEvent.click(screen.getByRole('button', { name: 'Download the zip' }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveBlob).mock.calls[0]![1]).toMatch(/-cnc\.zip$/);
  });

  it('will not download a design that stopped being cuttable while it was open', async () => {
    // The top bar checks only when it opens this, and an undo still works
    // while it is up. Undo back into a blocked design and the button must
    // not write the zip regardless.
    await resetStore(exportableParams());
    vi.mocked(saveBlob).mockClear();
    act(() => useStore.setState({ exportPreviewOpen: true }));
    render(<ExportPreview />);
    act(() => useStore.getState().load(useStore.getState().params));
    await act(async () => {
      useStore.getState().update((p) => {
        for (const m of p.materials) m.sheets = [{ length: 2440, width: 1220 }];
      });
    });
    await settled();
    expect(useStore.getState().project.diagnostics.some((d) => d.severity === 'error')).toBe(true);

    const dialog = screen.getByRole('dialog', { name: 'Export preview' });
    expect(within(dialog).getByRole('status').textContent).toContain('blocking problem');
    await userEvent.click(within(dialog).getByRole('button', { name: 'See what is blocking it' }));
    expect(saveBlob).not.toHaveBeenCalled();
    expect(useStore.getState().diagnosticsOpen).toBe(true);
    expect(useStore.getState().exportPreviewOpen).toBe(false);
  });

  it('will not download a drawing older than the design', async () => {
    await resetStore(exportableParams());
    vi.mocked(saveBlob).mockClear();
    act(() => useStore.setState({ exportPreviewOpen: true }));
    render(<ExportPreview />);
    act(() =>
      useStore.setState({ buildError: 'The design could not be built: the divider fell over' }),
    );
    expect(screen.getByRole('status').textContent).toContain('older than the design');
    await userEvent.click(screen.getByRole('button', { name: 'See what is blocking it' }));
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

describe("one part's own DXF", () => {
  it('downloads the part when the drawing is current', async () => {
    await resetStore();
    vi.mocked(saveText).mockClear();
    render(<PartView />);
    await userEvent.click(screen.getByRole('button', { name: "Download this part's DXF" }));
    expect(saveText).toHaveBeenCalledTimes(1);
  });

  it('will not download a drawing older than the design', async () => {
    // The re-cut of a ruined panel is exactly when nobody re-reads the top
    // bar: a stale part here would be cut to yesterday's numbers.
    await resetStore();
    vi.mocked(saveText).mockClear();
    act(() =>
      useStore.setState({ buildError: 'The design could not be built: the divider fell over' }),
    );
    render(<PartView />);
    await userEvent.click(screen.getByRole('button', { name: "Download this part's DXF" }));
    expect(saveText).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('older than the design');
  });
});

describe('at the machine', () => {
  it('ticks a part off the cut list and keeps it ticked', async () => {
    act(() => useStore.setState({ atMachine: true }));
    render(<AtMachine />);
    const first = screen.getAllByRole('checkbox')[0]!;
    await userEvent.click(first);
    expect(useStore.getState().machineProgress.cut.length).toBe(1);
  });

  /**
   * Part ids are structural (`C1-B-SIDE-L`), not content-hashed, so the same
   * id names a different blank once an edit resizes it. Carrying yesterday's
   * checkmarks onto today's parts is the paperwork version of the silently
   * wrong cabinet: panels ticked as cut that were never cut.
   */
  it('reads a changed cut list as a fresh job rather than reusing the ticks', async () => {
    act(() => useStore.setState({ atMachine: true }));
    render(<AtMachine />);
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(
      screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked).length,
    ).toBe(1);

    act(() => {
      useStore.getState().update((p) => {
        p.cabinets[0]!.carcasses[0]!.dividerCount = 0;
        p.cabinets[0]!.carcasses[0]!.bays = p.cabinets[0]!.carcasses[0]!.bays.slice(0, 1);
      });
    });
    await settled();

    await waitFor(() => {
      const checked = screen
        .getAllByRole('checkbox')
        .filter((c) => (c as HTMLInputElement).checked);
      expect(checked.length).toBe(0);
    });
  });
});

/** Something that throws on render, the way a real bug in a panel would. */
function Broken(): never {
  throw new Error('the divider fell over');
}

describe('when a render throws', () => {
  it('offers the design as a file before it offers a reload', () => {
    // The boundary logs the stack on purpose; React also logs the error
    // itself. Neither is the thing under test and both would drown the run.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    consoleError.mockRestore();

    const alert = screen.getByRole('alert');
    const buttons = within(alert)
      .getAllByRole('button')
      .map((b) => b.textContent);
    // The order is the argument: if the autosaved parameters are what crashed
    // the app, reloading walks straight back into the crash, so saving the
    // file has to come first.
    expect(buttons).toEqual(['Save the design to a file', 'Reload', 'Start again']);
    expect(within(alert).getByText('the divider fell over')).toBeTruthy();
  });
});
