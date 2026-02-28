import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { ArrowUpTrayIcon, CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api, getErrorMessage } from "../lib/api";
import { Alert, Badge, Button, SelectInput, TextInput } from "./UI";

type SessionDraft = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  modality: "PRESENTIAL" | "ONLINE";
};

type CourseDraft = {
  name: string;
  code: string;
  teacher?: string | null;
  credits?: number | null;
  semester?: string | null;
  color?: string | null;
  sessions?: SessionDraft[];
};

type PreviewResponse = {
  parser: "anthropic" | "heuristic";
  courses: CourseDraft[];
  warnings: string[];
};

type ImportResult = {
  created: number;
  skipped: number;
  errors: string[];
};

type Step = "upload" | "preview" | "result";

const DAY_OPTIONS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mie" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sab" },
];

function emptySession(): SessionDraft {
  return {
    dayOfWeek: 1,
    startTime: "08:00",
    endTime: "10:00",
    room: "",
    modality: "PRESENTIAL",
  };
}

function emptyCourse(): CourseDraft {
  return {
    name: "",
    code: "",
    teacher: "",
    credits: null,
    semester: "",
    color: "",
    sessions: [emptySession()],
  };
}

function sanitizeCourses(input: CourseDraft[]): CourseDraft[] {
  return input.map((course) => ({
    name: course.name.trim(),
    code: course.code.trim().toUpperCase(),
    teacher: course.teacher?.trim() || null,
    credits: typeof course.credits === "number" ? course.credits : null,
    semester: course.semester?.trim() || null,
    color: course.color?.trim() || null,
    sessions: (course.sessions ?? []).filter((session) => session.startTime < session.endTime),
  }));
}

