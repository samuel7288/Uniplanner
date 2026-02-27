import { addWeeks, format, isAfter, isBefore, startOfWeek } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getErrorMessage } from "../lib/api";
import type { Assignment, Exam, PaginatedResponse, Project } from "../lib/types";

export type WeeklyLoadEvent = {
  id: string;
  title: string;
  type: "assignment" | "exam" | "project";
  date: string;
  courseName?: string;
};

export type WeeklyLoadPoint = {
  weekKey: string;
  weekLabel: string;
  total: number;
  assignments: number;
  exams: number;
  projects: number;
  loadLevel: "normal" | "warning" | "critical";
  items: WeeklyLoadEvent[];
};

type UseWeeklyLoadResult = {
  data: WeeklyLoadPoint[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};

type WeekBucket = {
  weekStart: Date;
  weekEnd: Date;
  weekKey: string;
  weekLabel: string;
  items: WeeklyLoadEvent[];
};

function createWeekBuckets(totalWeeks: number): WeekBucket[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: totalWeeks }, (_, index) => {
    const weekStart = addWeeks(start, index);
    const weekEnd = addWeeks(start, index + 1);
    return {
      weekStart,
      weekEnd,
      weekKey: format(weekStart, "yyyy-MM-dd"),
      weekLabel: format(weekStart, "dd MMM"),
      items: [],
    };
  });
}

function resolveLoadLevel(total: number): WeeklyLoadPoint["loadLevel"] {
  if (total >= 5) return "critical";
  if (total >= 3) return "warning";
  return "normal";
}

export function useWeeklyLoad(weeks = 12): UseWeeklyLoadResult {
  const [data, setData] = useState<WeeklyLoadPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const weeksToShow = useMemo(() => Math.max(1, weeks), [weeks]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
      const endDate = addWeeks(startDate, weeksToShow);
      const fromIso = startDate.toISOString();
      const toIso = endDate.toISOString();

      const [assignmentsResponse, examsResponse, projectsResponse] = await Promise.all([
        api.get<PaginatedResponse<Assignment>>("/assignments", {
          params: {
            page: 1,
            limit: 50,
            sortBy: "dueDate",
            sortDir: "asc",
            dueFrom: fromIso,
            dueTo: toIso,
          },
        }),
        api.get<PaginatedResponse<Exam>>("/exams", {
          params: {
            page: 1,
            limit: 50,
            sortBy: "dateTime",
            sortDir: "asc",
            from: fromIso,
            to: toIso,
          },
        }),
        api.get<PaginatedResponse<Project>>("/projects", {
          params: {
            page: 1,
            limit: 50,
            sortBy: "dueDate",
            sortDir: "asc",
          },
        }),
      ]);

      const buckets = createWeekBuckets(weeksToShow);

      const allEvents: WeeklyLoadEvent[] = [
        ...assignmentsResponse.data.items.map((assignment) => ({
          id: assignment.id,
          title: assignment.title,
          type: "assignment" as const,
          date: assignment.dueDate,
          courseName: assignment.course?.name,
        })),
        ...examsResponse.data.items.map((exam) => ({
          id: exam.id,
          title: exam.title,
          type: "exam" as const,
          date: exam.dateTime,
          courseName: exam.course?.name,
        })),
        ...projectsResponse.data.items
          .filter((project) => Boolean(project.dueDate))
          .map((project) => ({
            id: project.id,
            title: project.name,
            type: "project" as const,
            date: project.dueDate as string,
            courseName: project.course?.name,
          })),
      ];

      for (const event of allEvents) {
        const eventDate = new Date(event.date);
        if (Number.isNaN(eventDate.getTime())) continue;
        if (isBefore(eventDate, startDate) || !isBefore(eventDate, endDate)) continue;

        const targetBucket = buckets.find(
          (bucket) =>
            (isAfter(eventDate, bucket.weekStart) || eventDate.getTime() === bucket.weekStart.getTime()) &&
            isBefore(eventDate, bucket.weekEnd),
        );

        if (targetBucket) {
          targetBucket.items.push(event);
        }
      }

      const transformed: WeeklyLoadPoint[] = buckets.map((bucket) => {
        const assignments = bucket.items.filter((item) => item.type === "assignment").length;
        const exams = bucket.items.filter((item) => item.type === "exam").length;
        const projects = bucket.items.filter((item) => item.type === "project").length;
        const total = bucket.items.length;
        return {
          weekKey: bucket.weekKey,
          weekLabel: bucket.weekLabel,
          total,
          assignments,
          exams,
          projects,
          loadLevel: resolveLoadLevel(total),
          items: bucket.items.sort((a, b) => a.date.localeCompare(b.date)),
        };
      });

      setData(transformed);
    } catch (err) {
      setError(getErrorMessage(err));
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [weeksToShow]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
