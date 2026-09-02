import { Component, type ErrorInfo, type ReactNode } from 'react';
import { saveText } from '../download';
import { forgetAutosave, rawAutosave } from '../persistence';
import { useStore } from '../store';

/**
 * The last thing between a stray exception and somebody's afternoon.
 *
 * This tool has no server. An unhandled error in a render blanks the page, and
 * without this the design goes with it — which for a tool people spend an hour
 * in is the worst failure available, exactly as R-23 says.
 *
 * Two rules shape what is below. It renders nothing that could be what broke:
 * no geometry, no worker, no store subscription — only a `getState()` inside a
 * `try`, with the raw autosave behind it. And the offer has to be a *file*,
 * not a reassurance: the design is already autosaved, but if the autosaved
 * parameters are what crashed the app, reloading walks straight back into it,
 * so the first button writes the project out where nothing this app does
 * afterwards can reach it.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** The parameters, however they can be got at. */
function currentProjectJson(): string | null {
  try {
    return JSON.stringify(useStore.getState().params, null, 2);
  } catch {
    // The store is a plain object outside React, so this only fails if the
    // store itself is in a bad way — which is when the autosave is the more
    // trustworthy copy anyway.
    return rawAutosave();
  }
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only place a stack is any use, and losing it would
    // make this screen harder to act on than the blank page it replaces.
    console.error('Cabinet generator crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const json = currentProjectJson();
    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <h2>Something in the app broke.</h2>
          <p>
            Your design has not been touched. Save it to a file first — that copy is safe from
            whatever this is — then reload. The reload picks up where you left off, from the same
            autosave this browser has been keeping all along.
          </p>
          <div className="row">
            <button
              className="primary"
              disabled={json === null}
              onClick={() => saveText(json ?? '', 'cabinet-project.json', 'application/json')}
              title={
                json === null
                  ? 'Nothing recoverable was found in this browser.'
                  : 'Write the project out as a file'
              }
            >
              Save the design to a file
            </button>
            <button onClick={() => location.reload()}>Reload</button>
            <button
              title="Only if reloading lands straight back here. This throws the autosave away, so save the file first."
              onClick={() => {
                if (!confirm('Forget the autosaved design and start from the default?')) return;
                forgetAutosave();
                location.reload();
              }}
            >
              Start again
            </button>
          </div>
          <pre>{error.message || String(error)}</pre>
        </div>
      </div>
    );
  }
}
