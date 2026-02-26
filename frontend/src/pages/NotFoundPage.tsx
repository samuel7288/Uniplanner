import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border border-ink-200 bg-white/95 p-8 text-center shadow-panel">
        <h1 className="font-display text-3xl font-semibold text-ink-900">404</h1>
        <p className="mt-2 text-ink-600">Pagina no encontrada.</p>
        <Link className="mt-5 inline-block rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" to="/dashboard">
          Ir al dashboard
        </Link>
      </div>
    </div>
  );
}
