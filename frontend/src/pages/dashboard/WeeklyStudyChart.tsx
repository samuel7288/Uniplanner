import { format } from "date-fns";
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Alert, Badge, Card, EmptyState, Skeleton } from "../../components/UI";
import type { StudyWeekSummary } from "../../lib/types";

const FALLBACK_COLORS = ["#1f77b4", "#2ca02c", "#ff7f0e", "#d62728", "#9467bd", "#17becf"];

function minutesToHoursLabel(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} h`;
}

type WeeklyStudyChartProps = {
  data: StudyWeekSummary | null;
  loading: boolean;
  error: string;
};

export function WeeklyStudyChart({ data, loading, error }: WeeklyStudyChartProps) {
  const chartData =
    data?.byCourse.map((item, index) => ({
      name: item.courseName,
      minutes: item.totalMinutes,
      sessions: item.sessionCount,
      color: item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    })) ?? [];

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
            Tiempo de estudio semanal
          </h2>
          <p className="text-sm text-ink-600 dark:text-ink-400">
            Distribucion de horas por materia en la semana actual.
          </p>
        </div>
        {data && <Badge tone="brand">{minutesToHoursLabel(data.totalMinutes)}</Badge>}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-[0.8fr,1.2fr]">
          <Skeleton className="h-64 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        </div>
      ) : error ? (
        <Alert tone="error" message={error} />
      ) : !data || data.totalMinutes === 0 ? (
        <EmptyState
          context="courses"
          title="Sin sesiones esta semana"
          description="Completa un Pomodoro para empezar a registrar horas por materia."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[0.8fr,1.2fr]">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="minutes" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={2}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => {
                    const minutes = typeof value === "number" ? value : 0;
                    return [minutesToHoursLabel(minutes), "Horas"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {chartData.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-xl border border-ink-200 bg-white/70 px-3 py-2 dark:border-ink-700 dark:bg-[var(--surface)]/60">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                  <span className="text-sm font-semibold text-ink-800 dark:text-ink-200">{item.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">{minutesToHoursLabel(item.minutes)}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">{item.sessions} sesiones</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.sessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-700 dark:text-ink-300">Historial semanal reciente</p>
          {data.sessions.slice(0, 5).map((session) => (
            <div key={session.id} className="flex items-center justify-between rounded-xl border border-ink-200 bg-white/70 px-3 py-2 text-sm dark:border-ink-700 dark:bg-[var(--surface)]/60">
              <div>
                <p className="font-semibold text-ink-800 dark:text-ink-200">{session.course.name}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {format(new Date(session.startTime), "dd/MM HH:mm")}
                </p>
              </div>
              <Badge tone="default">{session.duration} min</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

