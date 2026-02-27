import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, getErrorMessage } from "../lib/api";
import type { Course, Grade } from "../lib/types";
import { Alert, Button, Card, EmptyState, Field, PageTitle, SelectInput, TextInput } from "../components/UI";
import { ConfirmDialog } from "../components/ConfirmDialog";

type CourseDetail = Course & {
  classSessions: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    room?: string | null;
    modality: "PRESENTIAL" | "ONLINE";
  }>;
  grades: Grade[];
};

const dayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

export function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [projection, setProjection] = useState<{
    currentAverage: number;
    projectedFinal: number;
    neededAverageForTarget: number | null;
    feasible: boolean;
  } | null>(null);
  const [target, setTarget] = useState("7");
  const [error, setError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const formAnchorRef = useRef<HTMLDivElement>(null);

  const [courseForm, setCourseForm] = useState({
    name: "",
    code: "",
    teacher: "",
    credits: "",
    color: "#2563eb",
    semester: "",
  });

  const [gradeForm, setGradeForm] = useState({
    name: "",
    score: "",
    maxScore: "10",
    weight: "",
  });
  const [sessionForm, setSessionForm] = useState({
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "10:30",
    room: "",
    modality: "PRESENTIAL",
  });

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  async function loadCourses() {
    const response = await api.get<Course[]>("/courses");
    setCourses(response.data);
    if (!selectedCourseId && response.data.length > 0) {
      setSelectedCourseId(response.data[0].id);
    }
  }

  async function loadDetail(courseId: string) {
    const [detailResponse, projectionResponse] = await Promise.all([
      api.get<CourseDetail>(`/courses/${courseId}`),
      api.get(`/courses/${courseId}/grade-projection`, {
        params: {
          target: Number(target) || 7,
        },
      }),
    ]);

    setDetail(detailResponse.data);
    setProjection(projectionResponse.data);
  }

  useEffect(() => {
    void loadCourses().catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    if (!selectedCourseId) return;
    void loadDetail(selectedCourseId).catch((err) => setError(getErrorMessage(err)));
  }, [selectedCourseId, target]);

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      await api.post("/courses", {
        ...courseForm,
        credits: courseForm.credits ? Number(courseForm.credits) : null,
      });

      setCourseForm({
        name: "",
        code: "",
        teacher: "",
        credits: "",
        color: "#2563eb",
        semester: "",
      });

      await loadCourses();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function addGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) return;

    try {
      await api.post("/grades", {
        courseId: selectedCourseId,
        name: gradeForm.name,
        score: Number(gradeForm.score),
        maxScore: Number(gradeForm.maxScore),
        weight: Number(gradeForm.weight),
      });

      setGradeForm({ name: "", score: "", maxScore: "10", weight: "" });
      await loadDetail(selectedCourseId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) return;

    try {
      await api.post(`/courses/${selectedCourseId}/class-sessions`, {
        dayOfWeek: Number(sessionForm.dayOfWeek),
        startTime: sessionForm.startTime,
        endTime: sessionForm.endTime,
        room: sessionForm.room || null,
        modality: sessionForm.modality,
      });

      await loadDetail(selectedCourseId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function removeSelectedCourse() {
    if (!selectedCourseId) return;
    try {
      await api.delete(`/courses/${selectedCourseId}`);
      setSelectedCourseId("");
      setDetail(null);
      setProjection(null);
      await loadCourses();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function scrollToCourseForm() {
    formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Materias" subtitle="CRUD de materias, horario por materia y analitica de notas" />

      {error && <Alert tone="error" message={error} />}

      <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
        <Card>
          <div ref={formAnchorRef} className="scroll-mt-28" />
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">Nueva materia</h2>
          <form className="mt-3 grid gap-3" onSubmit={createCourse}>
            <Field label="Nombre">
              <TextInput
                value={courseForm.name}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </Field>
            <Field label="Codigo">
              <TextInput
                value={courseForm.code}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, code: event.target.value }))}
                required
              />
            </Field>
            <Field label="Docente">
              <TextInput
                value={courseForm.teacher}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, teacher: event.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Creditos">
                <TextInput
                  type="number"
                  value={courseForm.credits}
                  onChange={(event) => setCourseForm((prev) => ({ ...prev, credits: event.target.value }))}
                />
              </Field>
              <Field label="Periodo">
                <TextInput
                  value={courseForm.semester}
                  onChange={(event) => setCourseForm((prev) => ({ ...prev, semester: event.target.value }))}
                />
              </Field>
            </div>
            <Field label="Color">
              <TextInput
                type="color"
                value={courseForm.color}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, color: event.target.value }))}
              />
            </Field>
            <Button type="submit">Guardar materia</Button>
          </form>

          <div className="mt-6 space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Tus materias</h3>
            {courses.length === 0 ? (
              <EmptyState
                context="courses"
                title="Sin materias"
                description="Crea tu primera materia para empezar."
                action={
                  <Button type="button" onClick={scrollToCourseForm}>
                    Crear materia
                  </Button>
                }
              />
            ) : (
              courses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    selectedCourseId === course.id
                      ? "border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-700/15 dark:text-brand-300"
                      : "border-ink-200 hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800/60"
                  }`}
                >
                  <p className="font-semibold text-ink-800 dark:text-ink-200">{course.name}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">{course.code}</p>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card>
          {!selectedCourse && (
            <EmptyState
              context="courses"
              title="Sin materia seleccionada"
              description="Selecciona una materia de la lista o crea una nueva."
              action={
                <Button type="button" onClick={scrollToCourseForm}>
                  Crear materia
                </Button>
              }
            />
          )}
          {selectedCourse && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100">{selectedCourse.name}</h2>
                <p className="text-sm text-ink-500 dark:text-ink-400">
                  {selectedCourse.code} - {selectedCourse.teacher || "Sin docente"}
                </p>
                <div className="mt-2">
                  <Button type="button" variant="danger" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
                    Eliminar materia
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-ink-50 dark:bg-ink-800">
                  <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Horario</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    {detail?.classSessions?.length ? (
                      detail.classSessions.map((session) => (
                        <p key={session.id} className="text-ink-700 dark:text-ink-300">
                          {dayLabels[session.dayOfWeek]} {session.startTime}-{session.endTime} - {session.room || session.modality}
                        </p>
                      ))
                    ) : (
                      <p className="text-ink-500 dark:text-ink-400">Sin sesiones registradas.</p>
                    )}
                  </div>
                  <form className="mt-3 grid gap-2" onSubmit={addSession}>
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput
                        type="number"
                        min="0"
                        max="6"
                        value={sessionForm.dayOfWeek}
                        onChange={(event) => setSessionForm((prev) => ({ ...prev, dayOfWeek: event.target.value }))}
                        title="0=Dom, 1=Lun ... 6=Sab"
                      />
                      <TextInput
                        value={sessionForm.room}
                        onChange={(event) => setSessionForm((prev) => ({ ...prev, room: event.target.value }))}
                        placeholder="Salon o link"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput
                        type="time"
                        value={sessionForm.startTime}
                        onChange={(event) => setSessionForm((prev) => ({ ...prev, startTime: event.target.value }))}
                      />
                      <TextInput
                        type="time"
                        value={sessionForm.endTime}
                        onChange={(event) => setSessionForm((prev) => ({ ...prev, endTime: event.target.value }))}
                      />
                    </div>
                    <SelectInput
                      value={sessionForm.modality}
                      onChange={(event) => setSessionForm((prev) => ({ ...prev, modality: event.target.value }))}
                    >
                      <option value="PRESENTIAL">Presencial</option>
                      <option value="ONLINE">Online</option>
                    </SelectInput>
                    <Button type="submit" variant="ghost">
                      Agregar sesion
                    </Button>
                  </form>
                </Card>

                <Card className="bg-ink-50 dark:bg-ink-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Proyeccion</h3>
                    <TextInput
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={target}
                      onChange={(event) => setTarget(event.target.value)}
                      className="w-20"
                    />
                  </div>
                  {projection ? (
                    <div className="mt-2 text-sm text-ink-700 dark:text-ink-300">
                      <p>Promedio actual: {projection.currentAverage.toFixed(2)}</p>
                      <p>Proyeccion final: {projection.projectedFinal.toFixed(2)}</p>
                      <p>Necesitas en lo restante: {projection.neededAverageForTarget?.toFixed(2) || "-"}</p>
                      <p className={projection.feasible ? "text-emerald-700" : "text-rose-700"}>
                        {projection.feasible ? "Meta alcanzable" : "Meta dificil/imposible"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">Sin datos.</p>
                  )}
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-ink-50 dark:bg-ink-800">
                  <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Evaluaciones</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    {detail?.grades?.length ? (
                      detail.grades.map((grade) => (
                        <p key={grade.id} className="text-ink-700 dark:text-ink-300">
                          {grade.name}: {grade.score}/{grade.maxScore} (peso {grade.weight}%)
                        </p>
                      ))
                    ) : (
                      <p className="text-ink-500 dark:text-ink-400">Aun no hay evaluaciones.</p>
                    )}
                  </div>
                </Card>

                <Card className="bg-ink-50 dark:bg-ink-800">
                  <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Agregar evaluacion</h3>
                  <form className="mt-2 grid gap-2" onSubmit={addGrade}>
                    <TextInput
                      placeholder="Nombre"
                      value={gradeForm.name}
                      onChange={(event) => setGradeForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <TextInput
                        type="number"
                        step="0.1"
                        placeholder="Nota"
                        value={gradeForm.score}
                        onChange={(event) => setGradeForm((prev) => ({ ...prev, score: event.target.value }))}
                        required
                      />
                      <TextInput
                        type="number"
                        step="0.1"
                        placeholder="Max"
                        value={gradeForm.maxScore}
                        onChange={(event) => setGradeForm((prev) => ({ ...prev, maxScore: event.target.value }))}
                        required
                      />
                      <TextInput
                        type="number"
                        step="0.1"
                        placeholder="Peso %"
                        value={gradeForm.weight}
                        onChange={(event) => setGradeForm((prev) => ({ ...prev, weight: event.target.value }))}
                        required
                      />
                    </div>
                    <Button type="submit">Guardar evaluacion</Button>
                  </form>
                </Card>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Eliminar materia"
        description={`Confirmas eliminar ${selectedCourse?.name || "esta materia"}? Se borraran sus tareas, examenes y notas asociadas.`}
        onConfirm={async () => {
          await removeSelectedCourse();
          setConfirmDeleteOpen(false);
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
