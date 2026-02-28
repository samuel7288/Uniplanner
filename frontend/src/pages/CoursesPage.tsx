import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ImportCoursesModal } from "../components/ImportCoursesModal";
import { ImportSchedulePdfModal } from "../components/ImportSchedulePdfModal";
import { Alert, Button, Card, EmptyState, Field, PageTitle, SelectInput, TextInput } from "../components/UI";
import { api, getErrorMessage, gradeCategoriesApi } from "../lib/api";
import type { Course, Grade, GradeCategory } from "../lib/types";
import { ScenarioSimulator } from "./grades/ScenarioSimulator";

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

type GradeProjection = {
  currentAverage: number;
  projectedFinal: number;
  coveredWeight: number;
  neededAverageForTarget: number | null;
  feasible: boolean;
};

const dayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function avg10(grades: Grade[]): number | null {
  if (!grades.length) return null;
  return grades.reduce((acc, g) => acc + (g.maxScore > 0 ? (g.score / g.maxScore) * 10 : 0), 0) / grades.length;
}

function avgTone(value: number): string {
  if (value >= 7) return "text-emerald-700 dark:text-emerald-400";
  if (value >= 5) return "text-amber-700 dark:text-amber-400";
  return "text-rose-700 dark:text-rose-400";
}

export function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [categories, setCategories] = useState<GradeCategory[]>([]);
  const [projection, setProjection] = useState<GradeProjection | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pdfImportModalOpen, setPdfImportModalOpen] = useState(false);
  const [target, setTarget] = useState("7");
  const [error, setError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const formAnchorRef = useRef<HTMLDivElement>(null);
  const gradeFormRef = useRef<HTMLDivElement>(null);

  const [courseForm, setCourseForm] = useState({
    name: "",
    code: "",
    teacher: "",
    credits: "",
    color: "#2563eb",
    semester: "",
  });
  const [sessionForm, setSessionForm] = useState({
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "10:30",
    room: "",
    modality: "PRESENTIAL",
  });
  const [gradeForm, setGradeForm] = useState({
    name: "",
    score: "",
    maxScore: "10",
    weight: "",
    categoryId: "",
  });
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [editingGradeForm, setEditingGradeForm] = useState({
    name: "",
    score: "",
    maxScore: "10",
    weight: "",
    categoryId: "",
  });
  const [categoryForm, setCategoryForm] = useState({ name: "", weight: "" });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryForm, setEditingCategoryForm] = useState({ name: "", weight: "" });

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const definedCategoryWeight = useMemo(
    () => categories.reduce((sum, category) => sum + category.weight, 0),
    [categories],
  );

  const groupedGrades = useMemo(() => {
    const list = detail?.grades ?? [];
    const byCategory = categories.map((category) => ({
      category,
      grades: list.filter((grade) => grade.categoryId === category.id),
    }));
    const knownIds = new Set(categories.map((category) => category.id));
    const uncategorized = list.filter((grade) => !grade.categoryId || !knownIds.has(grade.categoryId));
    return { byCategory, uncategorized };
  }, [categories, detail?.grades]);

  async function loadCourses() {
    const response = await api.get<Course[]>("/courses");
    setCourses(response.data);
    if (!selectedCourseId && response.data.length > 0) setSelectedCourseId(response.data[0].id);
    return response.data;
  }

  async function loadDetail(courseId: string) {
    const [detailResponse, projectionResponse, categoriesResponse, gradesResponse] = await Promise.all([
      api.get<CourseDetail>(`/courses/${courseId}`),
      api.get<GradeProjection>(`/courses/${courseId}/grade-projection`, {
        params: { target: Number(target) || 7 },
      }),
      gradeCategoriesApi.list(courseId),
      api.get<{ items: Grade[] }>("/grades", { params: { courseId, limit: 200 } }),
    ]);

    setDetail({
      ...detailResponse.data,
      grades: gradesResponse.data.items,
    });
    setProjection(projectionResponse.data);
    setCategories(categoriesResponse);
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

  async function addGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) return;
    const categoryId = gradeForm.categoryId || null;
    const parsedWeight = categoryId ? 0 : Number(gradeForm.weight);
    if (!categoryId && (!Number.isFinite(parsedWeight) || parsedWeight <= 0)) {
      setError("El peso individual debe ser mayor a 0 para notas sin categoria.");
      return;
    }
    try {
      await api.post("/grades", {
        courseId: selectedCourseId,
        name: gradeForm.name,
        score: Number(gradeForm.score),
        maxScore: Number(gradeForm.maxScore),
        weight: parsedWeight,
        categoryId,
      });
      setGradeForm({ name: "", score: "", maxScore: "10", weight: "", categoryId: "" });
      await loadDetail(selectedCourseId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function beginEditGrade(grade: Grade) {
    setEditingGradeId(grade.id);
    setEditingGradeForm({
      name: grade.name,
      score: String(grade.score),
      maxScore: String(grade.maxScore),
      weight: String(grade.weight),
      categoryId: grade.categoryId ?? "",
    });
  }

  async function saveEditGrade() {
    if (!editingGradeId) return;
    const categoryId = editingGradeForm.categoryId || null;
    const parsedWeight = categoryId ? 0 : Number(editingGradeForm.weight);
    if (!categoryId && (!Number.isFinite(parsedWeight) || parsedWeight <= 0)) {
      setError("El peso individual debe ser mayor a 0 para notas sin categoria.");
      return;
    }
    try {
      await api.put(`/grades/${editingGradeId}`, {
        name: editingGradeForm.name,
        score: Number(editingGradeForm.score),
        maxScore: Number(editingGradeForm.maxScore),
        weight: parsedWeight,
        categoryId,
      });
      setEditingGradeId(null);
      await loadDetail(selectedCourseId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function removeGrade(gradeId: string) {
    try {
      await api.delete(`/grades/${gradeId}`);
      if (editingGradeId === gradeId) setEditingGradeId(null);
      await loadDetail(selectedCourseId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) return;
    try {
      await gradeCategoriesApi.create(selectedCourseId, {
        name: categoryForm.name,
        weight: Number(categoryForm.weight),
      });
      setCategoryForm({ name: "", weight: "" });
      await loadDetail(selectedCourseId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function updateCategory(categoryId: string) {
    try {
      await gradeCategoriesApi.update(categoryId, {
        name: editingCategoryForm.name,
        weight: Number(editingCategoryForm.weight),
      });
      setEditingCategoryId(null);
      await loadDetail(selectedCourseId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!window.confirm("Eliminar categoria? Las notas quedaran sin categoria.")) return;
    try {
      await gradeCategoriesApi.remove(categoryId);
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
      setCategories([]);
      await loadCourses();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function scrollToCourseForm() {
    formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToGradeForm(categoryId?: string) {
    if (categoryId) setGradeForm((prev) => ({ ...prev, categoryId }));
    gradeFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleImportedCourses(): Promise<void> {
    const loaded = await loadCourses();
    const hasSelected = loaded.some((course) => course.id === selectedCourseId);
    const nextId = hasSelected ? selectedCourseId : (loaded[0]?.id ?? "");
    setSelectedCourseId(nextId);
    if (nextId) {
      await loadDetail(nextId);
    } else {
      setDetail(null);
      setProjection(null);
      setCategories([]);
    }
  }

  function renderGradeRow(grade: Grade, showWeight: boolean) {
    if (editingGradeId === grade.id) {
      return (
        <div key={grade.id} className="rounded-lg border border-ink-200 bg-white/70 p-3 dark:border-ink-700 dark:bg-ink-900/50">
          <div className="grid gap-2 md:grid-cols-5">
            <TextInput
              value={editingGradeForm.name}
              onChange={(event) => setEditingGradeForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextInput
              type="number"
              step="0.1"
              value={editingGradeForm.score}
              onChange={(event) => setEditingGradeForm((prev) => ({ ...prev, score: event.target.value }))}
            />
            <TextInput
              type="number"
              step="0.1"
              value={editingGradeForm.maxScore}
              onChange={(event) => setEditingGradeForm((prev) => ({ ...prev, maxScore: event.target.value }))}
            />
            <SelectInput
              value={editingGradeForm.categoryId}
              onChange={(event) => setEditingGradeForm((prev) => ({ ...prev, categoryId: event.target.value }))}
            >
              <option value="">Sin categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectInput>
            <TextInput
              type="number"
              step="0.1"
              value={editingGradeForm.weight}
              onChange={(event) => setEditingGradeForm((prev) => ({ ...prev, weight: event.target.value }))}
              disabled={Boolean(editingGradeForm.categoryId)}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={() => void saveEditGrade()}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingGradeId(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div key={grade.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white/70 px-3 py-2 dark:border-ink-700 dark:bg-ink-900/50">
        <div>
          <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">{grade.name}</p>
          <p className="text-xs text-ink-600 dark:text-ink-400">
            {grade.score}/{grade.maxScore}
            {showWeight ? ` • peso ${grade.weight}%` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => beginEditGrade(grade)}>
            Editar
          </Button>
          <Button type="button" size="sm" variant="danger" onClick={() => void removeGrade(grade.id)}>
            Eliminar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Materias" subtitle="CRUD de materias, categorias de evaluacion y promedio ponderado en tiempo real" />
      {error && <Alert tone="error" message={error} />}

      <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
        <Card>
          <div ref={formAnchorRef} className="scroll-mt-28" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">Nueva materia</h2>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setImportModalOpen(true)}>
                Importar Excel
              </Button>
              <Button type="button" variant="subtle" size="sm" onClick={() => setPdfImportModalOpen(true)}>
                Importar PDF
              </Button>
            </div>
          </div>
          <form className="mt-3 grid gap-3" onSubmit={createCourse}>
            <Field label="Nombre">
              <TextInput value={courseForm.name} onChange={(event) => setCourseForm((prev) => ({ ...prev, name: event.target.value }))} required />
            </Field>
            <Field label="Codigo">
              <TextInput value={courseForm.code} onChange={(event) => setCourseForm((prev) => ({ ...prev, code: event.target.value }))} required />
            </Field>
            <Field label="Docente">
              <TextInput value={courseForm.teacher} onChange={(event) => setCourseForm((prev) => ({ ...prev, teacher: event.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Creditos">
                <TextInput type="number" value={courseForm.credits} onChange={(event) => setCourseForm((prev) => ({ ...prev, credits: event.target.value }))} />
              </Field>
              <Field label="Periodo">
                <TextInput value={courseForm.semester} onChange={(event) => setCourseForm((prev) => ({ ...prev, semester: event.target.value }))} />
              </Field>
            </div>
            <Field label="Color">
              <TextInput type="color" value={courseForm.color} onChange={(event) => setCourseForm((prev) => ({ ...prev, color: event.target.value }))} />
            </Field>
            <Button type="submit">Guardar materia</Button>
          </form>

          <div className="mt-6 max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto pr-1">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Tus materias</h3>
            {courses.length === 0 ? (
              <EmptyState
                context="courses"
                title="Sin materias"
                description="Crea tu primera materia para empezar."
                action={<Button type="button" onClick={scrollToCourseForm}>Crear materia</Button>}
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
              action={<Button type="button" onClick={scrollToCourseForm}>Crear materia</Button>}
            />
          )}
          {selectedCourse && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100">{selectedCourse.name}</h2>
                <p className="text-sm text-ink-500 dark:text-ink-400">
                  {selectedCourse.code} • {selectedCourse.teacher || "Sin docente"}
                </p>
                <div className="mt-2">
                  <Button type="button" variant="danger" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
                    Eliminar materia
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="bg-ink-50 dark:bg-ink-800">
                  <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Horario</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    {detail?.classSessions?.length ? (
                      detail.classSessions.map((session) => (
                        <p key={session.id} className="text-ink-700 dark:text-ink-300">
                          {dayLabels[session.dayOfWeek]} {session.startTime}-{session.endTime} • {session.room || session.modality}
                        </p>
                      ))
                    ) : (
                      <p className="text-ink-500 dark:text-ink-400">Sin sesiones registradas.</p>
                    )}
                  </div>
                  <form className="mt-3 grid gap-2" onSubmit={addSession}>
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput type="number" min="0" max="6" value={sessionForm.dayOfWeek} onChange={(event) => setSessionForm((prev) => ({ ...prev, dayOfWeek: event.target.value }))} title="0=Dom,1=Lun...6=Sab" />
                      <TextInput value={sessionForm.room} onChange={(event) => setSessionForm((prev) => ({ ...prev, room: event.target.value }))} placeholder="Salon o link" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput type="time" value={sessionForm.startTime} onChange={(event) => setSessionForm((prev) => ({ ...prev, startTime: event.target.value }))} />
                      <TextInput type="time" value={sessionForm.endTime} onChange={(event) => setSessionForm((prev) => ({ ...prev, endTime: event.target.value }))} />
                    </div>
                    <SelectInput value={sessionForm.modality} onChange={(event) => setSessionForm((prev) => ({ ...prev, modality: event.target.value }))}>
                      <option value="PRESENTIAL">Presencial</option>
                      <option value="ONLINE">Online</option>
                    </SelectInput>
                    <Button type="submit" variant="ghost">Agregar sesion</Button>
                  </form>
                </Card>

                <Card className="bg-ink-50 dark:bg-ink-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Categorias</h3>
                    <p className="text-xs text-ink-500 dark:text-ink-400">{definedCategoryWeight.toFixed(1)}% definido</p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-ink-200 dark:bg-ink-700">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, definedCategoryWeight))}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-600 dark:text-ink-400">Faltan {Math.max(0, 100 - definedCategoryWeight).toFixed(1)}%.</p>

                  <div className="mt-3 space-y-2">
                    {categories.map((category) => (
                      <div key={category.id} className="rounded-lg border border-ink-200 bg-white/70 p-2 dark:border-ink-700 dark:bg-ink-900/40">
                        {editingCategoryId === category.id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <TextInput value={editingCategoryForm.name} onChange={(event) => setEditingCategoryForm((prev) => ({ ...prev, name: event.target.value }))} />
                              <TextInput type="number" step="0.1" value={editingCategoryForm.weight} onChange={(event) => setEditingCategoryForm((prev) => ({ ...prev, weight: event.target.value }))} />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={() => void updateCategory(category.id)}>Guardar</Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingCategoryId(null)}>Cancelar</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">{category.name} • {category.weight}%</p>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingCategoryId(category.id);
                                  setEditingCategoryForm({ name: category.name, weight: String(category.weight) });
                                }}
                              >
                                Editar
                              </Button>
                              <Button type="button" size="sm" variant="danger" onClick={() => void deleteCategory(category.id)}>Eliminar</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {categories.length === 0 && <p className="text-sm text-ink-500 dark:text-ink-400">Aun no hay categorias.</p>}
                  </div>

                  <form className="mt-3 grid gap-2" onSubmit={createCategory}>
                    <TextInput placeholder="Nombre de categoria" value={categoryForm.name} onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    <TextInput type="number" step="0.1" placeholder="Peso %" value={categoryForm.weight} onChange={(event) => setCategoryForm((prev) => ({ ...prev, weight: event.target.value }))} required />
                    <Button type="submit" variant="ghost">Agregar categoria</Button>
                  </form>
                </Card>

                <Card className="bg-ink-50 dark:bg-ink-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Promedio</h3>
                    <TextInput type="number" step="0.1" min="0" max="10" value={target} onChange={(event) => setTarget(event.target.value)} className="w-20" />
                  </div>
                  {projection ? (
                    <>
                      <p className={`mt-2 text-3xl font-semibold ${avgTone(projection.currentAverage)}`}>{projection.currentAverage.toFixed(2)}</p>
                      <p className="text-sm text-ink-600 dark:text-ink-400">Proyeccion final: {projection.projectedFinal.toFixed(2)}</p>
                      <p className="text-sm text-ink-600 dark:text-ink-400">Necesitas: {projection.neededAverageForTarget?.toFixed(2) || "-"}</p>
                      <p className={projection.feasible ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-rose-700 dark:text-rose-400"}>
                        {projection.feasible ? "Meta alcanzable" : "Meta dificil/imposible"}
                      </p>
                      <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">{projection.coveredWeight.toFixed(1)}% cubierto</p>
                      <div className="mt-1 h-2 rounded-full bg-ink-200 dark:bg-ink-700">
                        <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.min(100, Math.max(0, projection.coveredWeight))}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">Sin datos.</p>
                  )}
                </Card>
              </div>

              {detail && detail.id === selectedCourseId && (
                <ScenarioSimulator courseId={selectedCourseId} grades={(detail.grades ?? []).filter((grade) => !grade.categoryId)} />
              )}

              <div className="space-y-3">
                {groupedGrades.byCategory.map(({ category, grades }) => {
                  const average = avg10(grades);
                  return (
                    <Card key={category.id} className="bg-ink-50 dark:bg-ink-800">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">{category.name} • {category.weight}%</h3>
                        <p className={`text-sm font-semibold ${avgTone(average ?? 0)}`}>promedio: {average !== null ? average.toFixed(2) : "--"}</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {grades.length === 0 ? (
                          <p className="text-sm text-ink-500 dark:text-ink-400">Sin evaluaciones en esta categoria.</p>
                        ) : (
                          grades.map((grade) => renderGradeRow(grade, false))
                        )}
                      </div>
                      <div className="mt-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => scrollToGradeForm(category.id)}>
                          + Agregar nota en {category.name}
                        </Button>
                      </div>
                    </Card>
                  );
                })}

                <Card className="bg-ink-50 dark:bg-ink-800">
                  <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Sin categoria • peso individual</h3>
                  <div className="mt-3 space-y-2">
                    {groupedGrades.uncategorized.length === 0 ? (
                      <p className="text-sm text-ink-500 dark:text-ink-400">No hay notas sin categoria.</p>
                    ) : (
                      groupedGrades.uncategorized.map((grade) => renderGradeRow(grade, true))
                    )}
                  </div>
                </Card>
              </div>

              <Card className="bg-ink-50 dark:bg-ink-800">
                <div ref={gradeFormRef} className="scroll-mt-24" />
                <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Agregar evaluacion</h3>
                <form className="mt-2 grid gap-2" onSubmit={addGrade}>
                  <TextInput placeholder="Nombre" value={gradeForm.name} onChange={(event) => setGradeForm((prev) => ({ ...prev, name: event.target.value }))} required />
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <TextInput type="number" step="0.1" placeholder="Nota" value={gradeForm.score} onChange={(event) => setGradeForm((prev) => ({ ...prev, score: event.target.value }))} required />
                    <TextInput type="number" step="0.1" placeholder="Max" value={gradeForm.maxScore} onChange={(event) => setGradeForm((prev) => ({ ...prev, maxScore: event.target.value }))} required />
                    <SelectInput value={gradeForm.categoryId} onChange={(event) => setGradeForm((prev) => ({ ...prev, categoryId: event.target.value }))}>
                      <option value="">Sin categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </SelectInput>
                    <TextInput
                      type="number"
                      step="0.1"
                      placeholder="Peso %"
                      value={gradeForm.weight}
                      onChange={(event) => setGradeForm((prev) => ({ ...prev, weight: event.target.value }))}
                      disabled={Boolean(gradeForm.categoryId)}
                      required={!gradeForm.categoryId}
                    />
                  </div>
                  {gradeForm.categoryId && <p className="text-xs text-ink-500 dark:text-ink-400">Esta nota usa el peso de la categoria.</p>}
                  <Button type="submit">Guardar evaluacion</Button>
                </form>
              </Card>
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
      <ImportCoursesModal open={importModalOpen} onClose={() => setImportModalOpen(false)} onImported={handleImportedCourses} />
      <ImportSchedulePdfModal
        open={pdfImportModalOpen}
        onClose={() => setPdfImportModalOpen(false)}
        onImported={handleImportedCourses}
      />
    </div>
  );
}
