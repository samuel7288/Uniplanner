import { AcademicCapIcon, BellAlertIcon, ClockIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { api, getErrorMessage } from "../lib/api";
import { DashboardSummarySchema, StudyWeekSummarySchema } from "../lib/schemas";
import { useBrowserNotifications } from "../hooks/useBrowserNotifications";
import { useWeeklyLoad } from "../hooks/useWeeklyLoad";
import { WeeklyLoadChart } from "./dashboard/WeeklyLoadChart";
import { WeeklyStudyChart } from "./dashboard/WeeklyStudyChart";
import type { Assignment, Course, DashboardSummary, StudyWeekSummary, WeeklyPlanResponse } from "../lib/types";
import { Alert, Badge, Button, Card, DashboardSkeleton, EmptyState, Field, PageTitle, SelectInput, StatCard } from "../components/UI";

const initialSummary: DashboardSummary = {
  kpis: {
    pendingAssignments: 0,
    upcomingExamsCount: 0,
    unreadNotifications: 0,
    riskCoursesCount: 0,
  },
  upcomingExams: [],
  riskCourses: [],
  focusTasks: [],
};
const FOCUS_MODE_STORAGE_KEY = "uniplanner_focus_mode_enabled_v1";
const POMODORO_STATE_STORAGE_KEY = "uniplanner_pomodoro_state_v1";

type TimelineItem = {
  id: string;
  type: "exam" | "task";
  title: string;
  subtitle: string;
  date: Date;
};

type PersistedPomodoroState = {
  seconds: number;
  running: boolean;
  startedAt: string | null;
  courseId: string | null;
  selectedCourseId: string | null;
  updatedAt: number;
};

function assignmentPriorityTone(priority: Assignment["priority"]): "default" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "default";
}

function mockTrend(base: number, length = 6): number[] {
  return Array.from({ length }, (_, i) =>
    Math.max(0, base + Math.round(Math.sin(i + base) * Math.max(base * 0.3, 2)))
  );
}

function safeDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Fecha pendiente";
  return format(parsed, "dd/MM HH:mm");
}

