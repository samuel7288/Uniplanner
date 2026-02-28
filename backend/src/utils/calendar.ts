import { addDays, formatISO, isAfter, parseISO, set } from "date-fns";
import { createEvents, EventAttributes } from "ics";

type ClassSessionEvent = {
  id: string;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  modality: "PRESENTIAL" | "ONLINE";
  color?: string | null;
};

type TimedEvent = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  description?: string | null;
  location?: string | null;
  color?: string | null;
  type: "assignment" | "exam" | "milestone" | "class" | "group";
};

function parseTimeToParts(time: string): [number, number] {
  const [h, m] = time.split(":").map((value) => Number(value));
  return [h || 0, m || 0];
}

function getNextWeekday(base: Date, weekday: number): Date {
  const current = base.getDay();
  const diff = (weekday - current + 7) % 7;
  return addDays(base, diff);
}

export function mapClassSessionsToEvents(
  sessions: ClassSessionEvent[],
  weeks = 12,
  now = new Date(),
): TimedEvent[] {
  const events: TimedEvent[] = [];

  for (const session of sessions) {
    const [startHour, startMinute] = parseTimeToParts(session.startTime);
    const [endHour, endMinute] = parseTimeToParts(session.endTime);

    let dayDate = getNextWeekday(now, session.dayOfWeek);
    for (let week = 0; week < weeks; week += 1) {
      const classDay = addDays(dayDate, week * 7);
      const start = set(classDay, {
        hours: startHour,
        minutes: startMinute,
        seconds: 0,
        milliseconds: 0,
      });
      const end = set(classDay, {
        hours: endHour,
        minutes: endMinute,
        seconds: 0,
        milliseconds: 0,
      });

      if (isAfter(end, now)) {
        events.push({
          id: `${session.id}-${formatISO(start)}`,
          title: `${session.courseName} (Clase)`,
          start,
          end,
          location: session.room || session.modality,
          description: `Modalidad: ${session.modality}`,
          color: session.color,
          type: "class",
        });
      }
    }
  }

  return events;
}

export function buildICS(events: TimedEvent[]): string {
  const icsEvents: EventAttributes[] = events.map((event) => {
    const start = [
      event.start.getFullYear(),
      event.start.getMonth() + 1,
      event.start.getDate(),
      event.start.getHours(),
      event.start.getMinutes(),
    ] as [number, number, number, number, number];

    const endDate = event.end ?? addDays(event.start, 0);
    const end = [
      endDate.getFullYear(),
      endDate.getMonth() + 1,
      endDate.getDate(),
      endDate.getHours(),
      endDate.getMinutes(),
    ] as [number, number, number, number, number];

    return {
      uid: event.id,
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      start,
      end,
      status: "CONFIRMED",
      busyStatus: "BUSY",
      productId: "UniPlanner",
    };
  });

  const { value, error } = createEvents(icsEvents);
  if (error || !value) {
    throw new Error(error?.message ?? "Unable to generate ICS file");
  }

  return value;
}

export function normalizeCalendarDate(input: string | Date): Date {
  return typeof input === "string" ? parseISO(input) : input;
}

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  type: TimedEvent["type"];
  courseName?: string;
  color?: string | null;
};

export function toCalendarEvent(input: TimedEvent): CalendarEvent {
  return {
    id: input.id,
    title: input.title,
    start: input.start.toISOString(),
    end: input.end?.toISOString(),
    type: input.type,
    color: input.color,
  };
}
