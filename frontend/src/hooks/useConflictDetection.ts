import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getErrorMessage } from "../lib/api";
import type { Assignment, Exam, PaginatedResponse, Project } from "../lib/types";

export type ConflictEntityType = "assignment" | "exam" | "project";

export type ConflictItem = {
  type: ConflictEntityType;
  id: string;
  title: string;
  date: string;
  courseName?: string;
};

type UseConflictDetectionResult = {
  loading: boolean;
  error: string;
  conflictDayKeys: Set<string>;
  getConflictsForDay: (
    dayKey: string,
    options?: {
      exclude?: { type: ConflictEntityType; id?: string | null };
    },
  ) => ConflictItem[];
  reload: () => Promise<void>;
};

function dayKeyFromDate(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "yyyy-MM-dd");
}

export function extractDayKeyFromInput(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  return dayKeyFromDate(trimmed) ?? "";
}

export function useConflictDetection(): UseConflictDetectionResult {
  const [items, setItems] = useState<ConflictItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assignmentsResponse, examsResponse, projectsResponse] = await Promise.all([
        api.get<PaginatedResponse<Assignment>>("/assignments", {
          params: {
            page: 1,
            limit: 50,
            sortBy: "dueDate",
            sortDir: "asc",
          },
        }),
        api.get<PaginatedResponse<Exam>>("/exams", {
          params: {
            page: 1,
            limit: 50,
            sortBy: "dateTime",
            sortDir: "asc",
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

      const nextItems: ConflictItem[] = [
        ...assignmentsResponse.data.items.map((assignment) => ({
          type: "assignment" as const,
          id: assignment.id,
          title: assignment.title,
          date: assignment.dueDate,
          courseName: assignment.course?.name,
        })),
        ...examsResponse.data.items.map((exam) => ({
          type: "exam" as const,
          id: exam.id,
          title: exam.title,
          date: exam.dateTime,
          courseName: exam.course?.name,
        })),
        ...projectsResponse.data.items
          .filter((project) => Boolean(project.dueDate))
          .map((project) => ({
            type: "project" as const,
            id: project.id,
            title: project.name,
            date: project.dueDate as string,
            courseName: project.course?.name,
          })),
      ];

      setItems(nextItems);
    } catch (err) {
      setError(getErrorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ConflictItem[]>();
    for (const item of items) {
      const key = dayKeyFromDate(item.date);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return map;
  }, [items]);

  const conflictDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [key, bucket] of itemsByDay.entries()) {
      if (bucket.length >= 2) {
        keys.add(key);
      }
    }
    return keys;
  }, [itemsByDay]);

  const getConflictsForDay = useCallback(
    (
      dayKey: string,
      options?: {
        exclude?: { type: ConflictEntityType; id?: string | null };
      },
    ) => {
      const bucket = itemsByDay.get(dayKey) ?? [];
      const excludeType = options?.exclude?.type;
      const excludeId = options?.exclude?.id;
      if (!excludeType) return bucket;
      return bucket.filter((item) => !(item.type === excludeType && excludeId && item.id === excludeId));
    },
    [itemsByDay],
  );

  return {
    loading,
    error,
    conflictDayKeys,
    getConflictsForDay,
    reload,
  };
}