export function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useBrowserNotifications();
  const [summary, setSummary] = useState<DashboardSummary>(initialSummary);
  const [courses, setCourses] = useState<Course[]>([]);
  const [focusCourseId, setFocusCourseId] = useState("");
  const [plan, setPlan] = useState<WeeklyPlanResponse["plan"]>([]);
  const [radarData, setRadarData] = useState<
    Array<{ course: string; current: number; projected: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroStartedAt, setPomodoroStartedAt] = useState<Date | null>(null);
  const [pomodoroCourseId, setPomodoroCourseId] = useState("");
  const [studyWeekSummary, setStudyWeekSummary] = useState<StudyWeekSummary | null>(null);
  const [studyWeekLoading, setStudyWeekLoading] = useState(true);
  const [studyWeekError, setStudyWeekError] = useState("");
  const isFocusMode = useMemo(() => new URLSearchParams(location.search).get("focus") === "1", [location.search]);
  const { data: weeklyLoadData, loading: weeklyLoadLoading, error: weeklyLoadError } = useWeeklyLoad(12);

  async function loadStudyWeekSummary(): Promise<StudyWeekSummary | null> {
    try {
      const response = await api.get<StudyWeekSummary>("/study-sessions", {
        params: { week: "current" },
      });
      const parsed = StudyWeekSummarySchema.parse(response.data);
      setStudyWeekSummary(parsed);
      setStudyWeekError("");
      return parsed;
    } catch (err) {
      setStudyWeekError(getErrorMessage(err));
      return null;
    } finally {
      setStudyWeekLoading(false);
    }
  }

  function getTodayMinutesForCourse(summaryData: StudyWeekSummary, courseId: string, referenceDate: Date): number {
    return summaryData.sessions
      .filter((session) => session.courseId === courseId && isSameDay(new Date(session.startTime), referenceDate))
      .reduce((acc, session) => acc + session.duration, 0);
  }

  async function persistStudySession(startTime: Date, courseId: string, endTime: Date, partial: boolean) {
    const duration = Math.max(
      1,
      Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)),
    );

    try {
      await api.post("/study-sessions", {
        courseId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        source: "pomodoro",
      });

      const refreshed = await loadStudyWeekSummary();
      const fallbackCourseName = courses.find((course) => course.id === courseId)?.name ?? "la materia";

      if (refreshed) {
        const todayMinutes = getTodayMinutesForCourse(refreshed, courseId, endTime);
        const sessionCourseName =
          refreshed.sessions.find((session) => session.courseId === courseId)?.course.name ?? fallbackCourseName;
        toast.success(
          partial
            ? `Sesion parcial guardada (${duration} min).`
            : `Sesion guardada. Llevas ${todayMinutes} min estudiando ${sessionCourseName} hoy.`,
        );
      } else {
        toast.success(partial ? "Sesion parcial guardada." : "Sesion guardada.");
      }

      if (!partial) {
        const notification = notify("Pomodoro completado", {
          body: `${duration} minutos registrados. Toma una pausa breve.`,
          icon: "/icons/icon-192x192.png",
          tag: `pomodoro-${courseId}-${Date.now()}`,
        });
        if (notification) {
          notification.onclick = () => window.focus();
        }
      }
    } catch (err) {
      setStudyWeekError(getErrorMessage(err));
      toast.error("No se pudo guardar la sesion de estudio.");
    }
  }

  async function persistCompletedStudySession(endTime: Date) {
    if (!pomodoroStartedAt || !pomodoroCourseId) return;
    await persistStudySession(pomodoroStartedAt, pomodoroCourseId, endTime, false);
    setPomodoroStartedAt(null);
    setPomodoroCourseId("");
  }

  async function persistPartialStudySession() {
    if (!pomodoroStartedAt || !pomodoroCourseId) return;
    await persistStudySession(pomodoroStartedAt, pomodoroCourseId, new Date(), true);
    setPomodoroStartedAt(null);
    setPomodoroCourseId("");
    setPomodoroRunning(false);
    setPomodoroSeconds(25 * 60);
  }

  function savePomodoroState() {
    if (typeof window === "undefined") return;
    const payload: PersistedPomodoroState = {
      seconds: pomodoroSeconds,
      running: pomodoroRunning,
      startedAt: pomodoroStartedAt?.toISOString() ?? null,
      courseId: pomodoroCourseId || null,
      selectedCourseId: focusCourseId || null,
      updatedAt: Date.now(),
    };
    localStorage.setItem(POMODORO_STATE_STORAGE_KEY, JSON.stringify(payload));
  }

  function restorePomodoroState() {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(POMODORO_STATE_STORAGE_KEY);
    if (!raw) return;

    try {
      const persisted = JSON.parse(raw) as PersistedPomodoroState;
      if (persisted.selectedCourseId) {
        setFocusCourseId((prev) => prev || persisted.selectedCourseId || "");
      }
      if (persisted.startedAt && persisted.courseId) {
        const startedAt = new Date(persisted.startedAt);
        if (!Number.isNaN(startedAt.getTime())) {
          setPomodoroStartedAt(startedAt);
          setPomodoroCourseId(persisted.courseId);
        }
      }

      const baseSeconds = Math.max(0, Math.min(25 * 60, Math.round(persisted.seconds || 0)));
      if (persisted.running) {
        const elapsed = Math.max(0, Math.floor((Date.now() - persisted.updatedAt) / 1000));
        const remaining = Math.max(0, baseSeconds - elapsed);
        setPomodoroSeconds(remaining);
        setPomodoroRunning(remaining > 0);
      } else {
        setPomodoroSeconds(baseSeconds || 25 * 60);
        setPomodoroRunning(false);
      }
    } catch {
      localStorage.removeItem(POMODORO_STATE_STORAGE_KEY);
    }
  }

  function togglePomodoro() {
    if (pomodoroRunning) {
      setPomodoroRunning(false);
      return;
    }

    if (!pomodoroStartedAt) {
      if (!focusCourseId) {
        setError("Selecciona una materia antes de iniciar el Pomodoro.");
        return;
      }

      setPomodoroStartedAt(new Date());
      setPomodoroCourseId(focusCourseId);
    }

    setError("");
    setPomodoroRunning(true);
  }

  function resetPomodoro() {
    setPomodoroRunning(false);
    setPomodoroSeconds(25 * 60);
    setPomodoroStartedAt(null);
    setPomodoroCourseId("");
    if (typeof window !== "undefined") {
      localStorage.removeItem(POMODORO_STATE_STORAGE_KEY);
    }
  }

  useEffect(() => {
    if (!pomodoroRunning) return;
    const id = window.setInterval(() => {
      setPomodoroSeconds((prev) => {
        if (prev <= 1) {
          const completedAt = new Date();
          window.clearInterval(id);
          setPomodoroRunning(false);
          void persistCompletedStudySession(completedAt);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [pomodoroCourseId, pomodoroRunning, pomodoroStartedAt]);

  useEffect(() => {
    restorePomodoroState();
  }, []);

  useEffect(() => {
    savePomodoroState();
  }, [focusCourseId, pomodoroCourseId, pomodoroRunning, pomodoroSeconds, pomodoroStartedAt]);

  useEffect(() => {
    if (location.pathname !== "/dashboard" || isFocusMode) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(FOCUS_MODE_STORAGE_KEY) !== "true") return;
    navigate("/dashboard?focus=1", { replace: true });
  }, [isFocusMode, location.pathname, navigate]);

  useEffect(() => {
    if (!isFocusMode) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void closeFocusMode();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeFocusMode, isFocusMode]);

  useEffect(() => {
    async function load() {
      setError("");
      setLoading(true);
      try {
        const [summaryResponse, planResponse, coursesResponse] = await Promise.all([
          api.get<DashboardSummary>("/dashboard/summary"),
          api.get<WeeklyPlanResponse>("/planning/week"),
          api.get<Course[]>("/courses"),
        ]);

        setSummary(DashboardSummarySchema.parse(summaryResponse.data));
        setPlan(planResponse.data.plan);
        setCourses(coursesResponse.data);
        setFocusCourseId((prev) => prev || coursesResponse.data[0]?.id || "");

        const projections = await Promise.all(
          coursesResponse.data.slice(0, 6).map(async (course) => {
            try {
              const response = await api.get<{
                currentAverage: number;
                projectedFinal: number;
              }>(`/courses/${course.id}/grade-projection`);
              return {
                course: course.code || course.name.slice(0, 8),
                current: Number(response.data.currentAverage.toFixed(2)),
                projected: Number(response.data.projectedFinal.toFixed(2)),
              };
            } catch {
              return null;
            }
          }),
        );

        setRadarData(projections.filter((item): item is { course: string; current: number; projected: number } => Boolean(item)));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    setStudyWeekLoading(true);
    void loadStudyWeekSummary();
  }, []);

  useEffect(() => {
    if (courses.length === 0) {
      setFocusCourseId("");
      return;
    }
    if (courses.some((course) => course.id === focusCourseId)) return;
    setFocusCourseId(courses[0].id);
  }, [courses, focusCourseId]);

  const pomodoroDisplay = useMemo(() => {
    const minutes = Math.floor(pomodoroSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (pomodoroSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [pomodoroSeconds]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const examItems: TimelineItem[] = summary.upcomingExams.map((exam) => ({
      id: `exam-${exam.id}`,
      type: "exam",
      title: exam.title,
      subtitle: exam.course?.name || "Sin materia",
      date: new Date(exam.dateTime),
    }));

    const taskItems: TimelineItem[] = summary.focusTasks.map((task) => ({
      id: `task-${task.id}`,
      type: "task",
      title: task.title,
      subtitle: task.course?.name || "Sin materia",
      date: new Date(task.dueDate),
    }));

    return [...examItems, ...taskItems].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 6);
  }, [summary.focusTasks, summary.upcomingExams]);

  const semesterProgress = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const firstHalf = now.getMonth() < 6;
    const start = new Date(year, firstHalf ? 0 : 6, 1);
    const end = new Date(year, firstHalf ? 5 : 11, 30, 23, 59, 59);
    const ratio = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, []);

  const focusNotes = useMemo(() => {
    const taskNotes = summary.focusTasks
      .filter((task) => !focusCourseId || task.courseId === focusCourseId)
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        detail: `Entrega: ${safeDateLabel(task.dueDate)}`,
        tone: assignmentPriorityTone(task.priority),
      }));

    const examNotes = summary.upcomingExams
      .filter((exam) => !focusCourseId || exam.courseId === focusCourseId)
      .map((exam) => ({
        id: `exam-${exam.id}`,
        title: exam.title,
        detail: `Examen: ${safeDateLabel(exam.dateTime)}`,
        tone: "warning" as const,
      }));

    return [...taskNotes, ...examNotes]
      .sort((a, b) => a.detail.localeCompare(b.detail))
      .slice(0, 8);
  }, [focusCourseId, summary.focusTasks, summary.upcomingExams]);

  function openFocusMode() {
    localStorage.setItem(FOCUS_MODE_STORAGE_KEY, "true");
    navigate("/dashboard?focus=1");
  }

  async function closeFocusMode() {
    if (pomodoroStartedAt && pomodoroCourseId && pomodoroSeconds > 0) {
      await persistPartialStudySession();
    }
    localStorage.setItem(FOCUS_MODE_STORAGE_KEY, "false");
    navigate("/dashboard", { replace: true });
  }

  if (isFocusMode) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ink-950 px-4 py-6">
        <div className="w-full max-w-5xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">Focus mode</p>
              <h1 className="font-display text-3xl font-semibold text-ink-100">Sesion de estudio sin distracciones</h1>
            </div>
            <Button type="button" variant="ghost" onClick={() => void closeFocusMode()}>
              Salir de focus
            </Button>
          </div>

          {error && <Alert tone="error" message={error} />}

          <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <Card className="border-ink-700 bg-ink-900/70 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-400">Pomodoro</p>
              <p className="kpi-value mt-4 text-7xl font-semibold tracking-tight text-brand-300">{pomodoroDisplay}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={togglePomodoro}>
                  {pomodoroRunning ? "Pausar" : "Iniciar"}
                </Button>
                <Button type="button" variant="ghost" onClick={resetPomodoro}>
                  Reiniciar
                </Button>
              </div>
              <p className="mt-3 text-xs text-ink-400">Presiona ESC para salir.</p>
            </Card>

            <Card className="border-ink-700 bg-ink-900/70">
              <Field label="Materia en estudio">
                <SelectInput
                  value={focusCourseId}
                  onChange={(event) => setFocusCourseId(event.target.value)}
                  disabled={courses.length === 0 || pomodoroStartedAt !== null}
                >
                  {courses.length === 0 && <option value="">Sin materias</option>}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-ink-200">Notas de la materia</p>
                {loading ? (
                  <p className="text-sm text-ink-400">Cargando resumen...</p>
                ) : focusNotes.length === 0 ? (
                  <p className="text-sm text-ink-400">No hay tareas o examenes cercanos para esta materia.</p>
                ) : (
                  <div className="space-y-2">
                    {focusNotes.map((note) => (
                      <div key={note.id} className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
                        <p className="font-semibold text-ink-100">{note.title}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-xs text-ink-400">{note.detail}</p>
                          <Badge tone={note.tone}>{note.tone === "danger" ? "Alta" : note.tone === "warning" ? "Media" : "Normal"}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Workspace"
        title="Dashboard estrategico"
        subtitle="Prioriza trabajo academico con visibilidad de riesgo, foco diario y proyeccion semanal."
      />

      {error && <Alert tone="error" message={error} />}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              tone="brand"
              label="Tareas pendientes"
              value={summary.kpis.pendingAssignments}
              trend={summary.kpis.pendingAssignments > 8 ? "Carga alta esta semana" : "Carga controlada"}
              trendData={mockTrend(summary.kpis.pendingAssignments)}
              className="min-h-[10.5rem] animate-stagger-in stagger-1"
            />
            <StatCard
              tone="default"
              label="Examenes proximos"
              value={summary.kpis.upcomingExamsCount}
              trend={summary.kpis.upcomingExamsCount > 0 ? "Revisa plan semanal" : "Sin examenes cercanos"}
              trendData={mockTrend(summary.kpis.upcomingExamsCount)}
              className="min-h-[10.5rem] animate-stagger-in stagger-2"
            />
            <StatCard
              tone="warning"
              label="Sin leer"
              value={summary.kpis.unreadNotifications}
              trend={summary.kpis.unreadNotifications > 0 ? "Hay recordatorios pendientes" : "Inbox al dia"}
              trendData={mockTrend(summary.kpis.unreadNotifications)}
              className="min-h-[10.5rem] animate-stagger-in stagger-3"
            />
            <StatCard
              tone={summary.kpis.riskCoursesCount > 0 ? "danger" : "success"}
              label="Materias en riesgo"
              value={summary.kpis.riskCoursesCount}
              trend={summary.kpis.riskCoursesCount > 0 ? "Accion recomendada hoy" : "Rendimiento estable"}
              trendData={mockTrend(summary.kpis.riskCoursesCount)}
              className="min-h-[10.5rem] animate-stagger-in stagger-4"
            />
          </div>

          <WeeklyLoadChart
            data={weeklyLoadData}
            loading={weeklyLoadLoading}
            error={weeklyLoadError}
          />

          <WeeklyStudyChart
            data={studyWeekSummary}
            loading={studyWeekLoading}
            error={studyWeekError}
          />

          <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">Hoy</p>
                  <h2 className="font-display text-xl font-semibold text-ink-900 dark:text-ink-100">Timeline academico</h2>
                </div>
                <Badge tone="brand">{timeline.length} items</Badge>
              </div>

              {timeline.length === 0 ? (
                <EmptyState
                  context="calendar"
                  title="Dia despejado"
                  description="No hay tareas ni examenes inmediatos en tu timeline."
                />
              ) : (
                <div className="space-y-2">
                  {timeline.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 rounded-xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-[var(--surface)] animate-stagger-in stagger-${Math.min(index + 1, 6)}`}
                    >
                      <span className="mt-0.5 rounded-lg bg-ink-100 p-1.5 dark:bg-ink-700">
                        {item.type === "exam" ? (
                          <AcademicCapIcon className="size-4 text-brand-700 dark:text-brand-400" />
                        ) : (
                          <ClockIcon className="size-4 text-ink-700 dark:text-ink-300" />
                        )}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-ink-800 dark:text-ink-200">{item.title}</p>
                        <p className="text-xs text-ink-600 dark:text-ink-400">{item.subtitle}</p>
                      </div>
                      <p className="text-xs font-semibold text-ink-600 dark:text-ink-400">{format(item.date, "dd/MM HH:mm")}</p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink-700 dark:text-ink-300">Tareas de enfoque</h3>
                {summary.focusTasks.length === 0 ? (
                  <p className="text-sm text-ink-500 dark:text-ink-400">Sin tareas prioritarias para hoy.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.focusTasks.map((task) => (
                      <Badge key={task.id} tone={assignmentPriorityTone(task.priority)}>
                        {task.title}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card tone="brand" className="space-y-5">
              <div className="flex items-center gap-2">
                <BellAlertIcon className="size-5 text-brand-700 dark:text-brand-400" />
                <h2 className="font-display text-xl font-semibold text-ink-900 dark:text-ink-100">Modo enfoque</h2>
              </div>
              <p className="text-sm text-ink-600 dark:text-ink-400">Timer Pomodoro para ejecutar bloques de trabajo sin friccion.</p>
              <p className="kpi-value text-5xl font-semibold tracking-tight text-brand-700 dark:text-brand-400">{pomodoroDisplay}</p>
              <Field label="Materia para esta sesion">
                <SelectInput
                  value={focusCourseId}
                  onChange={(event) => setFocusCourseId(event.target.value)}
                  disabled={courses.length === 0 || pomodoroStartedAt !== null}
                >
                  {courses.length === 0 && <option value="">Sin materias</option>}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={togglePomodoro}>
                  {pomodoroRunning ? "Pausar" : "Iniciar"}
                </Button>
                <Button type="button" variant="ghost" onClick={resetPomodoro}>
                  Reiniciar
                </Button>
                <Button type="button" variant="subtle" onClick={openFocusMode}>
                  Modo focus
                </Button>
              </div>
              <p className="text-xs text-ink-500 dark:text-ink-400">Sugerencia: combina 25 min foco + 5 min pausa por bloque.</p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card tone={summary.riskCourses.length > 0 ? "warning" : "success"}>
              <div className="mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="size-5 text-amber-700 dark:text-amber-400" />
                <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Materias con riesgo</h2>
              </div>
              {summary.riskCourses.length === 0 ? (
                <EmptyState
                  context="courses"
                  title="Riesgo bajo"
                  description="Tus materias no muestran proyecciones por debajo del umbral."
                />
              ) : (
                <div className="space-y-2">
                  {summary.riskCourses.map((course) => (
                    <div key={course.courseId} className="rounded-xl border border-amber-200 bg-white/80 p-3 dark:border-amber-800/50 dark:bg-[var(--surface)]">
                      <p className="font-semibold text-ink-800 dark:text-ink-200">{course.courseName}</p>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        Actual {course.currentAverage.toFixed(2)} | Proyeccion {course.projectedFinal.toFixed(2)}
                      </p>
                      <p className="text-xs text-ink-600 dark:text-ink-400">Peso cubierto: {course.coveredWeight.toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Plan semanal recomendado</h2>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">Heuristica basada en proximidad de examenes y entregas.</p>
              {plan.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    context="calendar"
                    title="Sin carga planificada"
                    description="Agrega examenes y tareas para generar una agenda automatica."
                  />
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {plan.map((day, index) => (
                    <div
                      key={day.date}
                      className={`rounded-xl border border-ink-200 bg-white/75 p-3 dark:border-ink-700 dark:bg-[var(--surface)] animate-stagger-in stagger-${Math.min(index + 1, 6)}`}
                    >
                      <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">{day.date}</p>
                      {day.sessions.length === 0 ? (
                        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Descanso o repaso liviano.</p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {day.sessions.map((session, i) => (
                            <li key={`${session.itemId}-${i}`} className="flex items-center justify-between text-sm text-ink-700 dark:text-ink-300">
                              <span>{session.title}</span>
                              <Badge tone={session.type === "exam" ? "warning" : "brand"}>{session.minutes} min</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Progreso del semestre</h2>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
                Avance estimado del ciclo actual para ajustar tu carga de estudio.
              </p>
              <div className="mt-4">
                <div className="h-3 rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-[width] duration-500"
                    style={{ width: `${semesterProgress}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-sm font-semibold text-ink-700 dark:text-ink-300">
                  {semesterProgress}% completado
                </p>
              </div>
            </Card>

            <Card>
              <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Radar de rendimiento</h2>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
                Compara promedio actual vs proyeccion final por materia.
              </p>
              {radarData.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    context="courses"
                    title="Sin datos de rendimiento"
                    description="Agrega evaluaciones para visualizar tendencias por materia."
                  />
                </div>
              ) : (
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--line)" />
                      <PolarAngleAxis dataKey="course" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
                      <Radar
                        name="Actual"
                        dataKey="current"
                        stroke="var(--brand)"
                        fill="var(--brand)"
                        fillOpacity={0.35}
                      />
                      <Radar
                        name="Proyeccion"
                        dataKey="projected"
                        stroke="var(--accent)"
                        fill="var(--accent)"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
