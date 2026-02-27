import {
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { NavLink } from "react-router-dom";

const mobileNavItems = [
  { to: "/today", label: "Hoy", icon: CalendarDaysIcon },
  { to: "/dashboard", label: "Inicio", icon: HomeIcon },
  { to: "/assignments", label: "Tareas", icon: ClipboardDocumentListIcon },
  { to: "/calendar", label: "Calendario", icon: CalendarDaysIcon },
  { to: "/settings", label: "Ajustes", icon: UserCircleIcon },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Navegacion rapida"
      className="fixed bottom-0 inset-x-0 z-30 flex border-t border-ink-200 bg-white/95 backdrop-blur-sm lg:hidden dark:border-ink-800 dark:bg-[var(--surface)]/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "flex flex-1 flex-col items-center justify-center py-3 text-xs font-semibold transition",
                isActive
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={clsx("mb-0.5 size-5", isActive && "scale-110")} />
                {item.label}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
