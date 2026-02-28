import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { env } from "../config/env";

type ImportSessionDraft = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  modality: "PRESENTIAL" | "ONLINE";
};

export type ImportCourseDraft = {
  name: string;
  code: string;
  teacher?: string | null;
  credits?: number | null;
  semester?: string | null;
  color?: string | null;
  sessions?: ImportSessionDraft[];
};

export type ScheduleImportPreview = {
  parser: "anthropic" | "heuristic";
  courses: ImportCourseDraft[];
  warnings: string[];
};

const sessionSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    room: z.string().max(255).optional().nullable(),
    modality: z.enum(["PRESENTIAL", "ONLINE"]),
  })
  .refine((session) => session.startTime < session.endTime, {
    path: ["endTime"],
    message: "endTime must be later than startTime",
  });

const courseSchema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().min(2).max(100),
  teacher: z.string().max(255).optional().nullable(),
  credits: z.number().int().min(0).optional().nullable(),
  semester: z.string().max(100).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
  sessions: z.array(sessionSchema).optional(),
});

const anthropicResponseSchema = z.object({
  courses: z.array(courseSchema).max(120),
});

const DAY_MAP: Record<string, number> = {
  domingo: 0,
  sunday: 0,
  dom: 0,
  lun: 1,
  lunes: 1,
  monday: 1,
  mar: 2,
  martes: 2,
  tuesday: 2,
  mie: 3,
  miercoles: 3,
  jueves: 4,
  jue: 4,
  thursday: 4,
  vie: 5,
  viernes: 5,
  friday: 5,
  sab: 6,
  sabado: 6,
  saturday: 6,
};

const COURSE_CODE_REGEX = /\b([A-Z]{2,8}[- ]?\d{2,4}[A-Z]?)\b/;
const DAY_REGEX = /\b(domingo|sunday|dom|lunes|monday|lun|martes|tuesday|mar|miercoles|mie|jueves|thursday|jue|viernes|friday|vie|sabado|saturday|sab)\b/i;
const TIME_RANGE_REGEX = /(\d{1,2}[:.]\d{2})\s*(?:-|a|to)\s*(\d{1,2}[:.]\d{2})/i;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function normalizeCourseCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

