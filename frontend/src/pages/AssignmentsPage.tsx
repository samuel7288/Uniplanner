import { zodResolver } from "@hookform/resolvers/zod";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { CalendarDaysIcon, ListBulletIcon, Squares2X2Icon, XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { format } from "date-fns";
import { useEffect, useState } from "react";
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
  Assignment,
  Course,
  PaginatedResponse,
  PaginationMeta,
} from "../lib/types";

const ASSIGNMENTS_FILTERS_KEY = "uniplanner_assignments_filters_v1";
const ASSIGNMENTS_PAGE_KEY = "uniplanner_assignments_page_v1";

function parseCSV(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const assignmentFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "El titulo debe tener al menos 2 caracteres"),
  courseId: z.string().optional(),
  dueDate: z
    .string()
    .min(1, "La fecha limite es requerida")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Fecha limite invalida"),
  description: z
    .string()
    .max(1200, "La descripcion no puede exceder 1200 caracteres")
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]),
  repeatRule: z.enum(["NONE", "WEEKLY", "MONTHLY"]),
  tags: z.string().optional(),
  attachmentLinks: z
    .string()
    .optional()
    .refine(
      (value) => parseCSV(value ?? "").every((link) => isValidHttpUrl(link)),
      "Cada adjunto debe ser un link valido (http/https)",
    ),
});

type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

const emptyForm: AssignmentFormValues = {
  title: "",
  courseId: "",
  dueDate: "",
  description: "",
  priority: "MEDIUM",
  status: "PENDING",
  repeatRule: "NONE",
  tags: "",
  attachmentLinks: "",
};

type AssignmentFilters = {
  status: "" | "PENDING" | "IN_PROGRESS" | "DONE";
  courseId: string;
  q: string;
  sortBy: "dueDate" | "createdAt" | "priority" | "status" | "title";
  sortDir: "asc" | "desc";
  limit: number;
};

