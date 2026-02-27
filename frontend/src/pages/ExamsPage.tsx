import { zodResolver } from "@hookform/resolvers/zod";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { CalendarDaysIcon, ListBulletIcon, Squares2X2Icon, XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageTitle,
  SelectInput,
  TextArea,
  TextInput,
} from "../components/UI";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { api, getErrorMessage } from "../lib/api";
import type {
  Course,
  Exam,
  PaginatedResponse,
  PaginationMeta,
} from "../lib/types";

const EXAMS_FILTERS_KEY = "uniplanner_exams_filters_v1";
const EXAMS_PAGE_KEY = "uniplanner_exams_page_v1";

function parseOffsets(value: string): number[] {
  const parsed = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length > 0 ? parsed : [1440, 360, 60];
}

const examFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "El titulo debe tener al menos 2 caracteres"),
  courseId: z.string().optional(),
  dateTime: z
    .string()
    .min(1, "La fecha y hora es requerida")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Fecha y hora invalida"),
  type: z.enum(["QUIZ", "MIDTERM", "FINAL", "OTHER"]),
  location: z
    .string()
    .max(160, "El lugar no puede exceder 160 caracteres")
    .optional(),
  syllabus: z
    .string()
    .max(1500, "El temario no puede exceder 1500 caracteres")
    .optional(),
  weight: z
    .string()
    .optional()
    .refine((value) => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return true;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
    }, "El peso debe estar entre 0 y 100"),
  reminderOffsets: z
    .string()
    .optional()
    .refine((value) => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return true;
      return trimmed.split(",").every((item) => {
        const parsed = Number(item.trim());
        return Number.isInteger(parsed) && parsed > 0;
      });
    }, "Usa minutos positivos separados por coma (ej: 10080,4320,1440)"),
});

type ExamFormValues = z.infer<typeof examFormSchema>;

const emptyForm: ExamFormValues = {
  title: "",
  courseId: "",
  dateTime: "",
  type: "MIDTERM",
  location: "",
  syllabus: "",
  weight: "",
  reminderOffsets: "10080,4320,1440,360,60",
};

type ExamsFilters = {
  q: string;
  courseId: string;
  type: "" | "QUIZ" | "MIDTERM" | "FINAL" | "OTHER";
  sortBy: "dateTime" | "createdAt" | "type" | "title";
  sortDir: "asc" | "desc";
  limit: number;
};

const defaultFilters: ExamsFilters = {
  q: "",
  courseId: "",
  type: "",
  sortBy: "dateTime",
  sortDir: "asc",
  limit: 10,
};

const defaultPagination: PaginationMeta = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

function loadSavedFilters(): ExamsFilters {
  if (typeof window === "undefined") return defaultFilters;
  const raw = localStorage.getItem(EXAMS_FILTERS_KEY);
  if (!raw) return defaultFilters;
  try {
    return { ...defaultFilters, ...(JSON.parse(raw) as Partial<ExamsFilters>) };
  } catch {
    return defaultFilters;
  }
}