export function ImportSchedulePdfModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [courses, setCourses] = useState<CourseDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parser, setParser] = useState<"anthropic" | "heuristic">("heuristic");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("upload");
      setCourses([]);
      setWarnings([]);
      setResult(null);
      setError("");
      setFileName("");
      setParser("heuristic");
      setIsParsing(false);
      setIsSubmitting(false);
    }
  }, [open]);

  const validCount = useMemo(
    () => courses.filter((course) => course.name.trim().length > 1 && course.code.trim().length > 1).length,
    [courses],
  );

  async function parsePdf(file: File) {
    setError("");
    setResult(null);
    setIsParsing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post<PreviewResponse>("/import/schedule", formData);
      setCourses(sanitizeCourses(response.data.courses));
      setWarnings(response.data.warnings ?? []);
      setParser(response.data.parser);
      setFileName(file.name);
      setStep("preview");
    } catch (err) {
      setError(getErrorMessage(err));
      setStep("upload");
    } finally {
      setIsParsing(false);
    }
  }

  async function submitImport() {
    setError("");
    const payload = sanitizeCourses(courses).filter(
      (course) => course.name.length > 1 && course.code.length > 1,
    );
    if (payload.length === 0) {
      setError("No hay materias validas para importar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post<ImportResult>("/courses/import", { courses: payload });
      setResult(response.data);
      if (onImported) await onImported();
      setStep("result");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateCourse(index: number, patch: Partial<CourseDraft>) {
    setCourses((prev) => prev.map((course, idx) => (idx === index ? { ...course, ...patch } : course)));
  }

  function removeCourse(index: number) {
    setCourses((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addCourse() {
    setCourses((prev) => [...prev, emptyCourse()]);
  }

  function updateSession(courseIndex: number, sessionIndex: number, patch: Partial<SessionDraft>) {
    setCourses((prev) =>
      prev.map((course, idx) => {
        if (idx !== courseIndex) return course;
        const sessions = [...(course.sessions ?? [])];
        sessions[sessionIndex] = { ...sessions[sessionIndex], ...patch };
        return { ...course, sessions };
      }),
    );
  }

  function addSession(courseIndex: number) {
    setCourses((prev) =>
      prev.map((course, idx) =>
        idx === courseIndex ? { ...course, sessions: [...(course.sessions ?? []), emptySession()] } : course,
      ),
    );
  }

  function removeSession(courseIndex: number, sessionIndex: number) {
    setCourses((prev) =>
      prev.map((course, idx) => {
        if (idx !== courseIndex) return course;
        return { ...course, sessions: (course.sessions ?? []).filter((_, sIdx) => sIdx !== sessionIndex) };
      }),
    );
  }

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-[70]">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-[#0f2439]/50 backdrop-blur-sm dark:bg-black/70" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="w-full max-w-6xl rounded-3xl border border-ink-200 bg-white p-6 shadow-panel dark:border-ink-700 dark:bg-[var(--surface)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                    Importacion PDF
                  </p>
                  <DialogTitle className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-100">
                    Importar horario desde PDF
                  </DialogTitle>
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
                    Sube un PDF oficial, revisa la deteccion y confirma la importacion.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-ink-200 p-2 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                  aria-label="Cerrar modal de importacion PDF"
                >
                  <XMarkIcon className="size-5" />
                </button>
              </div>

              {error && <Alert tone="error" message={error} className="mb-4" />}

              <div className="mb-4 flex items-center gap-2">
                <Badge tone={step === "upload" ? "brand" : "default"}>1. Upload</Badge>
                <Badge tone={step === "preview" ? "brand" : "default"}>2. Preview editable</Badge>
                <Badge tone={step === "result" ? "brand" : "default"}>3. Resultado</Badge>
              </div>

              {step === "upload" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-50/60 p-8 text-center dark:border-ink-700 dark:bg-ink-800/35">
                    <ArrowUpTrayIcon className="mx-auto mb-3 size-8 text-ink-500 dark:text-ink-400" />
                    <p className="text-sm text-ink-700 dark:text-ink-300">
                      Selecciona un archivo PDF con tu horario oficial.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void parsePdf(file);
                        }}
                      />
                      <Button type="button" onClick={() => inputRef.current?.click()} disabled={isParsing}>
                        {isParsing ? "Analizando..." : "Seleccionar PDF"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Si el parsing falla, usa la importacion Excel/CSV como alternativa.
                  </p>
                </div>
              )}

              {step === "preview" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 bg-ink-50/50 px-3 py-2 dark:border-ink-700 dark:bg-ink-800/35">
                    <p className="text-sm text-ink-700 dark:text-ink-300">
                      Archivo: <span className="font-semibold">{fileName}</span>
                    </p>
                    <div className="flex gap-2">
                      <Badge tone="brand">Parser: {parser === "anthropic" ? "IA" : "Heuristico"}</Badge>
                      <Badge tone="success">Validas: {validCount}</Badge>
                    </div>
                  </div>

                  {warnings.length > 0 && (
                    <Alert tone="warning" message={warnings.join(" ")} />
                  )}

                  <div className="max-h-[50vh] space-y-3 overflow-auto pr-1">
                    {courses.map((course, courseIndex) => (
                      <div
                        key={`${course.code}-${courseIndex}`}
                        className="space-y-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-700 dark:bg-[var(--surface)]/70"
                      >
                        <div className="grid gap-2 md:grid-cols-5">
                          <TextInput
                            value={course.name}
                            onChange={(event) => updateCourse(courseIndex, { name: event.target.value })}
                            placeholder="Nombre"
                          />
                          <TextInput
                            value={course.code}
                            onChange={(event) => updateCourse(courseIndex, { code: event.target.value })}
                            placeholder="Codigo"
                          />
                          <TextInput
                            value={course.teacher ?? ""}
                            onChange={(event) => updateCourse(courseIndex, { teacher: event.target.value })}
                            placeholder="Profesor"
                          />
                          <TextInput
                            value={course.semester ?? ""}
                            onChange={(event) => updateCourse(courseIndex, { semester: event.target.value })}
                            placeholder="Semestre"
                          />
                          <Button type="button" variant="danger" onClick={() => removeCourse(courseIndex)}>
                            Quitar materia
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {(course.sessions ?? []).map((session, sessionIndex) => (
                            <div key={sessionIndex} className="grid gap-2 md:grid-cols-6">
                              <SelectInput
                                value={String(session.dayOfWeek)}
                                onChange={(event) =>
                                  updateSession(courseIndex, sessionIndex, {
                                    dayOfWeek: Number(event.target.value),
                                  })
                                }
                              >
                                {DAY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </SelectInput>
                              <TextInput
                                type="time"
                                value={session.startTime}
                                onChange={(event) =>
                                  updateSession(courseIndex, sessionIndex, { startTime: event.target.value })
                                }
                              />
                              <TextInput
                                type="time"
                                value={session.endTime}
                                onChange={(event) =>
                                  updateSession(courseIndex, sessionIndex, { endTime: event.target.value })
                                }
                              />
                              <TextInput
                                value={session.room ?? ""}
                                onChange={(event) =>
                                  updateSession(courseIndex, sessionIndex, { room: event.target.value })
                                }
                                placeholder="Salon"
                              />
                              <SelectInput
                                value={session.modality}
                                onChange={(event) =>
                                  updateSession(courseIndex, sessionIndex, {
                                    modality: event.target.value as SessionDraft["modality"],
                                  })
                                }
                              >
                                <option value="PRESENTIAL">Presencial</option>
                                <option value="ONLINE">Online</option>
                              </SelectInput>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => removeSession(courseIndex, sessionIndex)}
                              >
                                Quitar sesion
                              </Button>
                            </div>
                          ))}
                        </div>

                        <Button type="button" variant="ghost" size="sm" onClick={() => addSession(courseIndex)}>
                          + Agregar sesion
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={() => setStep("upload")}>
                        Volver
                      </Button>
                      <Button type="button" variant="subtle" onClick={addCourse}>
                        Agregar materia
                      </Button>
                    </div>
                    <Button type="button" onClick={() => void submitImport()} disabled={isSubmitting}>
                      {isSubmitting ? "Importando..." : "Confirmar importacion"}
                    </Button>
                  </div>
                </div>
              )}

              {step === "result" && result && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 dark:border-ink-700 dark:bg-ink-800/35">
                    <p className="text-lg font-semibold text-ink-900 dark:text-ink-100">Importacion completada</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="success">Creadas: {result.created}</Badge>
                      <Badge tone="warning">Saltadas: {result.skipped}</Badge>
                      <Badge tone={result.errors.length > 0 ? "danger" : "default"}>
                        Errores: {result.errors.length}
                      </Badge>
                    </div>
                    {result.errors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {result.errors.map((item, index) => (
                          <p key={index} className="text-sm text-danger-700 dark:text-danger-400">
                            - {item}
                          </p>
                        ))}
                      </div>
                    )}
                    {result.errors.length === 0 && (
                      <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
                        <CheckCircleIcon className="mr-1 inline size-4" />
                        Datos importados correctamente.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={onClose}>
                      Cerrar
                    </Button>
                  </div>
                </div>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
