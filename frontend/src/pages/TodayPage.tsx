import clsx from "clsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, PageTitle, Skeleton } from "../components/UI";
import { api, getErrorMessage } from "../lib/api";
import type { TodayActionItem, TodayResponse } from "../lib/types";

const STUDY_GOAL_MINUTES = 180;

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}min`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}min`;
}

function actionRoute(item: TodayActionItem): string {
  if (item.type === "assignment") return "/assignments";
  if (item.type === "exam") return "/exams";
  if (item.type === "milestone" || item.type === "project") return "/projects";
  return "/dashboard";
}

function actionLabel(item: TodayActionItem): string {
  if (item.bucket === "today") return "HOY";
  if (item.bucket === "tomorrow") return "MANANA";
  if (item.daysLeft <= 1) return "PRONTO";
  return `${item.daysLeft} dias`;
}

function actionTone(item: TodayActionItem): "danger" | "warning" | "success" {
  if (item.bucket === "today") return "danger";
  if (item.bucket === "tomorrow") return "warning";
  return "success";
}

export function TodayPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadTodaySummary() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get<TodayResponse>("/today");
      setData(response.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTodaySummary();
  }, []);

  const dateLabel = useMemo(() => {
    const baseDate = data?.date ? new Date(`${data.date}T00:00:00`) : new Date();
    return format(baseDate, "EEEE d 'de' MMMM", { locale: es });
  }, [data?.date]);

  const hasActionItems = Boolean((data?.prioritized.length ?? 0) > 0);
  const hasClasses = Boolean((data?.classSessions.length ?? 0) > 0);
  const urgentCourseId =
    data?.prioritized.find((item) => Boolean(item.courseId))?.courseId ??
    data?.classSessions[0]?.course.id ??
    null;

  const tasksCompletion =
    data && data.totalDueToday > 0 ? Math.min(100, Math.round((data.completedToday / data.totalDueToday) * 100)) : 0;
  const studyProgress =
    data && STUDY_GOAL_MINUTES > 0
      ? Math.min(100, Math.round((data.studyMinutesToday / STUDY_GOAL_MINUTES) * 100))
      : 0;

  async function toggleAssignment(item: TodayActionItem) {
    if (item.type !== "assignment") return;
    setTogglingId(item.id);
    setError("");
    try {
      const nextStatus = item.status === "DONE" ? "PENDING" : "DONE";
      await api.put(`/assignments/${item.id}`, { status: nextStatus });
      await loadTodaySummary();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Agenda diaria"
        title="Hoy"
        subtitle="Clases, pendientes y progreso en una sola vista priorizada."
      />

      {error && <Alert tone="error" message={error} />}

      <Card className="space-y-2">
        <h2 className="font-display text-2xl font-semibold capitalize text-ink-900 dark:text-ink-100">
          {dateLabel}
        </h2>
        {loading || !data ? (
          <Skeleton className="h-4 w-72" variant="text-line" />
        ) : (
          <p className="text-sm text-ink-600 dark:text-ink-400">
            {data.dueToday.length} pendientes hoy | {data.examsTomorrow} examen(es) manana |{" "}
            {formatMinutes(data.studyMinutesToday)} estudiadas hoy
          </p>
        )}
      </Card>

      {!loading && data && !hasActionItems && !hasClasses ? (
        <EmptyState
          context="generic"
          title="Dia en orden"
          description="No tienes pendientes para hoy. Buen momento para adelantar una materia."
          action={
            <Button type="button" onClick={() => navigate("/dashboard?focus=1")}>
              Iniciar sesion de estudio
            </Button>
          }
        />
      ) : (
        <>
          <Card className="space-y-3">
            <h3 className="font-semibold text-ink-900 dark:text-ink-100">Clases de hoy</h3>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : data && data.classSessions.length > 0 ? (
              <ul className="space-y-2">
                {data.classSessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between rounded-xl border border-ink-200 px-3 py-2 dark:border-ink-700"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink-900 dark:text-ink-100">
                        {session.startTime} - {session.endTime} | {session.course.name}
                      </p>
                      <p className="text-xs text-ink-600 dark:text-ink-400">
                        {session.room || "Sin salon"} |{" "}
                        {session.modality === "ONLINE" ? "online" : "presencial"}
                      </p>
                    </div>
                    <Badge>{session.course.code}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500 dark:text-ink-400">No hay clases registradas para hoy.</p>
            )}
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold text-ink-900 dark:text-ink-100">Lista de accion</h3>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : data && data.prioritized.length > 0 ? (
              <ul className="space-y-2">
                {data.prioritized.map((item) => (
                  <li
                    key={`${item.type}-${item.id}`}
                    className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2 dark:border-ink-700"
                  >
                    {item.type === "assignment" ? (
                      <input
                        type="checkbox"
                        checked={item.status === "DONE"}
                        disabled={togglingId === item.id}
                        onChange={() => {
                          void toggleAssignment(item);
                        }}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-400 dark:border-ink-600"
                        aria-label={`Marcar ${item.title} como completada`}
                      />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-ink-300 bg-ink-100 dark:border-ink-600 dark:bg-ink-700" />
                    )}

                    <button
                      type="button"
                      className="flex flex-1 items-center justify-between gap-3 text-left"
                      onClick={() => navigate(actionRoute(item))}
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink-900 dark:text-ink-100">{item.title}</p>
                        <p className="text-xs text-ink-600 dark:text-ink-400">
                          {item.courseName || "Sin materia"} | vence {format(new Date(item.dueAt), "dd/MM HH:mm")}
                        </p>
                      </div>
                      <Badge tone={actionTone(item)}>{actionLabel(item)}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500 dark:text-ink-400">No hay items pendientes para esta semana.</p>
            )}
          </Card>

          <Card className="space-y-4">
            <h3 className="font-semibold text-ink-900 dark:text-ink-100">Progreso del dia</h3>
            {loading || !data ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-64" variant="text-line" />
                <Skeleton className="h-3" />
                <Skeleton className="h-4 w-64" variant="text-line" />
                <Skeleton className="h-3" />
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm text-ink-700 dark:text-ink-300">
                    Tareas completadas hoy: {data.completedToday} / {data.totalDueToday}
                  </p>
                  <div className="mt-1 h-2 rounded-full bg-ink-200 dark:bg-ink-700">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${tasksCompletion}%` }} />
                  </div>
                </div>

                <div>
                  <p className="text-sm text-ink-700 dark:text-ink-300">
                    Tiempo de estudio hoy: {formatMinutes(data.studyMinutesToday)} / meta {formatMinutes(STUDY_GOAL_MINUTES)}
                  </p>
                  <div className="mt-1 h-2 rounded-full bg-ink-200 dark:bg-ink-700">
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        studyProgress >= 100 ? "bg-success-500" : "bg-warning-500",
                      )}
                      style={{ width: `${studyProgress}%` }}
                    />
                  </div>
                </div>

                {data.todayWorkloadItems.length > 0 && (
                  <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3 dark:border-ink-700 dark:bg-ink-800/35">
                    <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">
                      Carga de trabajo de hoy: ~{formatMinutes(data.todayWorkloadMinutes)}
                    </p>
                    <ul className="mt-1 space-y-1 text-xs text-ink-600 dark:text-ink-400">
                      {data.todayWorkloadItems.map((item) => (
                        <li key={item.id}>
                          {item.title} {item.courseName ? `(${item.courseName})` : ""}: {formatMinutes(item.minutes)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card>
            <Button
              type="button"
              className="w-full"
              onClick={() =>
                navigate(
                  urgentCourseId
                    ? `/dashboard?focus=1&course=${urgentCourseId}`
                    : "/dashboard?focus=1",
                )
              }
            >
              Iniciar sesion de estudio
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

export default TodayPage;
