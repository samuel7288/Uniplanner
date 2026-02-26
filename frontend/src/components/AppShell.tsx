import {
  Bars3Icon,
  BellIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  RectangleGroupIcon,
  SunIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { KeyboardEvent as ReactKeyboardEvent, PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useBrowserNotifications } from "../hooks/useBrowserNotifications";
import { useDebounce } from "../hooks/useDebounce";
import { api } from "../lib/api";
import type { DashboardSummary, SearchItem, SearchResponse } from "../lib/types";
import { BottomNav } from "./BottomNav";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { OnboardingTour } from "./OnboardingTour";
import { Button } from "./UI";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { to: "/courses", label: "Materias", icon: RectangleGroupIcon },
  { to: "/schedule", label: "Horario", icon: ClipboardDocumentListIcon },
  { to: "/assignments", label: "Tareas", icon: ClipboardDocumentListIcon },
  { to: "/exams", label: "Examenes", icon: ClipboardDocumentListIcon },
  { to: "/projects", label: "Proyectos", icon: RectangleGroupIcon },
  { to: "/calendar", label: "Calendario", icon: CalendarDaysIcon },
  { to: "/notifications", label: "Notificaciones", icon: BellIcon },
  { to: "/settings", label: "Ajustes", icon: UserCircleIcon },
];

const pageMeta = [
  { match: "/dashboard", title: "Panel Academico", subtitle: "Monitorea tus avances y riesgos de este semestre." },
  { match: "/courses", title: "Materias", subtitle: "Gestiona cursos, sesiones y evaluaciones por materia." },
  { match: "/schedule", title: "Horario Semanal", subtitle: "Visualiza clases por bloque de tiempo y dia." },
  { match: "/assignments", title: "Tareas", subtitle: "Prioriza entregas por estado, materia y fecha limite." },
  { match: "/exams", title: "Examenes", subtitle: "Organiza fechas clave y recordatorios por asignatura." },
  { match: "/projects", title: "Proyectos", subtitle: "Coordina milestones y flujo kanban sin perder contexto." },
  { match: "/calendar", title: "Calendario", subtitle: "Consolida clases, tareas y examenes en una sola vista." },
  { match: "/notifications", title: "Notificaciones", subtitle: "Revisa alertas pendientes y acciones recientes." },
  { match: "/settings", title: "Ajustes", subtitle: "Personaliza perfil, zona horaria y preferencias." },
];

const quickActions = [
  { to: "/assignments", label: "Nueva tarea" },
  { to: "/exams", label: "Nuevo examen" },
  { to: "/projects", label: "Nuevo proyecto" },
];

const ONBOARDING_DONE_KEY = "uniplanner_onboarding_done_v1";
const PUSH_SENT_KEY = "uniplanner_browser_push_sent_v1";

function entityLabel(type: SearchItem["entityType"]): string {
  if (type === "course") return "Materia";
  if (type === "assignment") return "Tarea";
  return "Examen";
}

function entityRoute(type: SearchItem["entityType"]): string {
  if (type === "course") return "/courses";
  if (type === "assignment") return "/assignments";
  return "/exams";
}