function loadSavedPage(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(localStorage.getItem(EXAMS_PAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function examTypeTone(type: Exam["type"]): "default" | "warning" | "danger" {
  if (type === "FINAL") return "danger";
  if (type === "MIDTERM") return "warning";
  return "default";
}

export function ExamsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExamsFilters>(loadSavedFilters);
  const [page, setPage] = useState<number>(loadSavedPage);
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    id: string | null;
    title: string;
  }>({
    open: false,
    id: null,
    title: "",
  });
  const formAnchorRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: emptyForm,
  });

  const syllabusValue = watch("syllabus") ?? "";

  async function loadCourses() {
    const response = await api.get<Course[]>("/courses");
    setCourses(response.data);
  }

  async function loadExams() {
    const response = await api.get<PaginatedResponse<Exam>>("/exams", {
      params: {
        q: filters.q || undefined,
        courseId: filters.courseId || undefined,
        type: filters.type || undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        limit: filters.limit,
        page,
      },
    });
    setExams(response.data.items);
    setPagination(response.data.pagination);
  }

  useEffect(() => {
    void loadCourses().catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(EXAMS_FILTERS_KEY, JSON.stringify(filters));
      localStorage.setItem(EXAMS_PAGE_KEY, String(page));
    }
  }, [filters, page]);

  useEffect(() => {
    void loadExams().catch((err) => setError(getErrorMessage(err)));
  }, [filters, page]);

  function updateFilters(next: Partial<ExamsFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  }

  const submit = handleSubmit(async (values) => {
    const payload = {
      title: values.title.trim(),
      courseId: values.courseId || null,
      dateTime: new Date(values.dateTime).toISOString(),
      type: values.type,
      location: values.location?.trim() ? values.location.trim() : null,
      syllabus: values.syllabus?.trim() ? values.syllabus.trim() : null,
      weight: values.weight?.trim() ? Number(values.weight.trim()) : null,
      reminderOffsets: parseOffsets(values.reminderOffsets ?? ""),
    };

    try {
      if (editingId) {
        await api.put(`/exams/${editingId}`, payload);
        setEditingId(null);
        reset(emptyForm);
        await loadExams();
        toast.success("Examen actualizado");
      } else {
        const response = await api.post<Exam>("/exams", payload);
        const createdId = response.data.id;
        reset(emptyForm);
        await loadExams();
        toast.custom(
          (t) => (
            <div
              className={clsx(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-panel",
                "border-ink-200 bg-white dark:border-ink-700 dark:bg-[var(--surface)]",
                t.visible ? "animate-scale-in" : "opacity-0",
              )}
            >
              <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">
                Examen creado
              </p>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => {
                  void api
                    .delete(`/exams/${createdId}`)
                    .then(() => {
                      void loadExams();
                      toast.dismiss(t.id);
                    })
                    .catch((err) => {
                      toast.error(getErrorMessage(err));
                    });
                }}
              >
                Deshacer
              </Button>
              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="text-ink-400 hover:text-ink-700 dark:text-ink-500"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
          ),
          { duration: 5000 },
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  function edit(exam: Exam) {
    setEditingId(exam.id);
    reset({
      title: exam.title,
      courseId: exam.courseId || "",
      dateTime: exam.dateTime.slice(0, 16),
      type: exam.type,
      location: exam.location || "",
      syllabus: exam.syllabus || "",
      weight: exam.weight?.toString() || "",
      reminderOffsets: exam.reminderOffsets.join(","),
    });
  }

  async function remove(id: string) {
    const snapshot = exams.find((item) => item.id === id);
    try {
      await api.delete(`/exams/${id}`);
      if (exams.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadExams();
      }
      if (snapshot) {
        toast.custom(
          (t) => (
            <div
              className={clsx(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-panel",
                "border-ink-200 bg-white dark:border-ink-700 dark:bg-[var(--surface)]",
                t.visible ? "animate-scale-in" : "opacity-0",
              )}
            >
              <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">
                Examen eliminado
              </p>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => {
                  void api
                    .post("/exams", {
                      title: snapshot.title,
                      courseId: snapshot.courseId || null,
                      dateTime: snapshot.dateTime,
                      type: snapshot.type,
                      reminderOffsets: snapshot.reminderOffsets,
                    })
                    .then(() => {
                      void loadExams();
                      toast.dismiss(t.id);
                    })
                    .catch((err) => {
                      toast.error(getErrorMessage(err));
                    });
                }}
              >
                Deshacer
              </Button>
              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="text-ink-400 hover:text-ink-700 dark:text-ink-500"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
          ),
          { duration: 5000 },
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const tabClass = ({ selected }: { selected: boolean }) =>
    clsx(
      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
      selected
        ? "bg-white text-ink-800 shadow-soft dark:bg-[var(--surface)] dark:text-ink-100"
        : "text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200",
    );

  function scrollToForm() {
    formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Workflow"
        title="Examenes"
        subtitle="Gestiona calendario de evaluaciones con recordatorios configurables."
      />

      {error && <Alert tone="error" message={error} />}

      <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
        <Card>
          <div ref={formAnchorRef} className="scroll-mt-28" />
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">
            {editingId ? "Editar examen" : "Nuevo examen"}
          </h2>
          <form className="mt-3 grid gap-3" onSubmit={submit} noValidate>
            <Field label="Titulo" error={errors.title?.message?.toString()}>
              <TextInput
                {...register("title")}
                aria-invalid={!!errors.title}
                placeholder="Titulo del examen"
              />
            </Field>
            <Field label="Materia">
              <SelectInput {...register("courseId")}>
                <option value="">Sin materia</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Fecha y hora" error={errors.dateTime?.message?.toString()}>
              <TextInput
                type="datetime-local"
                {...register("dateTime")}
                aria-invalid={!!errors.dateTime}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tipo">
                <SelectInput {...register("type")}>
                  <option value="QUIZ">Quiz</option>
                  <option value="MIDTERM">Parcial</option>
                  <option value="FINAL">Final</option>
                  <option value="OTHER">Otro</option>
                </SelectInput>
              </Field>
              <Field label="Peso %" error={errors.weight?.message?.toString()}>
                <TextInput type="number" step="0.1" {...register("weight")} />
              </Field>
            </div>
            <Field label="Lugar" error={errors.location?.message?.toString()}>
              <TextInput {...register("location")} />
            </Field>
            <Field
              label="Temario"
              helper={`${syllabusValue.length}/1500`}
              error={errors.syllabus?.message?.toString()}
            >
              <TextArea rows={3} {...register("syllabus")} />
            </Field>
            <Field
              label="Offsets recordatorio (minutos, coma)"
              error={errors.reminderOffsets?.message?.toString()}
            >
              <TextInput {...register("reminderOffsets")} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {editingId ? "Guardar cambios" : "Crear examen"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    reset(emptyForm);
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </Card>

        <Card>
          <div className="sticky top-[4.7rem] z-10 rounded-2xl border border-ink-200 bg-ink-50/35 p-3 dark:border-ink-700 dark:bg-ink-800/30">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <TextInput
                placeholder="Buscar examen"
                value={filters.q}
                onChange={(event) => updateFilters({ q: event.target.value })}
              />
              <SelectInput
                value={filters.courseId}
                onChange={(event) => updateFilters({ courseId: event.target.value })}
              >
                <option value="">Todas las materias</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                value={filters.type}
                onChange={(event) =>
                  updateFilters({ type: event.target.value as ExamsFilters["type"] })
                }
              >
                <option value="">Todos los tipos</option>
                <option value="QUIZ">Quiz</option>
                <option value="MIDTERM">Parcial</option>
                <option value="FINAL">Final</option>
                <option value="OTHER">Otro</option>
              </SelectInput>
              <SelectInput
                value={filters.sortBy}
                onChange={(event) =>
                  updateFilters({ sortBy: event.target.value as ExamsFilters["sortBy"] })
                }
              >
                <option value="dateTime">Por fecha</option>
                <option value="createdAt">Por creado</option>
                <option value="type">Por tipo</option>
                <option value="title">Por titulo</option>
              </SelectInput>
              <SelectInput
                value={filters.sortDir}
                onChange={(event) =>
                  updateFilters({ sortDir: event.target.value as ExamsFilters["sortDir"] })
                }
              >
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </SelectInput>
              <SelectInput
                value={String(filters.limit)}
                onChange={(event) => updateFilters({ limit: Number(event.target.value) })}
              >
                <option value="10">10 por pagina</option>
                <option value="20">20 por pagina</option>
                <option value="30">30 por pagina</option>
              </SelectInput>
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
            Mostrando {exams.length} de {pagination.total} resultados
          </p>

          <TabGroup className="mt-4">
            <TabList className="mb-3 flex gap-1 rounded-xl border border-ink-200 bg-ink-50/60 p-1 dark:border-ink-700 dark:bg-ink-800/40">
              <Tab className={tabClass}>
                <ListBulletIcon className="size-3.5" />
                Vista lista
              </Tab>
              <Tab className={tabClass}>
                <Squares2X2Icon className="size-3.5" />
                Vista tarjetas
              </Tab>
              <Tab className={tabClass}>
                <CalendarDaysIcon className="size-3.5" />
                Timeline
              </Tab>
            </TabList>

            <TabPanels>
              <TabPanel>
                <div className="space-y-3">
                  {exams.map((exam, index) => (
                    <article
                      key={exam.id}
                      className={clsx(
                        "animate-stagger-in rounded-xl border border-ink-200 p-3 dark:border-ink-700",
                        `stagger-${Math.min(index + 1, 6)}`,
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-ink-900 dark:text-ink-100">
                            {exam.title}
                          </h3>
                          <p className="text-sm text-ink-500 dark:text-ink-400">
                            {exam.course?.name || "Sin materia"} - {" "}
                            {format(new Date(exam.dateTime), "dd/MM HH:mm")}
                            {exam.weight && ` - ${exam.weight}%`}
                          </p>
                        </div>
                        <Badge tone={examTypeTone(exam.type)}>{exam.type}</Badge>
                      </div>
                      {exam.syllabus && (
                        <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">
                          {exam.syllabus}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
                        Recordatorios: {exam.reminderOffsets.join(", ")} min
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => edit(exam)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            setConfirmDelete({ open: true, id: exam.id, title: exam.title })
                          }
                        >
                          Eliminar
                        </Button>
                      </div>
                    </article>
                  ))}
                  {exams.length === 0 && (
                    <EmptyState
                      context="exams"
                      title="Sin examenes"
                      description="Registra tu primer examen para activar recordatorios."
                      action={
                        <Button type="button" onClick={scrollToForm}>
                          Crear examen
                        </Button>
                      }
                    />
                  )}
                </div>
              </TabPanel>

              <TabPanel>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {exams.map((exam, index) => (
                    <div
                      key={exam.id}
                      className={clsx(
                        "animate-stagger-in flex flex-col rounded-2xl border border-ink-200 bg-white p-4 shadow-soft transition hover:border-ink-300 dark:border-ink-700 dark:bg-[var(--surface)] dark:hover:border-ink-600",
                        `stagger-${Math.min(index + 1, 6)}`,
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-tight text-ink-900 dark:text-ink-100">
                          {exam.title}
                        </h3>
                        <Badge tone={examTypeTone(exam.type)} className="shrink-0">
                          {exam.type}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                        {exam.course?.name || "Sin materia"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-ink-600 dark:text-ink-400">
                        {format(new Date(exam.dateTime), "dd/MM/yyyy HH:mm")}
                        {exam.weight && ` - ${exam.weight}%`}
                      </p>
                      {exam.location && (
                        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                          Lugar: {exam.location}
                        </p>
                      )}
                      <div className="mt-auto flex gap-1.5 pt-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => edit(exam)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            setConfirmDelete({ open: true, id: exam.id, title: exam.title })
                          }
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                  {exams.length === 0 && (
                    <div className="col-span-full">
                      <EmptyState
                        context="exams"
                        title="Sin examenes"
                        description="Registra tu primer examen para activar recordatorios."
                        action={
                          <Button type="button" onClick={scrollToForm}>
                            Crear examen
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              </TabPanel>

              <TabPanel>
                {exams.length === 0 ? (
                  <EmptyState
                    context="exams"
                    title="Sin examenes"
                    description="Registra tu primer examen para activar recordatorios."
                    action={
                      <Button type="button" onClick={scrollToForm}>
                        Crear examen
                      </Button>
                    }
                  />
                ) : (
                  <ol className="relative ml-2 space-y-3 border-l border-ink-200 pl-4 dark:border-ink-700">
                    {[...exams]
                      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
                      .map((exam, index) => (
                        <li
                          key={exam.id}
                          className={clsx(
                            "animate-stagger-in relative rounded-xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-[var(--surface)]/70",
                            `stagger-${Math.min(index + 1, 6)}`,
                          )}
                        >
                          <span
                            className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border border-white bg-brand-500 dark:border-[var(--surface)]"
                            aria-hidden="true"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-ink-900 dark:text-ink-100">{exam.title}</p>
                            <p className="text-xs font-semibold text-ink-600 dark:text-ink-400">
                              {format(new Date(exam.dateTime), "EEE dd/MM HH:mm")}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                            {exam.course?.name || "Sin materia"}
                            {exam.location ? ` - ${exam.location}` : ""}
                          </p>
                          <div className="mt-2 flex gap-1.5">
                            <Badge tone={examTypeTone(exam.type)}>{exam.type}</Badge>
                            {typeof exam.weight === "number" && (
                              <Badge tone="default">{exam.weight}%</Badge>
                            )}
                          </div>
                        </li>
                      ))}
                  </ol>
                )}
              </TabPanel>
            </TabPanels>
          </TabGroup>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-ink-600 dark:text-ink-400">
              Pagina {pagination.page} de {Math.max(1, pagination.totalPages)}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!pagination.hasPrev}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!pagination.hasNext}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete.open}
        title="Eliminar examen"
        description={
          <span>
            Confirmas eliminar <strong>"{confirmDelete.title}"</strong>? Esta accion no se puede deshacer.
          </span>
        }
        onConfirm={async () => {
          if (confirmDelete.id) await remove(confirmDelete.id);
          setConfirmDelete({ open: false, id: null, title: "" });
        }}
        onCancel={() => setConfirmDelete({ open: false, id: null, title: "" })}
      />
    </div>
  );
}