function normalizeTime(raw: string): string | null {
  const normalized = raw.replace(".", ":").trim();
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour = Number.parseInt(hourRaw ?? "", 10);
  const minute = Number.parseInt(minuteRaw ?? "", 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function detectDayOfWeek(line: string): number | null {
  const match = line.match(DAY_REGEX);
  if (!match) return null;
  const key = match[1]?.toLowerCase();
  if (!key) return null;
  return DAY_MAP[key] ?? null;
}

function inferModality(line: string): "PRESENTIAL" | "ONLINE" {
  return /(online|virtual|remoto|remote)/i.test(line) ? "ONLINE" : "PRESENTIAL";
}

function inferRoom(line: string): string | null {
  const roomMatch = line.match(/\b(aula|salon|room)\s*[:\-]?\s*([a-z0-9\-]+)/i);
  if (!roomMatch?.[2]) return null;
  return roomMatch[2].trim();
}

function extractJsonObject(input: string): string | null {
  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return input.slice(firstBrace, lastBrace + 1);
}

function sanitizeCourseDrafts(courses: ImportCourseDraft[]): ImportCourseDraft[] {
  const sanitized = courses
    .map((course) => ({
      ...course,
      name: course.name.trim(),
      code: normalizeCourseCode(course.code),
      teacher: course.teacher?.trim() || null,
      semester: course.semester?.trim() || null,
      color: course.color?.trim() || null,
      sessions: (course.sessions ?? []).filter((session) => session.startTime < session.endTime),
    }))
    .filter((course) => course.name.length >= 2 && course.code.length >= 2);

  const dedupByCode = new Map<string, ImportCourseDraft>();
  for (const course of sanitized) {
    const existing = dedupByCode.get(course.code);
    if (!existing) {
      dedupByCode.set(course.code, course);
      continue;
    }

    const mergedSessions = [...(existing.sessions ?? []), ...(course.sessions ?? [])];
    dedupByCode.set(course.code, {
      ...existing,
      name: existing.name.length >= course.name.length ? existing.name : course.name,
      teacher: existing.teacher ?? course.teacher,
      semester: existing.semester ?? course.semester,
      color: existing.color ?? course.color,
      sessions: mergedSessions,
    });
  }

  return Array.from(dedupByCode.values()).slice(0, 120);
}

function parseHeuristically(text: string): ImportCourseDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);

  const byCode = new Map<string, ImportCourseDraft>();
  let currentCourseCode: string | null = null;

  const ensureCourse = (code: string, nameHint?: string): ImportCourseDraft => {
    const normalizedCode = normalizeCourseCode(code);
    const existing = byCode.get(normalizedCode);
    if (existing) return existing;

    const draft: ImportCourseDraft = {
      code: normalizedCode,
      name: nameHint && nameHint.length >= 2 ? nameHint : `Materia ${normalizedCode}`,
      sessions: [],
    };
    byCode.set(normalizedCode, draft);
    return draft;
  };

  for (const line of lines) {
    const codeMatch = line.match(COURSE_CODE_REGEX);
    const timeMatch = line.match(TIME_RANGE_REGEX);
    const dayOfWeek = detectDayOfWeek(line);

    if (codeMatch && !timeMatch && !dayOfWeek) {
      const code = normalizeCourseCode(codeMatch[1]);
      const nameCandidate = normalizeLine(
        line
          .replace(codeMatch[0], "")
          .replace(/[-|:]/g, " ")
          .replace(/\b(grupo|seccion|section)\b.*/i, ""),
      );
      const course = ensureCourse(code, nameCandidate);
      currentCourseCode = course.code;
      continue;
    }

    if (!timeMatch || dayOfWeek === null) {
      continue;
    }

    const startTime = normalizeTime(timeMatch[1]);
    const endTime = normalizeTime(timeMatch[2]);
    if (!startTime || !endTime || startTime >= endTime) {
      continue;
    }

    const inlineCode = codeMatch?.[1] ? normalizeCourseCode(codeMatch[1]) : null;
    const resolvedCode = inlineCode ?? currentCourseCode;
    if (!resolvedCode) {
      continue;
    }

    const course = ensureCourse(resolvedCode);
    const session: ImportSessionDraft = {
      dayOfWeek,
      startTime,
      endTime,
      room: inferRoom(line),
      modality: inferModality(line),
    };
    const exists = (course.sessions ?? []).some(
      (candidate) =>
        candidate.dayOfWeek === session.dayOfWeek &&
        candidate.startTime === session.startTime &&
        candidate.endTime === session.endTime &&
        candidate.modality === session.modality &&
        (candidate.room ?? null) === (session.room ?? null),
    );
    if (!exists) {
      course.sessions = [...(course.sessions ?? []), session];
    }
  }

  return sanitizeCourseDrafts(Array.from(byCode.values()));
}

async function parseWithAnthropic(text: string): Promise<ImportCourseDraft[] | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const prompt = [
    "Extrae materias y horarios desde este texto PDF de horario universitario.",
    "Responde SOLO JSON valido con este formato:",
    '{"courses":[{"name":"string","code":"string","teacher":"string|null","credits":0,"semester":"string|null","color":"#RRGGBB|null","sessions":[{"dayOfWeek":1,"startTime":"08:00","endTime":"10:00","room":"string|null","modality":"PRESENTIAL|ONLINE"}]}]}',
    "Reglas:",
    "- dayOfWeek: 0 domingo ... 6 sabado",
    "- startTime y endTime en HH:mm 24h",
    "- si no hay datos de teacher/credits/semester/color usar null",
    "- omite materias sin name o code",
    "Texto del PDF:",
    text.slice(0, 16000),
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 1500,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const textBlocks = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text ?? "")
      .join("\n");
    const jsonText = extractJsonObject(textBlocks);
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as unknown;
    const validated = anthropicResponseSchema.safeParse(parsed);
    if (!validated.success) return null;
    return sanitizeCourseDrafts(validated.data.courses);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseSchedulePdfForPreview(pdfBuffer: Buffer): Promise<ScheduleImportPreview> {
  const warnings: string[] = [];
  const parser = new PDFParse({ data: pdfBuffer });
  const parsed = await parser.getText();
  await parser.destroy();
  const extractedText = normalizeLine(parsed.text ?? "");

  if (!extractedText || extractedText.length < 20) {
    return {
      parser: "heuristic",
      courses: [],
      warnings: ["No se pudo extraer suficiente texto del PDF."],
    };
  }

  const aiCourses = await parseWithAnthropic(extractedText);
  if (aiCourses && aiCourses.length > 0) {
    return {
      parser: "anthropic",
      courses: aiCourses,
      warnings,
    };
  }

  if (env.ANTHROPIC_API_KEY) {
    warnings.push("No se pudo parsear con IA, se uso parser heuristico.");
  }

  return {
    parser: "heuristic",
    courses: parseHeuristically(extractedText),
    warnings,
  };
}
