import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../lib/api";
import { extractDayKeyFromInput, useConflictDetection } from "../hooks/useConflictDetection";
import type { Course, PaginatedResponse, PaginationMeta, Project, ProjectTask } from "../lib/types";
import { Alert, Badge, Button, Card, EmptyState, Field, PageTitle, SelectInput, TextInput } from "../components/UI";
import { ConfirmDialog } from "../components/ConfirmDialog";

const PROJECTS_FILTERS_KEY = "uniplanner_projects_filters_v1";
const PROJECTS_PAGE_KEY = "uniplanner_projects_page_v1";

const statusColumns: Array<{ id: ProjectTask["status"]; label: string }> = [
  { id: "TODO", label: "To do" },
  { id: "DOING", label: "Doing" },
  { id: "DONE", label: "Done" },
];

type ProjectsFilters = {
  q: string;
  courseId: string;
  status: "" | "TODO" | "DOING" | "DONE";
  sortBy: "createdAt" | "dueDate" | "name" | "status";
  sortDir: "asc" | "desc";
  limit: number;
};

const defaultFilters: ProjectsFilters = {
  q: "",
  courseId: "",
  status: "",
  sortBy: "createdAt",
  sortDir: "desc",
  limit: 8,
};

const defaultPagination: PaginationMeta = {
  page: 1,
  limit: 8,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

function loadSavedFilters(): ProjectsFilters {
  if (typeof window === "undefined") return defaultFilters;
  const raw = localStorage.getItem(PROJECTS_FILTERS_KEY);
  if (!raw) return defaultFilters;
  try {
    return { ...defaultFilters, ...(JSON.parse(raw) as Partial<ProjectsFilters>) };
  } catch {
    return defaultFilters;
  }
}

function loadSavedPage(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(localStorage.getItem(PROJECTS_PAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

// Draggable task card
function DraggableTaskCard({
  task,
  statusColumns,
  onMove,
  isDraggingOverlay = false,
}: {
  task: ProjectTask;
  statusColumns: Array<{ id: ProjectTask["status"]; label: string }>;
  onMove: (taskId: string, status: ProjectTask["status"]) => void;
  isDraggingOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const currentIndex = statusColumns.findIndex((option) => option.id === task.status);

  function handleKeyboardMove(direction: "left" | "right") {
    const nextIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
    const next = statusColumns[nextIndex];
    if (next) onMove(task.id, next.id);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      tabIndex={0}
      role="group"
      aria-label={`Tarea ${task.title} en ${task.status}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          handleKeyboardMove("left");
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          handleKeyboardMove("right");
        }
      }}
      className={clsx(
        "rounded-xl border border-ink-200 bg-white p-2.5 text-sm shadow-soft dark:border-ink-700 dark:bg-[var(--surface)]",
        (isDragging || isDraggingOverlay) && "opacity-50 ring-2 ring-brand-400",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-ink-800 dark:text-ink-200">{task.title}</p>
        {/* Drag handle */}
        <button
          type="button"
          {...listeners}
          className="cursor-grab rounded p-0.5 text-ink-300 hover:text-ink-500 dark:text-ink-600 dark:hover:text-ink-400 active:cursor-grabbing"
          aria-label="Arrastrar tarea"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
          </svg>
        </button>
      </div>
      {!isDraggingOverlay && (
        <div className="mt-2 flex flex-wrap gap-1">
          {statusColumns
            .filter((option) => option.id !== task.status)
            .map((option) => (
              <Button
                key={option.id}
                type="button"
                variant="ghost"
                size="sm"
                className="px-2 py-1 text-xs"
                onClick={() => onMove(task.id, option.id)}
              >
                Mover a {option.label}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

// Droppable column
function DroppableColumn({
  id,
  label,
  tasks,
  onMove,
}: {
  id: ProjectTask["status"];
  label: string;
  tasks: ProjectTask[];
  onMove: (taskId: string, status: ProjectTask["status"]) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "rounded-2xl border p-3 transition",
        isOver
          ? "border-brand-400 bg-brand-50/60 dark:border-brand-600 dark:bg-brand-700/10"
          : "border-ink-200 bg-ink-50/50 dark:border-ink-700 dark:bg-ink-800/30",
      )}
    >
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
        {label}
        <span className="ml-1.5 rounded-full bg-ink-200 px-1.5 py-0.5 text-[0.6rem] font-bold text-ink-600 dark:bg-ink-700 dark:text-ink-400">
          {tasks.length}
        </span>
      </h4>
      <div className="space-y-2">
        {tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} statusColumns={statusColumns} onMove={onMove} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink-200 p-3 text-center text-xs text-ink-400 dark:border-ink-700 dark:text-ink-500">
            Sin tareas
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectForm, setProjectForm] = useState({ name: "", courseId: "", dueDate: "" });
  const [taskTitle, setTaskTitle] = useState("");
  const [milestoneForm, setMilestoneForm] = useState({ title: "", dueDate: "" });
  const [filters, setFilters] = useState<ProjectsFilters>(loadSavedFilters);
  const [page, setPage] = useState<number>(loadSavedPage);
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null; name: string }>({
    open: false, id: null, name: "",
  });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [taskViewMode, setTaskViewMode] = useState<"kanban" | "list">("kanban");
  const formAnchorRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const activeDragTask = useMemo(() => {
    if (!activeDragId || !selectedProject) return null;
    return selectedProject.tasks.find((t) => t.id === activeDragId) ?? null;
  }, [activeDragId, selectedProject]);
  const {
    loading: conflictsLoading,
    error: conflictsError,
    getConflictsForDay,
  } = useConflictDetection();
  const projectDateConflicts = useMemo(() => {
    const dayKey = extractDayKeyFromInput(projectForm.dueDate);
    if (!dayKey) return [];
    return getConflictsForDay(dayKey, { exclude: { type: "project" } });
  }, [getConflictsForDay, projectForm.dueDate]);

  async function loadData() {
    const [projectsResponse, coursesResponse] = await Promise.all([
      api.get<PaginatedResponse<Project>>("/projects", {
        params: {
          q: filters.q || undefined,
          courseId: filters.courseId || undefined,
          status: filters.status || undefined,
          sortBy: filters.sortBy,
          sortDir: filters.sortDir,
          limit: filters.limit,
          page,
        },
      }),
      api.get<Course[]>("/courses"),
    ]);

    const projectsItems = projectsResponse.data.items;
    setProjects(projectsItems);
    setPagination(projectsResponse.data.pagination);
    setCourses(coursesResponse.data);

    if (projectsItems.length === 0) {
      setSelectedProjectId("");
      return;
    }

    const existsInPage = projectsItems.some((project) => project.id === selectedProjectId);
    if (!existsInPage) {
      setSelectedProjectId(projectsItems[0].id);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(PROJECTS_FILTERS_KEY, JSON.stringify(filters));
      localStorage.setItem(PROJECTS_PAGE_KEY, String(page));
    }
  }, [filters, page]);

  useEffect(() => {
    void loadData().catch((err) => setError(getErrorMessage(err)));
  }, [filters, page]);

  function updateFilters(next: Partial<ProjectsFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await api.post<Project>("/projects", {
        name: projectForm.name,
        courseId: projectForm.courseId || null,
        dueDate: projectForm.dueDate ? new Date(projectForm.dueDate).toISOString() : null,
      });
      const createdId = response.data.id;
      setProjectForm({ name: "", courseId: "", dueDate: "" });
      await loadData();
      toast.custom(
        (t) => (
          <div
            className={clsx(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-panel",
              "border-ink-200 bg-white dark:border-ink-700 dark:bg-[var(--surface)]",
              t.visible ? "animate-scale-in" : "opacity-0",
            )}
          >
            <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">Proyecto creado</p>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={() => {
                void api.delete(`/projects/${createdId}`).then(() => {
                  void loadData();
                  toast.dismiss(t.id);
                });
              }}
            >
              Deshacer
            </Button>
            <button type="button" onClick={() => toast.dismiss(t.id)} className="text-ink-400 hover:text-ink-700 dark:text-ink-500">
              <XMarkIcon className="size-4" />
            </button>
          </div>
        ),
        { duration: 5000 },
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function removeProject(projectId: string) {
    try {
      await api.delete(`/projects/${projectId}`);
      if (projects.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadData();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    try {
      await api.post(`/projects/${selectedProject.id}/tasks`, { title: taskTitle });
      setTaskTitle("");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function updateTask(taskId: string, status: ProjectTask["status"]) {
    try {
      await api.patch(`/projects/tasks/${taskId}`, { status });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function addMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    try {
      await api.post(`/projects/${selectedProject.id}/milestones`, {
        title: milestoneForm.title,
        dueDate: milestoneForm.dueDate ? new Date(milestoneForm.dueDate).toISOString() : null,
      });
      setMilestoneForm({ title: "", dueDate: "" });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function toggleMilestone(id: string, completed: boolean) {
    try {
      await api.patch(`/projects/milestones/${id}`, { completed: !completed });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over) return;
    const taskId = active.id as string;
    const newStatus = over.id as ProjectTask["status"];
    if (statusColumns.some((col) => col.id === newStatus)) {
      const task = selectedProject?.tasks.find((t) => t.id === taskId);
      if (task && task.status !== newStatus) {
        void updateTask(taskId, newStatus);
      }
    }
  }

  function scrollToProjectForm() {
    formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Studio"
        title="Proyectos"
        subtitle="Gestiona milestones y tareas en flujo kanban por materia."
      />

      {error && <Alert tone="error" message={error} />}

      <div className="grid gap-4 lg:grid-cols-[420px,1fr]">
        {/* Left panel */}
        <Card>
          <div ref={formAnchorRef} className="scroll-mt-28" />
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">Nuevo proyecto</h2>
          <form className="mt-3 grid gap-3" onSubmit={createProject}>
            <Field label="Nombre">
              <TextInput
                value={projectForm.name}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                required
                placeholder="Nombre del proyecto"
              />
            </Field>
            <Field label="Materia">
              <SelectInput
                value={projectForm.courseId}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, courseId: event.target.value }))}
              >
                <option value="">Sin materia</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Fecha limite">
              <TextInput
                type="date"
                value={projectForm.dueDate}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </Field>
            {conflictsError && <Alert tone="warning" message={`No se pudo verificar conflictos: ${conflictsError}`} />}
            {!conflictsError && projectDateConflicts.length > 0 && (
              <Alert
                tone="warning"
                message={`Conflicto detectado: ya tienes ${projectDateConflicts.length} evaluacion(es) ese dia (${projectDateConflicts
                  .slice(0, 2)
                  .map((item) => item.title)
                  .join(", ")}). Puedes guardar de todas formas.`}
              />
            )}
            {conflictsLoading && !projectDateConflicts.length && projectForm.dueDate && (
              <p className="text-xs text-ink-500 dark:text-ink-400">Verificando conflictos de fecha...</p>
            )}
            <Button type="submit">Crear proyecto</Button>
          </form>

          <div className="mt-6 grid gap-2 md:grid-cols-2 lg:grid-cols-1">
            <TextInput placeholder="Buscar proyecto" value={filters.q} onChange={(event) => updateFilters({ q: event.target.value })} />
            <SelectInput value={filters.courseId} onChange={(event) => updateFilters({ courseId: event.target.value })}>
              <option value="">Todas las materias</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </SelectInput>
            <SelectInput value={filters.status} onChange={(event) => updateFilters({ status: event.target.value as ProjectsFilters["status"] })}>
              <option value="">Todos los estados</option>
              <option value="TODO">To do</option>
              <option value="DOING">Doing</option>
              <option value="DONE">Done</option>
            </SelectInput>
            <SelectInput value={filters.sortBy} onChange={(event) => updateFilters({ sortBy: event.target.value as ProjectsFilters["sortBy"] })}>
              <option value="createdAt">Por creado</option>
              <option value="dueDate">Por entrega</option>
              <option value="name">Por nombre</option>
              <option value="status">Por estado</option>
            </SelectInput>
            <SelectInput value={filters.sortDir} onChange={(event) => updateFilters({ sortDir: event.target.value as ProjectsFilters["sortDir"] })}>
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </SelectInput>
            <SelectInput value={String(filters.limit)} onChange={(event) => updateFilters({ limit: Number(event.target.value) })}>
              <option value="8">8 por pagina</option>
              <option value="12">12 por pagina</option>
              <option value="20">20 por pagina</option>
            </SelectInput>
          </div>

          <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
            Mostrando {projects.length} de {pagination.total} resultados
          </p>

          <div className="mt-3 space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className={clsx(
                  "rounded-xl border p-3 transition cursor-pointer",
                  selectedProjectId === project.id
                    ? "border-brand-300 bg-brand-50/60 dark:border-brand-700/60 dark:bg-brand-700/10"
                    : "border-ink-200 bg-white hover:border-ink-300 dark:border-ink-700 dark:bg-[var(--surface)] dark:hover:border-ink-600",
                )}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <p className="font-semibold text-ink-800 dark:text-ink-200">{project.name}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">{project.course?.name || "Sin materia"}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge tone={project.status === "DONE" ? "success" : project.status === "DOING" ? "warning" : "default"}>
                    {project.status}
                  </Badge>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ open: true, id: project.id, name: project.name }); }}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <EmptyState
                context="projects"
                title="Sin proyectos"
                description="Crea un proyecto para empezar a organizar milestones y tareas."
                action={
                  <Button type="button" onClick={scrollToProjectForm}>
                    Crear proyecto
                  </Button>
                }
              />
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-ink-600 dark:text-ink-400">
              Pagina {pagination.page} de {Math.max(1, pagination.totalPages)}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={!pagination.hasPrev} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                Anterior
              </Button>
              <Button type="button" variant="ghost" disabled={!pagination.hasNext} onClick={() => setPage((prev) => prev + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        </Card>

        {/* Right panel - Kanban */}
        <Card>
          {!selectedProject && (
            <EmptyState
              context="projects"
              title="Selecciona un proyecto"
              description="Elige un proyecto de la lista para administrar milestones y tablero kanban."
              action={
                <Button type="button" onClick={scrollToProjectForm}>
                  Crear proyecto
                </Button>
              }
            />
          )}
          {selectedProject && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100">{selectedProject.name}</h2>
                <p className="text-sm text-ink-500 dark:text-ink-400">
                  {selectedProject.course?.name || "Sin materia"} -
                  {selectedProject.dueDate
                    ? ` vence ${format(new Date(selectedProject.dueDate), "dd/MM/yyyy")}`
                    : " sin fecha"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={taskViewMode === "kanban" ? "primary" : "ghost"}
                    onClick={() => setTaskViewMode("kanban")}
                  >
                    Vista Kanban
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={taskViewMode === "list" ? "primary" : "ghost"}
                    onClick={() => setTaskViewMode("list")}
                  >
                    Vista lista
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Milestones */}
                <Card className="bg-ink-50/50 dark:bg-ink-800/20">
                  <h3 className="font-semibold text-ink-800 dark:text-ink-200">Milestones</h3>
                  <form className="mt-2 grid gap-2" onSubmit={addMilestone}>
                    <TextInput
                      placeholder="Titulo"
                      value={milestoneForm.title}
                      onChange={(event) => setMilestoneForm((prev) => ({ ...prev, title: event.target.value }))}
                      required
                    />
                    <TextInput
                      type="date"
                      value={milestoneForm.dueDate}
                      onChange={(event) => setMilestoneForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    />
                    <Button type="submit">Agregar milestone</Button>
                  </form>
                  <div className="mt-3 space-y-2 text-sm">
                    {selectedProject.milestones.map((milestone) => (
                      <button
                        type="button"
                        key={milestone.id}
                        className={clsx(
                          "w-full rounded-xl border p-2.5 text-left transition",
                          milestone.completed
                            ? "border-accent-200 bg-accent-50 text-accent-800 dark:border-accent-700/50 dark:bg-accent-700/15 dark:text-accent-300"
                            : "border-ink-200 bg-white hover:border-ink-300 dark:border-ink-700 dark:bg-[var(--surface)] dark:hover:border-ink-600",
                        )}
                        onClick={() => void toggleMilestone(milestone.id, milestone.completed)}
                      >
                        <span className="font-medium text-ink-800 dark:text-ink-200">{milestone.title}</span>
                        {milestone.dueDate && (
                          <span className="ml-2 text-xs text-ink-500 dark:text-ink-400">
                            {format(new Date(milestone.dueDate), "dd/MM")}
                          </span>
                        )}
                        {milestone.completed && (
                          <span className="ml-2 text-xs text-accent-600 dark:text-accent-400">OK</span>
                        )}
                      </button>
                    ))}
                    {selectedProject.milestones.length === 0 && (
                      <p className="text-xs text-ink-500 dark:text-ink-400">Sin milestones.</p>
                    )}
                  </div>
                </Card>

                {/* New task */}
                <Card className="bg-ink-50/50 dark:bg-ink-800/20">
                  <h3 className="font-semibold text-ink-800 dark:text-ink-200">Nueva tarea kanban</h3>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    Arrastra las tarjetas entre columnas para cambiar su estado.
                  </p>
                  <form className="mt-2 flex gap-2" onSubmit={addTask}>
                    <TextInput
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Titulo"
                      required
                    />
                    <Button type="submit">Agregar</Button>
                  </form>
                </Card>
              </div>

              {taskViewMode === "kanban" ? (
                <DndContext
                  sensors={sensors}
                  onDragStart={(event) => setActiveDragId(event.active.id as string)}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveDragId(null)}
                >
                  <div className="grid gap-3 lg:grid-cols-3">
                    {statusColumns.map((column) => (
                      <DroppableColumn
                        key={column.id}
                        id={column.id}
                        label={column.label}
                        tasks={selectedProject.tasks.filter((task) => task.status === column.id)}
                        onMove={updateTask}
                      />
                    ))}
                  </div>

                  <DragOverlay>
                    {activeDragTask && (
                      <DraggableTaskCard
                        task={activeDragTask}
                        statusColumns={statusColumns}
                        onMove={() => void 0}
                        isDraggingOverlay
                      />
                    )}
                  </DragOverlay>
                </DndContext>
              ) : (
                <div className="grid gap-2">
                  {selectedProject.tasks.length === 0 ? (
                    <EmptyState
                      context="projects"
                      title="Sin tareas"
                      description="Agrega una tarea para empezar tu plan de trabajo."
                    />
                  ) : (
                    selectedProject.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-700 dark:bg-[var(--surface)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-ink-800 dark:text-ink-200">{task.title}</p>
                          <Badge tone={task.status === "DONE" ? "success" : task.status === "DOING" ? "warning" : "default"}>
                            {task.status}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {statusColumns
                            .filter((column) => column.id !== task.status)
                            .map((column) => (
                              <Button
                                key={column.id}
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => void updateTask(task.id, column.id)}
                              >
                                Mover a {column.label}
                              </Button>
                            ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete.open}
        title="Eliminar proyecto"
        description={
          <span>
            Confirmas eliminar <strong>"{confirmDelete.name}"</strong>? Se eliminaran todas sus tareas y milestones.
            Esta accion no se puede deshacer.
          </span>
        }
        onConfirm={async () => {
          if (confirmDelete.id) await removeProject(confirmDelete.id);
          setConfirmDelete({ open: false, id: null, name: "" });
        }}
        onCancel={() => setConfirmDelete({ open: false, id: null, name: "" })}
      />
    </div>
  );
}
