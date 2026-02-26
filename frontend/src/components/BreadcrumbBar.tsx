import { ChevronRightIcon, HomeIcon } from "@heroicons/react/24/outline";
import { Link, useLocation } from "react-router-dom";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  courses: "Materias",
  schedule: "Horario",
  assignments: "Tareas",
  exams: "Examenes",
  projects: "Proyectos",
  calendar: "Calendario",
  notifications: "Notificaciones",
  settings: "Ajustes",
};

export function BreadcrumbBar() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) {
    return null;
  }

  return (
    <nav
      aria-label="Ruta de navegacion"
      className="border-b border-ink-100 bg-ink-50/60 px-4 py-2 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/30 md:px-6"
    >
      <ol className="mx-auto flex max-w-7xl items-center gap-1">
        <li>
          <Link
            to="/dashboard"
            className="flex items-center text-ink-500 transition hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
            aria-label="Inicio"
          >
            <HomeIcon className="size-3.5" />
          </Link>
        </li>
        {segments.map((segment, index) => {
          const label = ROUTE_LABELS[segment] ?? segment;
          const isLast = index === segments.length - 1;
          const path = "/" + segments.slice(0, index + 1).join("/");

          return (
            <li key={path} className="flex items-center gap-1">
              <ChevronRightIcon className="size-3 text-ink-400 dark:text-ink-600" aria-hidden="true" />
              {isLast ? (
                <span className="text-xs font-semibold text-ink-800 dark:text-ink-200">
                  {label}
                </span>
              ) : (
                <Link
                  to={path}
                  className="text-xs font-semibold text-ink-500 transition hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