const defaultFilters: AssignmentFilters = {
  status: "",
  courseId: "",
  q: "",
  sortBy: "dueDate",
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

function loadSavedFilters(): AssignmentFilters {
  if (typeof window === "undefined") return defaultFilters;
  const raw = localStorage.getItem(ASSIGNMENTS_FILTERS_KEY);
  if (!raw) return defaultFilters;
  try {
    return { ...defaultFilters, ...(JSON.parse(raw) as Partial<AssignmentFilters>) };
  } catch {
    return defaultFilters;
  }
}

function loadSavedPage(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(localStorage.getItem(ASSIGNMENTS_PAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function statusTone(status: Assignment["status"]): "default" | "warning" | "success" {
  if (status === "DONE") return "success";
  if (status === "IN_PROGRESS") return "warning";
  return "default";
}

function priorityTone(priority: string): "default" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "default";
}

export function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AssignmentFilters>(loadSavedFilters);
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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: emptyForm,
  });

  const descriptionValue = watch("description") ?? "";

  async function loadCourses() {
    const response = await api.get<Course[]>("/courses");
    setCourses(response.data);
  }

  async function loadAssignments() {
    const response = await api.get<PaginatedResponse<Assignment>>("/assignments", {
      params: {
        status: filters.status || undefined,
        courseId: filters.courseId || undefined,
        q: filters.q || undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        limit: filters.limit,
        page,
      },
    });
    setAssignments(response.data.items);
    setPagination(response.data.pagination);
  }

  useEffect(() => {
    void loadCourses().catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ASSIGNMENTS_FILTERS_KEY, JSON.stringify(filters));
      localStorage.setItem(ASSIGNMENTS_PAGE_KEY, String(page));
    }
  }, [filters, page]);

  useEffect(() => {
    void loadAssignments().catch((err) => setError(getErrorMessage(err)));
  }, [filters, page]);

  function updateFilters(next: Partial<AssignmentFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  }

  const onSubmit = handleSubmit(async (values) => {
    setError("");

    const payload = {
      title: values.title.trim(),
      courseId: values.courseId || null,
      dueDate: new Date(values.dueDate).toISOString(),
      description: values.description?.trim() ? values.description.trim() : null,
      priority: values.priority,
      status: values.status,
      repeatRule: values.repeatRule,
      tags: parseCSV(values.tags ?? ""),
      attachmentLinks: parseCSV(values.attachmentLinks ?? ""),
    };

    try {
      if (editingId) {
        await api.put(`/assignments/${editingId}`, payload);
        reset(emptyForm);
        setEditingId(null);
        await loadAssignments();
        toast.success("Tarea actualizada");
      } else {
        const response = await api.post<Assignment>("/assignments", payload);
        const createdId = response.data.id;
        reset(emptyForm);
        await loadAssignments();
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
                Tarea creada
              </p>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => {
                  void api
                    .delete(`/assignments/${createdId}`)
                    .then(() => {
                      void loadAssignments();
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

  function startEdit(assignment: Assignment) {
    setEditingId(assignment.id);
    reset({
      title: assignment.title,
      courseId: assignment.courseId || "",
      dueDate: assignment.dueDate.slice(0, 16),
      description: assignment.description || "",
      priority: assignment.priority,
      status: assignment.status,
      repeatRule: assignment.repeatRule,
      tags: assignment.tags.join(", "),
      attachmentLinks: assignment.attachmentLinks.join(", "),
    });
  }

  async function toggleDone(assignment: Assignment) {
    try {
      await api.put(`/assignments/${assignment.id}`, {
        status: assignment.status === "DONE" ? "PENDING" : "DONE",
      });
      await loadAssignments();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function remove(assignmentId: string) {
    const snapshot = assignments.find((item) => item.id === assignmentId);
    try {
      await api.delete(`/assignments/${assignmentId}`);
      if (assignments.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadAssignments();
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
                Tarea eliminada
              </p>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => {
                  void api
                    .post("/assignments", {
                      title: snapshot.title,
                      courseId: snapshot.courseId || null,
                      dueDate: snapshot.dueDate,
                      priority: snapshot.priority,
                      status: "PENDING",
                      repeatRule: snapshot.repeatRule,
                      description: snapshot.description || null,
                      tags: snapshot.tags,
                      attachmentLinks: snapshot.attachmentLinks,
                    })
                    .then(() => {
                      void loadAssignments();
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

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Workflow"
        title="Tareas y entregas"
        subtitle="Gestiona prioridades, estado y deadlines con filtros persistentes."
      />

      {error && <Alert tone="error" message={error} />}

      <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
        <Card>
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">
            {editingId ? "Editar tarea" : "Nueva tarea"}
          </h2>
          <form className="mt-3 grid gap-3" onSubmit={onSubmit} noValidate>
            <Field label="Titulo" error={errors.title?.message?.toString()}>
              <TextInput
                {...register("title")}
                aria-invalid={!!errors.title}
                placeholder="Titulo de la tarea"
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
            <Field label="Fecha limite" error={errors.dueDate?.message?.toString()}>
              <TextInput
                type="datetime-local"
                {...register("dueDate")}
                aria-invalid={!!errors.dueDate}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Prioridad">
                <SelectInput {...register("priority")}>
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                </SelectInput>
              </Field>
              <Field label="Estado">
                <SelectInput {...register("status")}>
                  <option value="PENDING">Pendiente</option>
                  <option value="IN_PROGRESS">En progreso</option>
                  <option value="DONE">Hecho</option>
                </SelectInput>
              </Field>
              <Field label="Repeticion">
                <SelectInput {...register("repeatRule")}>
                  <option value="NONE">Ninguna</option>
                  <option value="WEEKLY">Semanal</option>
                  <option value="MONTHLY">Mensual</option>
                </SelectInput>
              </Field>
            </div>
            <Field
              label="Descripcion"
              helper={`${descriptionValue.length}/1200`}
              error={errors.description?.message?.toString()}
            >
              <TextArea rows={3} {...register("description")} />
            </Field>
            <Field label="Etiquetas (coma)">
              <TextInput {...register("tags")} />
            </Field>
            <Field
              label="Adjuntos (links separados por coma)"
              error={errors.attachmentLinks?.message?.toString()}
            >
              <TextInput {...register("attachmentLinks")} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {editingId ? "Guardar cambios" : "Crear tarea"}
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
                placeholder="Buscar"
                value={filters.q}
                onChange={(event) => updateFilters({ q: event.target.value })}
              />
              <SelectInput
                value={filters.status}
                onChange={(event) =>
                  updateFilters({ status: event.target.value as AssignmentFilters["status"] })
                }
              >
                <option value="">Todos los estados</option>
                <option value="PENDING">Pendiente</option>
                <option value="IN_PROGRESS">En progreso</option>
                <option value="DONE">Hecho</option>
              </SelectInput>
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
                value={filters.sortBy}
                onChange={(event) =>
                  updateFilters({ sortBy: event.target.value as AssignmentFilters["sortBy"] })
                }
              >
                <option value="dueDate">Por fecha</option>
                <option value="createdAt">Por creado</option>
                <option value="priority">Por prioridad</option>
                <option value="status">Por estado</option>
                <option value="title">Por titulo</option>
              </SelectInput>
              <SelectInput
                value={filters.sortDir}
                onChange={(event) =>
                  updateFilters({ sortDir: event.target.value as AssignmentFilters["sortDir"] })
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
            Mostrando {assignments.length} de {pagination.total} resultados
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
                  {assignments.map((assignment, index) => (
                    <article
                      key={assignment.id}
                      className={clsx(
                        "animate-stagger-in rounded-xl border border-ink-200 p-3 dark:border-ink-700",
                        `stagger-${Math.min(index + 1, 6)}`,
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-ink-900 dark:text-ink-100">
                            {assignment.title}
                          </h3>
                          <p className="text-sm text-ink-500 dark:text-ink-400">
                            {assignment.course?.name || "Sin materia"} - {" "}
                            {format(new Date(assignment.dueDate), "dd/MM HH:mm")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={priorityTone(assignment.priority)}>{assignment.priority}</Badge>
                          <Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge>
                        </div>
                      </div>
                      {assignment.description && (
                        <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">
                          {assignment.description}
                        </p>
                      )}
                      {assignment.tags.length > 0 && (
                        <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
                          Tags: {assignment.tags.join(", ")}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(assignment)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleDone(assignment)}
                        >
                          {assignment.status === "DONE" ? "Reabrir" : "Marcar hecho"}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            setConfirmDelete({
                              open: true,
                              id: assignment.id,
                              title: assignment.title,
                            })
                          }
                        >
                          Eliminar
                        </Button>
                      </div>
                    </article>
                  ))}
                  {assignments.length === 0 && (
                    <EmptyState
                      context="assignments"
                      title="No hay tareas con esos filtros"
                      description="Ajusta criterios o crea una tarea para iniciar el flujo."
                    />
                  )}
                </div>
              </TabPanel>

              <TabPanel>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {assignments.map((assignment, index) => (
                    <div
                      key={assignment.id}
                      className={clsx(
                        "animate-stagger-in flex flex-col rounded-2xl border border-ink-200 bg-white p-4 shadow-soft transition hover:border-ink-300 dark:border-ink-700 dark:bg-[var(--surface)] dark:hover:border-ink-600",
                        `stagger-${Math.min(index + 1, 6)}`,
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-tight text-ink-900 dark:text-ink-100">
                          {assignment.title}
                        </h3>
                        <Badge tone={statusTone(assignment.status)} className="shrink-0">
                          {assignment.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                        {assignment.course?.name || "Sin materia"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-ink-600 dark:text-ink-400">
                        Vence: {format(new Date(assignment.dueDate), "dd/MM/yyyy HH:mm")}
                      </p>
                      {assignment.description && (
                        <p className="mt-2 line-clamp-2 text-xs text-ink-600 dark:text-ink-400">
                          {assignment.description}
                        </p>
                      )}
                      <div className="mt-auto flex gap-1.5 pt-3">
                        <Badge tone={priorityTone(assignment.priority)}>{assignment.priority}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(assignment)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleDone(assignment)}
                        >
                          {assignment.status === "DONE" ? "Reabrir" : "Completar"}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            setConfirmDelete({
                              open: true,
                              id: assignment.id,
                              title: assignment.title,
                            })
                          }
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                  {assignments.length === 0 && (
                    <div className="col-span-full">
                      <EmptyState
                        context="assignments"
                        title="No hay tareas con esos filtros"
                        description="Ajusta criterios o crea una tarea para iniciar el flujo."
                      />
                    </div>
                  )}
                </div>
              </TabPanel>

              <TabPanel>
                {assignments.length === 0 ? (
                  <EmptyState
                    context="assignments"
                    title="No hay tareas con esos filtros"
                    description="Ajusta criterios o crea una tarea para iniciar el flujo."
                  />
                ) : (
                  <ol className="relative ml-2 space-y-3 border-l border-ink-200 pl-4 dark:border-ink-700">
                    {[...assignments]
                      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                      .map((assignment, index) => (
                        <li
                          key={assignment.id}
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
                            <p className="font-semibold text-ink-900 dark:text-ink-100">{assignment.title}</p>
                            <p className="text-xs font-semibold text-ink-600 dark:text-ink-400">
                              {format(new Date(assignment.dueDate), "EEE dd/MM HH:mm")}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                            {assignment.course?.name || "Sin materia"}
                          </p>
                          <div className="mt-2 flex gap-1.5">
                            <Badge tone={priorityTone(assignment.priority)}>{assignment.priority}</Badge>
                            <Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge>
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
        title="Eliminar tarea"
        description={`Confirmas que deseas eliminar "${confirmDelete.title}"? Esta accion no se puede deshacer.`}
        onConfirm={async () => {
          if (confirmDelete.id) await remove(confirmDelete.id);
          setConfirmDelete({ open: false, id: null, title: "" });
        }}
        onCancel={() => setConfirmDelete({ open: false, id: null, title: "" })}
      />
    </div>
  );
}
