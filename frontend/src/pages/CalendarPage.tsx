import interactionPlugin from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core/index.js";
import dayGridPlugin from "@fullcalendar/daygrid";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Alert, Badge, Button, CalendarSkeleton, Card, PageTitle, SelectInput } from "../components/UI";
import { extractDayKeyFromInput, useConflictDetection } from "../hooks/useConflictDetection";
import { api, getErrorMessage } from "../lib/api";
import type { CalendarEvent, Course } from "../lib/types";

const eventTypes = ["class", "assignment", "exam", "milestone"] as const;

function getEntityIdFromEvent(event: CalendarEvent): string | null {
  if (event.type === "assignment" && event.id.startsWith("assignment-")) {
    return event.id.slice("assignment-".length);
  }
  if (event.type === "exam" && event.id.startsWith("exam-")) {
    return event.id.slice("exam-".length);
  }
  if (event.type === "milestone" && event.id.startsWith("milestone-")) {
    return event.id.slice("milestone-".length);
  }
  return null;
}

export function CalendarPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([...eventTypes]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [syncingEventId, setSyncingEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { conflictDayKeys, error: conflictError } = useConflictDetection();

  const typeString = useMemo(() => selectedTypes.join(","), [selectedTypes]);

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        editable: event.type !== "class",
        classNames:
          event.type === "class"
            ? ["calendar-event-locked"]
            : ["calendar-event-draggable"],
      })),
    [events],
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  async function loadCourses() {
    const response = await api.get<Course[]>("/courses");
    setCourses(response.data);
  }

  async function loadEvents() {
    setLoading(true);
    const response = await api.get<{ events: CalendarEvent[] }>("/calendar/events", {
      params: {
        types: typeString,
        courseId: selectedCourseId || undefined,
      },
    });

    setEvents(response.data.events);
    setLoading(false);
  }

  useEffect(() => {
    void loadCourses().catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    void loadEvents().catch((err) => {
      setLoading(false);
      setError(getErrorMessage(err));
    });
  }, [selectedCourseId, typeString]);

  useEffect(() => {
    if (!selectedEventId) return;
    if (!events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId("");
    }
  }, [events, selectedEventId]);

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((value) => value !== type);
      }
      return [...prev, type];
    });
  }

  async function persistEventUpdate(event: CalendarEvent, nextStartISO: string) {
    const entityId = getEntityIdFromEvent(event);
    if (!entityId) {
      throw new Error("No se pudo identificar el evento para guardarlo");
    }

    if (event.type === "assignment") {
      await api.put(`/assignments/${entityId}`, {
        dueDate: nextStartISO,
      });
    } else if (event.type === "exam") {
      await api.put(`/exams/${entityId}`, {
        dateTime: nextStartISO,
      });
    } else if (event.type === "milestone") {
      await api.patch(`/projects/milestones/${entityId}`, {
        dueDate: nextStartISO,
      });
    } else {
      throw new Error("Las clases recurrentes se editan desde Materias > Horarios");
    }
  }

  async function downloadICS() {
    try {
      const response = await api.get<Blob>("/calendar/ics", {
        params: {
          types: typeString,
          courseId: selectedCourseId || undefined,
        },
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "text/calendar;charset=utf-8",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "uniplanner.ics";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleEventDrop(info: EventDropArg) {
    const eventType = info.event.extendedProps.type as CalendarEvent["type"] | undefined;

    if (!eventType || eventType === "class") {
      info.revert();
      toast.error("Las clases recurrentes se editan desde Materias > Horarios");
      return;
    }

    const updatedStart = info.event.start;
    if (!updatedStart) {
      info.revert();
      toast.error("No se pudo obtener la nueva fecha del evento");
      return;
    }

    const movedEvent: CalendarEvent = {
      id: info.event.id,
      title: info.event.title,
      start: updatedStart.toISOString(),
      end: info.event.end?.toISOString(),
      type: eventType,
      color: info.event.backgroundColor,
    };

    setError("");
    setSyncingEventId(movedEvent.id);

    try {
      await persistEventUpdate(movedEvent, movedEvent.start);
      toast.success("Evento reprogramado");
      await loadEvents();
    } catch (err) {
      info.revert();
      setError(getErrorMessage(err));
      toast.error("No se pudo guardar el cambio en el calendario");
    } finally {
      setSyncingEventId("");
    }
  }

  async function shiftEventByDays(eventId: string, days: number) {
    const event = events.find((item) => item.id === eventId);
    if (!event) return;
    if (event.type === "class") {
      toast.error("Las clases recurrentes se editan en Horario");
      return;
    }

    const current = new Date(event.start);
    const next = new Date(current);
    next.setDate(current.getDate() + days);

    setSyncingEventId(event.id);
    setError("");
    try {
      await persistEventUpdate(event, next.toISOString());
      await loadEvents();
      toast.success("Evento reprogramado");
    } catch (err) {
      setError(getErrorMessage(err));
      toast.error("No se pudo guardar el cambio");
    } finally {
      setSyncingEventId("");
    }
  }

  async function shiftSelectedEvent(days: number) {
    if (!selectedEvent) return;
    await shiftEventByDays(selectedEvent.id, days);
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Agenda"
        title="Calendario academico"
        subtitle="Vista mensual y semanal con filtros por tipo de evento y exportacion .ics."
      />

      {error && <Alert tone="error" message={error} />}
      {conflictError && <Alert tone="warning" message={`Conflictos: no se pudo actualizar el analisis (${conflictError})`} />}

      <Card>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto] sm:items-end">
          <div className="grid gap-3">
            <div>
              <label
                className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300"
                htmlFor="courseFilter"
              >
                Filtrar por materia
              </label>
              <SelectInput
                id="courseFilter"
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
              >
                <option value="">Todas</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div className="flex flex-wrap gap-2">
              {eventTypes.map((type) => (
                <label
                  key={type}
                  className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggleType(type)}
                  />
                  <span className="capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>

          <Button type="button" className="w-full sm:w-auto" onClick={() => void downloadICS()}>
            Descargar .ics
          </Button>
        </div>

        {loading ? (
          <CalendarSkeleton />
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="brand">Eventos: {events.length}</Badge>
              <Badge tone="warning">Dias con conflicto: {conflictDayKeys.size}</Badge>
              {selectedTypes.map((type) => (
                <Badge key={type} tone="default">
                  {type}
                </Badge>
              ))}
              {syncingEventId && <Badge tone="warning">Guardando movimiento...</Badge>}
            </div>

            {selectedEvent && (
              <div className="mt-3 rounded-2xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-[var(--surface)]/70">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                  Evento seleccionado
                </p>
                <p className="mt-1 font-semibold text-ink-800 dark:text-ink-200">
                  {selectedEvent.title}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {new Date(selectedEvent.start).toLocaleString()}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void shiftSelectedEvent(-1)}
                    disabled={selectedEvent.type === "class" || !!syncingEventId}
                  >
                    -1 dia
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void shiftSelectedEvent(1)}
                    disabled={selectedEvent.type === "class" || !!syncingEventId}
                  >
                    +1 dia
                  </Button>
                </div>
              </div>
            )}

            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
              Puedes arrastrar tareas, examenes y milestones para reprogramarlos. Las clases recurrentes se bloquean.
            </p>

            <div className="mt-4">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay",
                }}
                events={calendarEvents}
                editable
                eventDurationEditable={false}
                eventDrop={(info) => {
                  void handleEventDrop(info);
                }}
                eventClick={(info) => {
                  setSelectedEventId(info.event.id);
                }}
                eventDidMount={(info) => {
                  info.el.setAttribute("tabindex", "0");
                  info.el.setAttribute("aria-label", `${info.event.title}, ${info.event.start?.toLocaleString() || ""}`);
                  info.el.onkeydown = (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedEventId(info.event.id);
                    }
                    if (event.altKey && event.key === "ArrowLeft") {
                      event.preventDefault();
                      void shiftEventByDays(info.event.id, -1);
                    }
                    if (event.altKey && event.key === "ArrowRight") {
                      event.preventDefault();
                      void shiftEventByDays(info.event.id, 1);
                    }
                  };
                }}
                dayCellDidMount={(info) => {
                  const dayKey = extractDayKeyFromInput(info.date.toISOString());
                  if (!dayKey || !conflictDayKeys.has(dayKey)) return;
                  const existing = info.el.querySelector(".calendar-conflict-dot");
                  if (existing) return;
                  const dot = document.createElement("span");
                  dot.className = "calendar-conflict-dot";
                  dot.setAttribute("aria-hidden", "true");
                  info.el.appendChild(dot);
                }}
                eventAllow={(_dropInfo, draggedEvent) => {
                  if (!draggedEvent) return false;
                  const type = draggedEvent.extendedProps.type as CalendarEvent["type"] | undefined;
                  return type !== "class";
                }}
                height="auto"
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