export function AppShell({ children }: PropsWithChildren) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "course" | "assignment" | "exam">("all");
  const [searchPage, setSearchPage] = useState(1);
  const [searchData, setSearchData] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query);

  const { user, logout } = useAuth();
  const { isDark, toggleDark, setDarkMode, preset, setPreset } = useTheme();
  const { canSend, notify, supported: browserPushSupported, permission: browserPushPermission, setEnabled: setBrowserPushEnabled } = useBrowserNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  const currentPage = useMemo(
    () =>
      pageMeta.find((item) => location.pathname === item.match || location.pathname.startsWith(`${item.match}/`)) ??
      pageMeta[0],
    [location.pathname],
  );

  const currentDate = useMemo(
    () =>
      new Intl.DateTimeFormat("es-ES", {
        weekday: "long",
        day: "2-digit",
        month: "short",
      }).format(new Date()),
    [],
  );

  useEffect(() => {
    async function fetchUnread() {
      try {
        const response = await api.get<{ unreadCount: number }>("/notifications/unread-count");
        setUnreadCount(response.data.unreadCount);
      } catch {
        setUnreadCount(0);
      }
    }

    void fetchUnread();
    const id = window.setInterval(fetchUnread, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setPaletteOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    if (typeof user.darkModePref === "boolean" && user.darkModePref !== isDark) {
      setDarkMode(user.darkModePref);
    }
    if (user.themePreset && user.themePreset !== preset) {
      setPreset(user.themePreset);
    }
  }, [isDark, preset, setDarkMode, setPreset, user]);

  useEffect(() => {
    if (!user || !browserPushSupported) return;
    if (typeof user.browserPushEnabled !== "boolean") return;

    if (user.browserPushEnabled && browserPushPermission === "default") return;
    setBrowserPushEnabled(user.browserPushEnabled);
  }, [browserPushPermission, browserPushSupported, setBrowserPushEnabled, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(ONBOARDING_DONE_KEY) === "true") return;
    setOnboardingOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const id = window.setTimeout(() => paletteInputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [paletteOpen]);

  useEffect(() => {
    setSearchPage(1);
  }, [debouncedQuery, searchType]);

  useEffect(() => {
    setActiveResultIndex(0);
  }, [searchData?.items.length, searchPage, searchType]);

  useEffect(() => {
    if (!paletteOpen || !debouncedQuery || debouncedQuery.length < 2) {
      setSearchData(null);
      return;
    }

    let active = true;

    async function runSearch() {
      setSearchLoading(true);
      try {
        const response = await api.get<SearchResponse>("/search", {
          params: {
            q: debouncedQuery,
            type: searchType,
            page: searchPage,
            limit: 8,
            sortBy: "updatedAt",
            sortDir: "desc",
          },
        });
        if (active) setSearchData(response.data);
      } catch {
        if (active) setSearchData(null);
      } finally {
        if (active) setSearchLoading(false);
      }
    }

    void runSearch();

    return () => {
      active = false;
    };
  }, [paletteOpen, debouncedQuery, searchType, searchPage]);

  useEffect(() => {
    if (!canSend) return;

    const readStore = (): Record<string, number> => {
      try {
        const raw = localStorage.getItem(PUSH_SENT_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as Record<string, number>;
      } catch {
        return {};
      }
    };

    const saveStore = (store: Record<string, number>) => {
      localStorage.setItem(PUSH_SENT_KEY, JSON.stringify(store));
    };

    async function checkAndSend() {
      const now = Date.now();
      const store = readStore();
      const compactStore = Object.fromEntries(
        Object.entries(store).filter(([, sentAt]) => now - sentAt < 48 * 60 * 60 * 1000),
      );

      const summaryResponse = await api.get<DashboardSummary>("/dashboard/summary");
      const summary = summaryResponse.data;

      const candidates: Array<{
        id: string;
        title: string;
        body: string;
        route: string;
        thresholdMs: number;
        eventDate: string;
      }> = [
        ...summary.upcomingExams.map((exam) => ({
          id: `exam-${exam.id}`,
          title: "Examen proximo",
          body: `${exam.title} - ${exam.course?.name || "Sin materia"}`,
          route: "/exams",
          thresholdMs: 24 * 60 * 60 * 1000,
          eventDate: exam.dateTime,
        })),
        ...summary.focusTasks.map((task) => ({
          id: `assignment-${task.id}`,
          title: "Tarea por vencer",
          body: `${task.title} - ${task.course?.name || "Sin materia"}`,
          route: "/assignments",
          thresholdMs: 12 * 60 * 60 * 1000,
          eventDate: task.dueDate,
        })),
      ];

      for (const item of candidates) {
        const eventMs = new Date(item.eventDate).getTime();
        if (!Number.isFinite(eventMs)) continue;

        const msUntil = eventMs - now;
        if (msUntil <= 0 || msUntil > item.thresholdMs) continue;

        const alreadySentAt = compactStore[item.id];
        if (alreadySentAt && now - alreadySentAt < 6 * 60 * 60 * 1000) continue;

        const notification = notify(item.title, {
          body: item.body,
          tag: item.id,
        });
        if (notification) {
          notification.onclick = () => {
            window.focus();
            navigate(item.route);
          };
          compactStore[item.id] = now;
        }
      }

      saveStore(compactStore);
    }

    void checkAndSend();
    const intervalId = window.setInterval(() => {
      void checkAndSend();
    }, 2 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [canSend, navigate, notify]);

  function openResult(item: SearchItem) {
    navigate(entityRoute(item.entityType));
    setPaletteOpen(false);
  }

  function onPaletteInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const items = searchData?.items ?? [];
    if (!items.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((prev) => Math.min(items.length - 1, prev + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openResult(items[activeResultIndex]);
    }
  }

  function closeOnboarding() {
    setOnboardingOpen(false);
    localStorage.setItem(ONBOARDING_DONE_KEY, "true");
  }

  return (
    <div className="relative min-h-screen lg:flex">
      {/* Skip to content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-xl focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-panel"
      >
        Saltar al contenido
      </a>

      {/* Mobile hamburger */}
      <button
        type="button"
        className="fixed left-3 top-3 z-50 rounded-xl border border-ink-200 bg-white/95 p-2 shadow-soft transition hover:bg-ink-50 lg:hidden dark:border-ink-700 dark:bg-[var(--surface)]/95 dark:text-ink-300"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label="Mostrar navegacion"
      >
        {isSidebarOpen ? <XMarkIcon className="size-5 text-ink-700 dark:text-ink-300" /> : <Bars3Icon className="size-5 text-ink-700 dark:text-ink-300" />}
      </button>

      {/* Sidebar backdrop */}
      <div
        className={clsx("fixed inset-0 z-30 bg-[#0f2439]/40 backdrop-blur-sm lg:hidden dark:bg-black/60", isSidebarOpen ? "block" : "hidden")}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-[19rem] border-r border-ink-200 bg-gradient-to-b from-[#f8fbff]/95 to-[#eef4ff]/90 p-5 backdrop-blur transition-transform lg:static lg:w-80 lg:translate-x-0 dark:border-ink-800 dark:from-ink-900/95 dark:to-ink-950/90",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link to="/dashboard" className="mb-6 inline-flex items-center gap-2">
          <span className="rounded-xl bg-brand-100 px-2.5 py-1.5 font-mono text-xs font-semibold uppercase text-brand-700 dark:bg-brand-700/30 dark:text-brand-400">UP</span>
          <span className="font-display text-xl font-semibold text-ink-900 dark:text-ink-100">UniPlanner</span>
        </Link>

        <div className="mb-6 rounded-2xl border border-brand-100 bg-white/85 p-3 shadow-soft dark:border-ink-700 dark:bg-[var(--surface-soft)]/80">
          <p className="text-xs uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">Cuenta activa</p>
          <p className="mt-1 font-semibold text-ink-800 dark:text-ink-200">{user?.name}</p>
          <p className="text-xs text-ink-500 dark:text-ink-400">{user?.email}</p>
        </div>

        <nav className="space-y-1.5" role="navigation" aria-label="Navegacion principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                    isActive
                      ? "bg-brand-600 text-white shadow-soft dark:bg-brand-700"
                      : "text-ink-700 hover:bg-white/80 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-100",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="size-5 shrink-0" />
                    {item.label}
                    {item.to === "/notifications" && unreadCount > 0 && (
                      <span className="ml-auto rounded-full bg-danger-500 px-2 py-0.5 text-[0.63rem] text-white">
                        {unreadCount}
                      </span>
                    )}
                    {isActive && <span className="sr-only">(pagina actual)</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-ink-200/80 bg-white/80 px-4 py-3 backdrop-blur md:px-6 dark:border-ink-800/80 dark:bg-[var(--surface)]/80">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
                {currentDate}
              </p>
              <h1 className="font-display text-xl font-semibold text-ink-900 dark:text-ink-100 md:text-2xl">
                {currentPage.title}
              </h1>
              <p className="text-xs text-ink-600 dark:text-ink-400 md:text-sm">{currentPage.subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 transition hover:border-brand-200 hover:bg-brand-50/60 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300 dark:hover:border-brand-700/50 dark:hover:bg-brand-700/10"
                aria-label="Abrir busqueda global"
              >
                <MagnifyingGlassIcon className="size-4" />
                Buscar o navegar
                <span className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[0.64rem] dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400">
                  Ctrl K
                </span>
              </button>

              <div className="hidden items-center gap-1 lg:flex">
                {quickActions.map((action) => (
                  <Link key={action.to} to={action.to}>
                    <Button type="button" variant="subtle" size="sm">
                      {action.label}
                    </Button>
                  </Link>
                ))}
              </div>

              {/* Dark mode toggle */}
              <button
                type="button"
                onClick={toggleDark}
                className="rounded-xl border border-ink-200 bg-white p-2 text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300 dark:hover:bg-ink-800"
                aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              >
                {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
              </button>

              {/* Notifications bell */}
              <Link
                to="/notifications"
                className="relative rounded-xl border border-ink-200 bg-white p-2 text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300 dark:hover:bg-ink-800"
                aria-label="Abrir notificaciones"
              >
                <BellIcon className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-danger-500 px-1 text-[11px] text-white">
                    {unreadCount}
                  </span>
                )}
              </Link>

              <Button type="button" variant="ghost" onClick={() => void logout()}>
                Salir
              </Button>
            </div>
          </div>
        </header>

        {/* Breadcrumb */}
        <BreadcrumbBar />

        {/* Main */}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-20 md:px-6 lg:pb-6"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="page-enter"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10, filter: "blur(2px)" }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={prefersReducedMotion ? {} : { opacity: 0, y: -8, filter: "blur(2px)" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav */}
        <BottomNav />
      </div>

      {/* Search palette */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0f2439]/45 p-4 backdrop-blur-sm dark:bg-black/60 md:p-8"
          role="presentation"
          onClick={() => setPaletteOpen(false)}
        >
          <section
            className="mx-auto flex h-[min(80vh,760px)] w-full max-w-3xl flex-col rounded-3xl border border-ink-200 bg-white shadow-panel dark:border-ink-700 dark:bg-[var(--surface)]"
            role="dialog"
            aria-modal="true"
            aria-label="Busqueda global"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-ink-200 p-4 dark:border-ink-700">
              <MagnifyingGlassIcon className="size-5 text-ink-500 dark:text-ink-400" />
              <input
                ref={paletteInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onPaletteInputKeyDown}
                placeholder="Busca materias, tareas o examenes..."
                className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-500 dark:text-ink-100 dark:placeholder:text-ink-500"
                aria-label="Buscar en UniPlanner"
              />
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="rounded-lg border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-500 dark:border-ink-700 dark:text-ink-400"
              >
                ESC
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-2 dark:border-ink-700">
              <select
                className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs text-ink-700 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300"
                value={searchType}
                onChange={(event) => setSearchType(event.target.value as "all" | "course" | "assignment" | "exam")}
              >
                <option value="all">Todo</option>
                <option value="course">Materias</option>
                <option value="assignment">Tareas</option>
                <option value="exam">Examenes</option>
              </select>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                <span className="font-semibold text-ink-700 dark:text-ink-300">Atajos:</span> flechas para navegar, enter para abrir
              </p>
            </div>

            <div className="flex-1 overflow-auto p-3">
              {query.length < 2 && (
                <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 p-6 text-center dark:border-ink-700 dark:bg-ink-800/30">
                  <p className="font-display text-lg font-semibold text-ink-800 dark:text-ink-200">Busqueda global</p>
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">Escribe al menos 2 caracteres para iniciar.</p>
                </div>
              )}

              {query.length >= 2 && searchLoading && (
                <div className="space-y-2">
                  <div className="h-14 animate-pulse-soft rounded-xl bg-ink-100 dark:bg-ink-800" />
                  <div className="h-14 animate-pulse-soft rounded-xl bg-ink-100 dark:bg-ink-800" />
                  <div className="h-14 animate-pulse-soft rounded-xl bg-ink-100 dark:bg-ink-800" />
                </div>
              )}

              {!searchLoading && searchData && searchData.items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 p-6 text-center dark:border-ink-700 dark:bg-ink-800/30">
                  <p className="font-display text-lg font-semibold text-ink-800 dark:text-ink-200">Sin resultados</p>
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">Prueba otro termino o cambia el filtro de tipo.</p>
                </div>
              )}

              {!searchLoading &&
                searchData &&
                searchData.items.map((item, index) => (
                  <button
                    key={`${item.entityType}-${item.id}`}
                    type="button"
                    className={clsx(
                      "mb-2 flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left transition",
                      activeResultIndex === index
                        ? "border-brand-200 bg-brand-50/70 dark:border-brand-700/50 dark:bg-brand-700/15"
                        : "border-transparent bg-white hover:border-ink-200 hover:bg-ink-50/70 dark:bg-transparent dark:hover:border-ink-700 dark:hover:bg-ink-800/50",
                    )}
                    onMouseEnter={() => setActiveResultIndex(index)}
                    onClick={() => openResult(item)}
                  >
                    <div>
                      <p className="font-semibold text-ink-800 dark:text-ink-200">
                        {entityLabel(item.entityType)}: {item.title}
                      </p>
                      <p className="text-xs text-ink-600 dark:text-ink-400">{item.subtitle}</p>
                    </div>
                    <span className="rounded-full border border-ink-200 px-2 py-0.5 text-[0.64rem] uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400">
                      {item.entityType}
                    </span>
                  </button>
                ))}
            </div>

            {searchData && searchData.items.length > 0 && (
              <div className="flex items-center justify-between border-t border-ink-200 px-4 py-2 dark:border-ink-700">
                <p className="text-xs text-ink-600 dark:text-ink-400">
                  Pagina {searchData.pagination.page} de {Math.max(1, searchData.pagination.totalPages)} | {searchData.counts.total} resultados
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!searchData.pagination.hasPrev}
                    onClick={() => setSearchPage((prev) => Math.max(1, prev - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!searchData.pagination.hasNext}
                    onClick={() => setSearchPage((prev) => prev + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* aria-live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="page-announcer" />

      <OnboardingTour
        open={onboardingOpen}
        step={onboardingStep}
        onNext={() => setOnboardingStep((prev) => Math.min(2, prev + 1))}
        onPrev={() => setOnboardingStep((prev) => Math.max(0, prev - 1))}
        onClose={closeOnboarding}
      />
    </div>
  );
}
