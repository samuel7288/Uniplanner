import { Alert, Button, Card } from "./UI";
import type { CoachHint } from "../lib/types";

type AcademicCoachProps = {
  hint: CoachHint | null;
  loading: boolean;
  error: string;
  onAction: (href: string) => void;
  onDismiss: (id: string) => void;
};

function toneClass(tone: CoachHint["tone"]): string {
  if (tone === "danger") {
    return "border-danger-200 bg-danger-50/70 dark:border-danger-700/40 dark:bg-danger-900/20";
  }
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50/70 dark:border-amber-700/40 dark:bg-amber-900/20";
  }
  return "border-accent-200 bg-accent-50/70 dark:border-accent-700/40 dark:bg-accent-900/20";
}

function toneEmoji(tone: CoachHint["tone"]): string {
  if (tone === "danger") return "!";
  if (tone === "warning") return "~";
  return "+";
}

export function AcademicCoach({ hint, loading, error, onAction, onDismiss }: AcademicCoachProps) {
  if (loading) {
    return (
      <Card className="animate-pulse-soft">
        <div className="h-5 w-48 rounded bg-ink-200 dark:bg-ink-700" />
        <div className="mt-2 h-4 w-full rounded bg-ink-200 dark:bg-ink-700" />
      </Card>
    );
  }

  if (error) {
    return <Alert tone="warning" message="No se pudo cargar el coach academico." />;
  }

  if (!hint) return null;

  return (
    <Card className={toneClass(hint.tone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-600 dark:text-ink-300">
            Coach academico
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-100">
            {toneEmoji(hint.tone)} {hint.title}
          </h2>
          <p className="mt-1 text-sm text-ink-700 dark:text-ink-300">{hint.message}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="subtle" onClick={() => onAction(hint.action.href)}>
            {hint.action.label}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onDismiss(hint.id)}>
            Ocultar hoy
          </Button>
        </div>
      </div>
    </Card>
  );
}

