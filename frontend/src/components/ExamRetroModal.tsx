import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../lib/api";
import type { Exam } from "../lib/types";
import { Button, Field, TextArea, TextInput } from "./UI";

type ExamRetroModalProps = {
  open: boolean;
  exam: Exam | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

export function ExamRetroModal({ open, exam, onClose, onSaved }: ExamRetroModalProps) {
  const [obtainedGrade, setObtainedGrade] = useState("");
  const [studyHoursLogged, setStudyHoursLogged] = useState("");
  const [feelingScore, setFeelingScore] = useState<number | null>(null);
  const [retroNotes, setRetroNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !exam) return;
    setObtainedGrade(
      typeof exam.obtainedGrade === "number" ? String(exam.obtainedGrade) : "",
    );
    setStudyHoursLogged(
      typeof exam.studyHoursLogged === "number"
        ? String(exam.studyHoursLogged)
        : typeof exam.suggestedStudyHours === "number"
          ? String(exam.suggestedStudyHours)
          : "",
    );
    setFeelingScore(typeof exam.feelingScore === "number" ? exam.feelingScore : null);
    setRetroNotes(exam.retroNotes ?? "");
  }, [exam, open]);

  if (!open || !exam) return null;

  async function submitRetrospective() {
    if (!exam) return;
    const parsedGrade = Number(obtainedGrade);
    if (!Number.isFinite(parsedGrade) || parsedGrade < 0 || parsedGrade > 10) {
      toast.error("Ingresa una nota valida entre 0 y 10.");
      return;
    }

    const parsedHours = studyHoursLogged.trim() ? Number(studyHoursLogged) : null;
    if (
      parsedHours !== null &&
      (!Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 200)
    ) {
      toast.error("Horas de estudio invalidas.");
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`/exams/${exam.id}/retro`, {
        obtainedGrade: parsedGrade,
        studyHoursLogged: parsedHours,
        feelingScore,
        retroNotes: retroNotes.trim() ? retroNotes.trim() : null,
      });
      await onSaved();
      onClose();
      toast.success("Retrospectiva guardada");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function skipRetrospective() {
    if (!exam) return;
    setSubmitting(true);
    try {
      await api.patch(`/exams/${exam.id}/retro`, { skip: true });
      await onSaved();
      onClose();
      toast.success("Retrospectiva omitida");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f2439]/45 p-3 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-4 shadow-panel dark:border-ink-700 dark:bg-[var(--surface)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Retrospectiva de examen"
      >
        <h3 className="font-display text-xl font-semibold text-ink-900 dark:text-ink-100">
          Retrospectiva
        </h3>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
          {exam.title} | {new Date(exam.dateTime).toLocaleDateString()}
        </p>

        <div className="mt-4 space-y-3">
          <Field label="Nota obtenida">
            <TextInput
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={obtainedGrade}
              onChange={(event) => setObtainedGrade(event.target.value)}
            />
          </Field>

          <Field label="Horas estudiadas (detectadas y editables)">
            <TextInput
              type="number"
              min={0}
              max={200}
              step={0.1}
              value={studyHoursLogged}
              onChange={(event) => setStudyHoursLogged(event.target.value)}
            />
          </Field>

          <Field label="Como te sentiste">
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 1, label: "Baja" },
                { value: 2, label: "Neutral" },
                { value: 3, label: "Bien" },
                { value: 4, label: "Excelente" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                    feelingScore === option.value
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-700/20 dark:text-brand-300"
                      : "border-ink-200 text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300"
                  }`}
                  onClick={() => setFeelingScore(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notas personales (opcional)">
            <TextArea rows={3} value={retroNotes} onChange={(event) => setRetroNotes(event.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => void skipRetrospective()} disabled={submitting}>
            Omitir
          </Button>
          <Button type="button" onClick={() => void submitRetrospective()} disabled={submitting}>
            Guardar retrospectiva
          </Button>
        </div>
      </section>
    </div>
  );
}
