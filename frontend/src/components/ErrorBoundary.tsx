import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

/**
 * React error boundary that catches unhandled render/lifecycle errors
 * and shows a friendly fallback UI instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
          <div className="text-5xl">💥</div>
          <h1 className="text-2xl font-bold text-slate-800">Algo salió mal</h1>
          <p className="max-w-md text-slate-500">
            Ocurrió un error inesperado en la aplicación. Puedes intentar recargar la página.
          </p>
          {this.state.error && (
            <pre className="max-w-lg overflow-auto rounded-lg bg-red-50 px-4 py-3 text-left text-xs text-red-700">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600"
          >
            Recargar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
