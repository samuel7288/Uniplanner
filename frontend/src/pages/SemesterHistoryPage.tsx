import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, Badge, Card, EmptyState, PageTitle, Skeleton } from "../components/UI";
import { api, getErrorMessage } from "../lib/api";
import { SemesterHistoryResponseSchema } from "../lib/schemas";
import type { SemesterHistoryResponse } from "../lib/types";

const initialHistory: SemesterHistoryResponse = {
  semesters: [],
  cumulative: [],
  insights: {
    samples: 0,
    avgWhenOver6h: null,
    avgWhenUnder3h: null,
    bestCourseByEfficiency: null,
  },
};

function formatAverage(value: number | null): string {
  if (value === null) return "-";
  return value.toFixed(2);
}

function gpaTone(value: number | null): "default" | "success" | "warning" | "danger" {
  if (value === null) return "default";
  if (value >= 7) return "success";
  if (value >= 5) return "warning";
  return "danger";
}

export function SemesterHistoryPage() {
  const [history, setHistory] = useState<SemesterHistoryResponse>(initialHistory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      setError("");

      try {
        const response = await api.get<SemesterHistoryResponse>("/courses/history");
        setHistory(SemesterHistoryResponseSchema.parse(response.data));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    void loadHistory();
  }, []);

  const chartData = useMemo(
    () =>
      history.cumulative.map((point) => ({
        semester: point.semester,
        gpa: point.gpa,
        cumulativeGpa: point.cumulativeGpa,
      })),
    [history.cumulative],
  );

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Academico"
        title="Historial de semestres"
        subtitle="Consulta materias archivadas y la evolucion de tu GPA acumulado."
      />

      {error && <Alert tone="error" message={error} />}

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">GPA por semestre</h2>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
          Linea azul: GPA del semestre. Linea verde: promedio acumulado.
        </p>

        {loading ? (
          <div className="mt-4 h-72">
            <Skeleton className="h-full rounded-2xl" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              context="courses"
              title="Sin historial archivado"
              description="Archiva un semestre desde Ajustes para ver datos aqui."
            />
          </div>
        ) : (
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" />
                <XAxis dataKey="semester" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  tickCount={6}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                  }}
                  formatter={(value, key) => {
                    const numericValue = typeof value === "number" ? value : null;
                    const label = key === "cumulativeGpa" ? "GPA acumulado" : "GPA semestre";
                    return [formatAverage(numericValue), label];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="gpa"
                  connectNulls={false}
                  stroke="var(--brand)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="GPA semestre"
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeGpa"
                  connectNulls={false}
                  stroke="var(--accent)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="GPA acumulado"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Patron de rendimiento</h2>
        {loading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-4 w-80" variant="text-line" />
            <Skeleton className="h-4 w-72" variant="text-line" />
            <Skeleton className="h-4 w-64" variant="text-line" />
          </div>
        ) : history.insights.samples === 0 ? (
          <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">
            Aun no hay retrospectivas suficientes para calcular correlaciones estudio/nota.
          </p>
        ) : (
          <div className="mt-2 space-y-1 text-sm text-ink-700 dark:text-ink-300">
            <p>
              Cuando estudias mas de 6h: <strong>{formatAverage(history.insights.avgWhenOver6h)}</strong>
            </p>
            <p>
              Cuando estudias menos de 3h: <strong>{formatAverage(history.insights.avgWhenUnder3h)}</strong>
            </p>
            <p>
              Mejor relacion estudio/nota:{" "}
              <strong>{history.insights.bestCourseByEfficiency ?? "-"}</strong>
            </p>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {loading && (
          <>
            <Card>
              <Skeleton className="h-10 w-56 rounded-xl" />
              <Skeleton className="mt-3 h-16 rounded-xl" />
              <Skeleton className="mt-2 h-16 rounded-xl" />
            </Card>
            <Card>
              <Skeleton className="h-10 w-56 rounded-xl" />
              <Skeleton className="mt-3 h-16 rounded-xl" />
              <Skeleton className="mt-2 h-16 rounded-xl" />
            </Card>
          </>
        )}

        {!loading &&
          history.semesters.map((semester) => (
            <Card key={`${semester.semester}-${semester.archivedAt}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
                    {semester.semester}
                  </h3>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Archivado: {format(new Date(semester.archivedAt), "dd/MM/yyyy")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={gpaTone(semester.gpa)}>GPA {formatAverage(semester.gpa)}</Badge>
                  <Badge tone="default">
                    {semester.gradedCourses}/{semester.courseCount} materias con notas
                  </Badge>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400">
                      <th className="pb-2 pr-4 font-semibold">Materia</th>
                      <th className="pb-2 pr-4 font-semibold">Codigo</th>
                      <th className="pb-2 pr-4 font-semibold">Promedio final</th>
                      <th className="pb-2 pr-4 font-semibold">Peso cubierto</th>
                      <th className="pb-2 font-semibold">Evaluaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {semester.courses.map((course) => (
                      <tr key={course.id} className="border-b border-ink-100 text-ink-700 dark:border-ink-800 dark:text-ink-300">
                        <td className="py-2 pr-4 font-semibold">{course.name}</td>
                        <td className="py-2 pr-4">{course.code}</td>
                        <td className="py-2 pr-4">{formatAverage(course.finalAverage)}</td>
                        <td className="py-2 pr-4">{course.coveredWeight.toFixed(1)}%</td>
                        <td className="py-2">{course.gradesCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
}
