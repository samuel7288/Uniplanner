import { useEffect, useMemo, useState } from "react";
import { GradeSlider } from "../../components/GradeSlider";
import { Alert, Badge, Button, Card, Field, SelectInput, TextInput } from "../../components/UI";
import type { Grade } from "../../lib/types";

type ScenarioEvaluation = {
  id: string;
  name: string;
  weight: number;
  score: number;
  maxScore: number;
};

type ScenarioSimulatorProps = {
  courseId: string;
  grades: Grade[];
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toTenScale(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return clamp((score / maxScore) * 10, 0, 10);
}

function createScenarioEvaluation(weight: number): ScenarioEvaluation {
  return {
    id: createId(),
    name: "Evaluacion futura",
    weight: Number(weight.toFixed(1)),
    score: 7,
    maxScore: 10,
  };
}

export function ScenarioSimulator({ courseId, grades }: ScenarioSimulatorProps) {
  const coveredWeight = useMemo(() => grades.reduce((sum, grade) => sum + grade.weight, 0), [grades]);

  const currentWeightedPoints = useMemo(
    () => grades.reduce((sum, grade) => sum + toTenScale(grade.score, grade.maxScore) * grade.weight, 0),
    [grades],
  );

  const [futureEvaluations, setFutureEvaluations] = useState<ScenarioEvaluation[]>([]);
  const [finalEvaluationId, setFinalEvaluationId] = useState("");
  const [passingGrade, setPassingGrade] = useState(7);
  const [neededMessage, setNeededMessage] = useState("");
  const [neededMessageTone, setNeededMessageTone] = useState<"info" | "warning" | "success">("info");

  useEffect(() => {
    const remainingWeight = Math.max(0, 100 - coveredWeight);
    const initial = createScenarioEvaluation(remainingWeight > 0 ? remainingWeight : 10);
    setFutureEvaluations([initial]);
    setFinalEvaluationId(initial.id);
    setPassingGrade(7);
    setNeededMessage("");
    setNeededMessageTone("info");
  }, [courseId, coveredWeight]);

  useEffect(() => {
    if (!futureEvaluations.some((item) => item.id === finalEvaluationId)) {
      setFinalEvaluationId(futureEvaluations[0]?.id ?? "");
    }
  }, [futureEvaluations, finalEvaluationId]);

  const futureWeight = useMemo(
    () => futureEvaluations.reduce((sum, evaluation) => sum + evaluation.weight, 0),
    [futureEvaluations],
  );

  const futureWeightedPoints = useMemo(
    () =>
      futureEvaluations.reduce(
        (sum, evaluation) => sum + toTenScale(evaluation.score, evaluation.maxScore) * evaluation.weight,
        0,
      ),
    [futureEvaluations],
  );

  const simulatedWeight = coveredWeight + futureWeight;
  const projectedFinal = (currentWeightedPoints + futureWeightedPoints) / 100;

  const status = useMemo(() => {
    if (projectedFinal >= 7) return { tone: "success" as const, label: "Aprobado" };
    if (projectedFinal >= 5) return { tone: "warning" as const, label: "En riesgo" };
    return { tone: "danger" as const, label: "Reprobado" };
  }, [projectedFinal]);

  const progressClassName = status.tone === "success" ? "bg-accent-600" : status.tone === "warning" ? "bg-amber-500" : "bg-danger-500";

  function updateScenario(id: string, patch: Partial<ScenarioEvaluation>) {
    setFutureEvaluations((prev) =>
      prev.map((evaluation) => {
        if (evaluation.id !== id) return evaluation;
        return { ...evaluation, ...patch };
      }),
    );
  }

  function addScenario() {
    const remainingWeight = Math.max(0, 100 - simulatedWeight);
    const next = createScenarioEvaluation(remainingWeight > 0 ? remainingWeight : 10);
    setFutureEvaluations((prev) => [...prev, next]);
    if (!finalEvaluationId) setFinalEvaluationId(next.id);
  }

  function removeScenario(id: string) {
    setFutureEvaluations((prev) => prev.filter((evaluation) => evaluation.id !== id));
  }

  function parseAndUpdateWeight(id: string, value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    updateScenario(id, { weight: clamp(numericValue, 0, 100) });
  }

  function parseAndUpdateMaxScore(id: string, value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    updateScenario(id, { maxScore: clamp(numericValue, 1, 100) });
  }

  function parsePassingGrade(value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    setPassingGrade(clamp(numericValue, 0, 10));
  }

  function calculateNeededForFinal() {
    const finalEvaluation = futureEvaluations.find((evaluation) => evaluation.id === finalEvaluationId);
    if (!finalEvaluation) {
      setNeededMessage("Selecciona una evaluacion para calcular la nota necesaria.");
      setNeededMessageTone("warning");
      return;
    }

    if (finalEvaluation.weight <= 0) {
      setNeededMessage("La evaluacion final debe tener peso mayor a 0%.");
      setNeededMessageTone("warning");
      return;
    }

    const weightedPointsWithoutFinal =
      currentWeightedPoints +
      futureEvaluations
        .filter((evaluation) => evaluation.id !== finalEvaluation.id)
        .reduce((sum, evaluation) => sum + toTenScale(evaluation.score, evaluation.maxScore) * evaluation.weight, 0);

    const neededOnTen = ((passingGrade * 100) - weightedPointsWithoutFinal) / finalEvaluation.weight;
    const neededRawScore = (neededOnTen / 10) * finalEvaluation.maxScore;

    if (neededOnTen <= 0) {
      setNeededMessage(`Ya alcanzas ${passingGrade.toFixed(1)} sin depender de ${finalEvaluation.name}.`);
      setNeededMessageTone("success");
      return;
    }

    if (neededOnTen > 10) {
      setNeededMessage(`No es alcanzable: necesitaria ${neededOnTen.toFixed(2)}/10 en ${finalEvaluation.name}.`);
      setNeededMessageTone("warning");
      return;
    }

    setNeededMessage(
      `Necesitas ${neededOnTen.toFixed(2)}/10 (${neededRawScore.toFixed(2)}/${finalEvaluation.maxScore.toFixed(1)}) en ${finalEvaluation.name}.`,
    );
    setNeededMessageTone("info");
  }

  return (
    <Card className="bg-ink-50 dark:bg-ink-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Simulador de escenarios</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">
        Ajusta evaluaciones futuras para ver como cambia tu nota final sin tocar el calculo actual del sistema.
      </p>

      <div className="mt-3 grid gap-1 text-sm text-ink-700 dark:text-ink-300">
        <p>Nota actual ponderada: {(currentWeightedPoints / 100).toFixed(2)}</p>
        <p>Nota final proyectada: {projectedFinal.toFixed(2)}</p>
        <p>Cobertura simulada: {simulatedWeight.toFixed(1)}%</p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
        <div
          className={`h-full transition-all ${progressClassName}`}
          style={{ width: `${Math.min(Math.max(simulatedWeight, 0), 100)}%` }}
        />
      </div>

      {simulatedWeight > 100 && (
        <Alert
          tone="warning"
          message="La suma de pesos supera 100%. Ajusta pesos para una proyeccion realista."
          className="mt-3"
        />
      )}

      <div className="mt-4 space-y-3">
        {futureEvaluations.map((evaluation, index) => (
          <div key={evaluation.id} className="rounded-xl border border-ink-200/80 bg-white/70 p-3 dark:border-ink-700 dark:bg-ink-900/40">
            <div className="grid gap-2 md:grid-cols-[1fr,110px,110px,auto]">
              <TextInput
                value={evaluation.name}
                onChange={(event) => updateScenario(evaluation.id, { name: event.target.value })}
                placeholder="Nombre de evaluacion"
              />
              <TextInput
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={evaluation.weight}
                onChange={(event) => parseAndUpdateWeight(evaluation.id, event.target.value)}
                placeholder="Peso %"
                title="Peso en porcentaje"
              />
              <TextInput
                type="number"
                step="0.1"
                min="1"
                value={evaluation.maxScore}
                onChange={(event) => parseAndUpdateMaxScore(evaluation.id, event.target.value)}
                placeholder="Maximo"
                title="Nota maxima"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeScenario(evaluation.id)}
                disabled={futureEvaluations.length === 1}
              >
                Quitar
              </Button>
            </div>

            <div className="mt-3">
              <GradeSlider
                id={`scenario-grade-${evaluation.id}`}
                label={`${evaluation.name || `Escenario ${index + 1}`} (${evaluation.weight.toFixed(1)}%)`}
                value={evaluation.score}
                min={0}
                max={evaluation.maxScore}
                step={0.1}
                helper={`Equivale a ${toTenScale(evaluation.score, evaluation.maxScore).toFixed(2)} sobre 10`}
                onChange={(value) => updateScenario(evaluation.id, { score: value })}
              />
            </div>
          </div>
        ))}

        <Button type="button" variant="ghost" onClick={addScenario}>
          Agregar evaluacion futura
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[120px,1fr,auto] md:items-end">
        <Field label="Meta">
          <TextInput
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={passingGrade}
            onChange={(event) => parsePassingGrade(event.target.value)}
          />
        </Field>

        <Field label="Evaluacion final">
          <SelectInput value={finalEvaluationId} onChange={(event) => setFinalEvaluationId(event.target.value)}>
            {futureEvaluations.map((evaluation) => (
              <option key={evaluation.id} value={evaluation.id}>
                {evaluation.name || "Evaluacion sin nombre"}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Button type="button" onClick={calculateNeededForFinal} disabled={futureEvaluations.length === 0}>
          Cuanto necesito en el final
        </Button>
      </div>

      {neededMessage && (
        <Alert
          tone={neededMessageTone === "success" ? "success" : neededMessageTone === "warning" ? "warning" : "info"}
          message={neededMessage}
          className="mt-3"
        />
      )}
    </Card>
  );
}
