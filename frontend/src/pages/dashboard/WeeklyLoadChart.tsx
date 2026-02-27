import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, Badge, Card, EmptyState } from "../../components/UI";
import type { WeeklyLoadPoint } from "../../hooks/useWeeklyLoad";

type WeeklyLoadChartProps = {
  data: WeeklyLoadPoint[];
  loading: boolean;
  error?: string;
};

function tooltipTitle(type: "assignment" | "exam" | "project"): string {
  if (type === "assignment") return "Tarea";
  if (type === "exam") return "Examen";
  return "Proyecto";
}

function barColor(point: WeeklyLoadPoint): string {
  if (point.loadLevel === "critical") return "#dc2626";
  if (point.loadLevel === "warning") return "#d97706";
  return "#2563eb";
}

export function WeeklyLoadChart({ data, loading, error }: WeeklyLoadChartProps) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Carga academica semanal</h2>
          <p className="text-sm text-ink-600 dark:text-ink-400">Proximas 12 semanas de evaluaciones (tareas, examenes y proyectos).</p>
        </div>
        <Badge tone="warning">3+ eval/semana</Badge>
      </div>

      {error && <Alert tone="error" message={error} />}

      {loading ? (
        <div className="h-72 animate-pulse-soft rounded-xl bg-ink-100 dark:bg-ink-800" />
      ) : data.length === 0 ? (
        <EmptyState
          context="calendar"
          title="Sin carga registrada"
          description="No hay evaluaciones en las proximas semanas."
        />
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="weekLabel" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.12)" }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const point = payload[0].payload as WeeklyLoadPoint;
                  return (
                    <div className="max-w-[18rem] rounded-xl border border-ink-200 bg-white p-3 text-xs shadow-panel dark:border-ink-700 dark:bg-[var(--surface)]">
                      <p className="font-semibold text-ink-900 dark:text-ink-100">Semana {point.weekLabel}</p>
                      <p className="mt-1 text-ink-600 dark:text-ink-400">Total: {point.total} evaluaciones</p>
                      <ul className="mt-2 space-y-1">
                        {point.items.slice(0, 6).map((item) => (
                          <li key={`${item.type}-${item.id}`} className="text-ink-700 dark:text-ink-300">
                            {tooltipTitle(item.type)}: {item.title}
                          </li>
                        ))}
                      </ul>
                      {point.items.length > 6 && (
                        <p className="mt-1 text-ink-500 dark:text-ink-400">+{point.items.length - 6} mas...</p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {data.map((point) => (
                  <Cell key={point.weekKey} fill={barColor(point)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
