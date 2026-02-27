import { Bars3BottomLeftIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../lib/api";
import { exportToPDF, getCurrentSemesterLabel } from "../utils/exportPDF";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageTitle,
  ScheduleSkeleton,
} from "../components/UI";

type WeeklySession = {
  id: string;
  courseId: string;
  courseName: string;
  code: string;
  color?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  modality: "PRESENTIAL" | "ONLINE";
};

const dayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

type ViewMode = "expanded" | "compact";

function parseTime(input: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = input.split(":");
  return { hour: Number(hourRaw) || 0, minute: Number(minuteRaw) || 0 };
}

function toTimeString(hour: number, minute = 0): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

function durationMinutes(start: string, end: string): number {
  const startParts = parseTime(start);
  const endParts = parseTime(end);
  return Math.max(
    30,
    endParts.hour * 60 + endParts.minute - (startParts.hour * 60 + startParts.minute),
  );
}

export function SchedulePage() {
  const [sessions, setSessions] = useState<WeeklySession[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("expanded");
  const [draggingId, setDraggingId] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const scheduleExportRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date().getDay(), []);
  const [mobileDay, setMobileDay] = useState(today);
  const currentHour = useMemo(() => new Date().getHours(), []);
  const hours = useMemo(() => Array.from({ length: 14 }, (_, index) => index + 7), []);
  const mobileSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.dayOfWeek === mobileDay)
        .sort((a, b) => {
          const first = parseTime(a.startTime);
          const second = parseTime(b.startTime);
          return first.hour * 60 + first.minute - (second.hour * 60 + second.minute);
        }),
    [mobileDay, sessions],
  );

  async function load() {
    setLoading(true);
    const response = await api.get<{ schedule: WeeklySession[] }>("/courses/schedule/weekly");
    setSessions(response.data.schedule);
    setLoading(false);
  }

  useEffect(() => {
    void load().catch((err) => {
      setLoading(false);
      setError(getErrorMessage(err));
    });
  }, []);

  function findSession(day: number, hour: number): WeeklySession | undefined {
    return sessions.find((session) => {
      const start = parseTime(session.startTime);
      return session.dayOfWeek === day && start.hour === hour;
    });
  }

  async function moveSession(sessionId: string, nextDay: number, nextHour: number) {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) return;

    const duration = durationMinutes(target.startTime, target.endTime);
    const nextStartMinutes = nextHour * 60;
    const nextEndMinutes = nextStartMinutes + duration;
    const endHour = Math.floor(nextEndMinutes / 60);
    const endMinute = nextEndMinutes % 60;

    if (endHour > 23 || (endHour === 23 && endMinute > 30)) {
      toast.error("El bloque no cabe en ese horario");
      return;
    }

    setUpdatingId(sessionId);
    setError("");
    try {
      await api.put(`/courses/class-sessions/${sessionId}`, {
        dayOfWeek: nextDay,
        startTime: toTimeString(nextHour, 0),
        endTime: toTimeString(endHour, endMinute),
        room: target.room ?? null,
        modality: target.modality,
      });
      await load();
      toast.success("Sesion reprogramada");
    } catch (err) {
      setError(getErrorMessage(err));
      toast.error("No se pudo reprogramar la sesion");
    } finally {
      setUpdatingId("");
    }
  }

  function onCellDrop(event: DragEvent<HTMLTableCellElement>, day: number, hour: number) {
    event.preventDefault();
    const sessionId = event.dataTransfer.getData("text/session-id") || draggingId;
    setDraggingId("");
    if (!sessionId) return;
    void moveSession(sessionId, day, hour);
  }

  async function handleExportPdf() {
    const target = scheduleExportRef.current;
    if (!target) return;

    setExportingPdf(true);
    setError("");
    try {
      await exportToPDF(target, `horario-${getCurrentSemesterLabel()}.pdf`);
      toast.success("PDF generado");
    } catch (err) {
      setError(getErrorMessage(err));
      toast.error("No se pudo generar el PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageTitle
          overline="Planner"
          title="Mi horario semanal"
          subtitle="Vista por bloques horarios para clases presenciales y online."
        />
        <ScheduleSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Planner"
        title="Mi horario semanal"
        subtitle="Arrastra bloques para reprogramar sesiones y alterna vista compacta/expandida."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1 dark:border-ink-700 dark:bg-[var(--surface)]">
              <button
                type="button"
                onClick={() => setViewMode("compact")}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  viewMode === "compact"
                    ? "bg-brand-600 text-white"
                    : "text-ink-600 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800",
                )}
              >
                Compacta
              </button>
              <button
                type="button"
                onClick={() => setViewMode("expanded")}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  viewMode === "expanded"
                    ? "bg-brand-600 text-white"
                    : "text-ink-600 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800",
                )}
              >
                Expandida
              </button>
            </div>
            <Button type="button" size="sm" onClick={() => void handleExportPdf()} disabled={exportingPdf || loading}>
              {exportingPdf ? "Generando PDF..." : "Exportar PDF"}
            </Button>
          </div>
        }
      />

      {error && <Alert tone="error" message={error} />}

      <div ref={scheduleExportRef} className="space-y-6">
      <div className="space-y-3 md:hidden">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dayLabels.map((label, dayIndex) => (
            <button
              key={label}
              type="button"
              onClick={() => setMobileDay(dayIndex)}
              className={clsx(
                "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                mobileDay === dayIndex
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-700/20 dark:text-brand-300"
                  : "border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300",
              )}
            >
              {label}
              {dayIndex === today && <span className="ml-1 text-[0.65rem] text-brand-500 dark:text-brand-400">hoy</span>}
            </button>
          ))}
        </div>
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
              {dayLabels[mobileDay]}
            </h2>
            <Badge tone="brand">{mobileSessions.length} bloques</Badge>
          </div>

          {mobileSessions.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                context="schedule"
                title="Sin sesiones para este dia"
                description="Selecciona otro dia o agrega bloques desde la pagina de Materias."
              />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {mobileSessions.map((session) => (
                <article
                  key={session.id}
                  className="rounded-xl border border-ink-200 bg-white/85 p-3 dark:border-ink-700 dark:bg-[var(--surface)]/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink-900 dark:text-ink-100">{session.courseName}</p>
                      <p className="text-xs text-ink-600 dark:text-ink-400">
                        {session.startTime} - {session.endTime}
                      </p>
                    </div>
                    <Badge tone={session.modality === "ONLINE" ? "brand" : "success"}>
                      {session.room || session.modality}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{session.code}</p>
                </article>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
            Vista mobile por dia. Para reprogramar bloques usa la tabla semanal en desktop/tablet.
          </p>
        </Card>
      </div>

      <Card className="hidden p-0 md:block">
        <div className="flex items-center justify-end border-b border-ink-200 px-3 py-2 text-xs text-ink-500 dark:border-ink-700 dark:text-ink-400 xl:hidden">
          Desliza horizontalmente para ver toda la semana
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr className="sticky top-0 z-10 text-left text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
                <th className="border border-ink-200 bg-[var(--surface-soft)] px-3 py-2 dark:border-ink-700 dark:bg-ink-900/50">
                  Hora
                </th>
                {dayLabels.map((label, dayIndex) => (
                  <th
                    key={label}
                    className={clsx(
                      "border border-ink-200 px-3 py-2 dark:border-ink-700",
                      dayIndex === today
                        ? "bg-brand-50/60 font-bold text-brand-700 dark:bg-brand-700/10 dark:text-brand-400"
                        : "bg-[var(--surface-soft)] dark:bg-ink-900/50",
                    )}
                  >
                    {label}
                    {dayIndex === today && (
                      <span className="ml-1 text-[0.6rem] font-normal text-brand-500 dark:text-brand-400">
                        hoy
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((hour) => (
                <tr
                  key={hour}
                  className={clsx(
                    "align-top",
                    hour === currentHour && "border-l-2 border-l-brand-400 dark:border-l-brand-500",
                  )}
                >
                  <td
                    className={clsx(
                      "border border-ink-200 px-3 py-3 text-sm font-semibold text-ink-600 dark:border-ink-700 dark:text-ink-400",
                      hour === currentHour &&
                        "bg-brand-50/40 text-brand-700 dark:bg-brand-700/10 dark:text-brand-400",
                    )}
                  >
                    {`${hour}:00`}
                  </td>
                  {dayLabels.map((_, dayIndex) => {
                    const session = findSession(dayIndex, hour);
                    const isDropTarget = Boolean(draggingId);
                    return (
                      <td
                        key={`${dayIndex}-${hour}`}
                        onDragOver={(event) => {
                          if (isDropTarget) event.preventDefault();
                        }}
                        onDrop={(event) => onCellDrop(event, dayIndex, hour)}
                        className={clsx(
                          viewMode === "compact" ? "h-14" : "h-20",
                          "border border-ink-200 px-2 py-2 text-sm transition dark:border-ink-700",
                          !session && "hover:bg-brand-50/20 dark:hover:bg-brand-700/5",
                          dayIndex === today && !session && "bg-brand-50/20 dark:bg-brand-700/5",
                          isDropTarget &&
                            !session &&
                            "ring-1 ring-inset ring-brand-200 dark:ring-brand-700/50",
                        )}
                      >
                        {session ? (
                          <div className="group relative h-full">
                            <div
                              draggable
                              onDragStart={(event) => {
                                setDraggingId(session.id);
                                event.dataTransfer.setData("text/session-id", session.id);
                              }}
                              onDragEnd={() => setDraggingId("")}
                              className={clsx(
                                "relative h-full cursor-grab rounded-xl p-2.5 text-white shadow-soft transition hover:opacity-95 active:cursor-grabbing",
                                updatingId === session.id && "animate-pulse-soft opacity-70",
                              )}
                              style={{ backgroundColor: session.color || "#2563eb" }}
                              title="Arrastra para mover esta sesion"
                              aria-label={`Sesion ${session.courseName} ${session.startTime}-${session.endTime}`}
                            >
                              <span className="pointer-events-none absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-70">
                                <Bars3BottomLeftIcon className="size-3 text-white/90" aria-hidden="true" />
                              </span>
                              <p className={clsx("font-semibold leading-tight", viewMode === "compact" ? "text-xs" : "text-sm")}>
                                {viewMode === "compact" ? session.code : session.courseName}
                              </p>
                              {viewMode === "expanded" && (
                                <>
                                  <p className="mt-1 text-xs opacity-90">
                                    {session.startTime} - {session.endTime}
                                  </p>
                                  <p className="text-xs opacity-75">{session.room || session.modality}</p>
                                </>
                              )}
                            </div>

                            <div className="pointer-events-none absolute -top-2 left-1/2 z-20 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs shadow-panel group-hover:block dark:border-ink-700 dark:bg-[var(--surface)]">
                              <p className="font-semibold text-ink-800 dark:text-ink-200">{session.courseName}</p>
                              <p className="text-ink-600 dark:text-ink-400">
                                {session.startTime} - {session.endTime}
                              </p>
                              {session.room && <p className="text-ink-500 dark:text-ink-400">{session.room}</p>}
                              <p className="text-ink-500 dark:text-ink-400">
                                {session.modality === "ONLINE" ? "Online" : "Presencial"}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
            Sesiones registradas
          </h2>
          <Badge tone="brand">{sessions.length} bloques</Badge>
        </div>

        {sessions.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              context="schedule"
              title="Sin sesiones cargadas"
              description="Agrega horarios desde la pagina de Materias."
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-2 text-sm">
            {sessions.map((session, index) => (
              <div
                key={session.id}
                className={clsx(
                  "animate-stagger-in flex flex-wrap items-center justify-between rounded-xl border border-ink-200 bg-white/80 p-2.5 dark:border-ink-700 dark:bg-[var(--surface)]/60",
                  `stagger-${Math.min(index + 1, 6)}`,
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: session.color || "#2563eb" }}
                    aria-hidden="true"
                  />
                  <p className="text-ink-700 dark:text-ink-300">
                    {dayLabels[session.dayOfWeek]} {session.startTime}-{session.endTime} |{" "}
                    <span className="font-medium">{session.courseName}</span>
                  </p>
                </div>
                <Badge tone={session.modality === "ONLINE" ? "brand" : "success"}>
                  {session.room || session.modality}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
          Tip: arrastra una clase a otra celda para cambiar dia/hora. El sistema conserva su duracion original.
        </p>
      </Card>
      </div>
    </div>
  );
}
