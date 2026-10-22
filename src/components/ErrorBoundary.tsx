// What a failure shows instead of an empty screen: what went wrong, and Reload.
import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  // (still an uncaught error for the page: the tests fail on one)
  componentDidCatch(error: Error) { setTimeout(() => { throw error; }); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-4" role="alert" data-testid="app-error">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h1 className="text-lg font-bold text-zinc-50">Something went wrong</h1>
          <pre className="mt-3 text-xs text-zinc-400 whitespace-pre-wrap break-words max-h-48 overflow-auto">{error.message}</pre>
          <button className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-zinc-950" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
