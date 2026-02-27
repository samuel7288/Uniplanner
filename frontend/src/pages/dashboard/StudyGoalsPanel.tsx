import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from "../../components/UI";
import type { StudyGoalProgress } from "../../lib/types";

type StudyGoalsPanelProps = {
  goals: StudyGoalProgress[];
  loading: boolean;
  error: string;
  onEditGoal: (goal: StudyGoalProgress) => void;
  onOpenFocus: (courseId: string) => void;
};

function minutesLabel(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}min` : `${hours}h`;
  }
  return `${minutes}min`;
}

export function StudyGoalsPanel({ goals, loading, error, onEditGoal, onOpenFocus }: StudyGoalsPanelProps) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
            Metas de estudio semanales
          </h2>
          <p className="text-sm text-ink-600 dark:text-ink-400">
            Ajusta metas por materia y abre Focus Mode con un click.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : error ? (
        <Alert tone="error" message={error} />
      ) : goals.length === 0 ? (
        <EmptyState
          context="courses"
          title="Sin materias activas"
          description="Agrega materias para definir metas semanales."
        />
      ) : (
        <div className="space-y-2">
          {goals.map((goal) => {
            const done = goal.weeklyMinutes > 0 && goal.completedMinutes >= goal.weeklyMinutes;
            const progressWidth =
              goal.weeklyMinutes > 0
                ? `${Math.max(0, Math.min(100, goal.percentage))}%`
                : "0%";

            return (
              <div
                key={goal.courseId}
                className="rounded-xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-[var(--surface)]/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => onOpenFocus(goal.courseId)}
                  >
                    <p className="truncate font-semibold text-ink-800 dark:text-ink-200">{goal.courseName}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">{goal.code}</p>
                  </button>
                  <div className="flex items-center gap-2">
                    {done && <Badge tone="success">Meta cumplida</Badge>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditGoal(goal)}
                      aria-label={`Editar meta de ${goal.courseName}`}
                    >
                      <PencilSquareIcon className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
                    style={{ width: progressWidth }}
                    aria-hidden="true"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <p className="text-ink-600 dark:text-ink-400">
                    {minutesLabel(goal.completedMinutes)} /{" "}
                    {goal.weeklyMinutes > 0 ? minutesLabel(goal.weeklyMinutes) : "sin meta"}
                  </p>
                  <p className="font-semibold text-ink-600 dark:text-ink-400">
                    {goal.weeklyMinutes > 0 ? `${goal.percentage}%` : "0%"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

