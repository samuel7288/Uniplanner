import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChangeEvent, DragEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api, getErrorMessage } from "../lib/api";
import { Alert, Badge, Button } from "./UI";

type ImportSessionPayload = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  modality: "PRESENTIAL" | "ONLINE";
};

type ImportCoursePayload = {
  name: string;
  code: string;
  teacher?: string;
  credits?: number;
  semester?: string;
  color?: string;
  sessions?: ImportSessionPayload[];
};

type PreviewRow = ImportCoursePayload & {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
};

type ImportResult = {
  created: number;
  skipped: number;
  errors: string[];
};

type NormalizedSheetRow = Record<string, string>;
type ImportStep = "upload" | "preview" | "result";

const MAX_IMPORT_ROWS = 200;
const DAY_NAME_TO_NUMBER: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function readNormalizedRows(sheet: XLSX.WorkSheet): NormalizedSheetRow[] {
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return rawRows.map((row) => {
    const normalizedRow: NormalizedSheetRow = {};
    Object.entries(row).forEach(([key, value]) => {
      normalizedRow[normalizeKey(key)] = normalizeText(value);
    });
    return normalizedRow;
  });
}

function findSheetByName(workbook: XLSX.WorkBook, expectedName: string): XLSX.WorkSheet | undefined {
  const expected = normalizeKey(expectedName);
  const sheetName = workbook.SheetNames.find((name) => normalizeKey(name) === expected);
  if (!sheetName) return undefined;
  return workbook.Sheets[sheetName];
}

function parseDay(value: string): number | undefined {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  if (normalized in DAY_NAME_TO_NUMBER) {
    return DAY_NAME_TO_NUMBER[normalized];
  }

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
    return numeric;
  }
  return undefined;
}

function parseModality(value: string): "PRESENTIAL" | "ONLINE" | undefined {
  if (!value) return "PRESENTIAL";
  const normalized = normalizeKey(value);
  if (normalized === "presencial" || normalized === "presential") return "PRESENTIAL";
  if (normalized === "online") return "ONLINE";
  return undefined;
}

function parseCredits(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function isValidHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function parseWorkbook(workbook: XLSX.WorkBook): { rows: PreviewRow[]; fileErrors: string[] } {
  const fileErrors: string[] = [];
  const materiasSheet = findSheetByName(workbook, "Materias") ?? workbook.Sheets[workbook.SheetNames[0]];
  const horariosSheet = findSheetByName(workbook, "Horarios");

  if (!materiasSheet) {
    return { rows: [], fileErrors: ["No se encontro una hoja con materias para importar."] };
  }

  const materiasRows = readNormalizedRows(materiasSheet);
  const horariosRows = horariosSheet ? readNormalizedRows(horariosSheet) : [];

  if (materiasRows.length === 0) {
    return { rows: [], fileErrors: ["La hoja de materias esta vacia."] };
  }

  if (materiasRows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      fileErrors: [`El archivo supera el limite de ${MAX_IMPORT_ROWS} materias por importacion.`],
    };
  }

  const scheduleByCode = new Map<string, Array<{ rowNumber: number; data: NormalizedSheetRow }>>();
  horariosRows.forEach((row, index) => {
    const code = (row.codigo_materia || row.codigo || "").trim();
    if (!code) return;
    const key = code.toLowerCase();
    const entries = scheduleByCode.get(key) ?? [];
    entries.push({ rowNumber: index + 2, data: row });
    scheduleByCode.set(key, entries);
  });

  const parsedRows = materiasRows.map((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];

    const name = (row.nombre || row.name || "").trim();
    const code = (row.codigo || row.code || "").trim();
    const teacher = (row.profesor || row.teacher || "").trim();
    const semester = (row.semestre || row.semester || "").trim();
    const color = (row.color || "").trim();
    const creditsRaw = (row.creditos || row.credits || "").trim();

    if (!name) errors.push("Falta nombre.");
    if (!code) errors.push("Falta codigo.");

    const credits = parseCredits(creditsRaw);
    if (creditsRaw && credits === undefined) {
      errors.push("Creditos invalido.");
    }

    if (color && !isValidHexColor(color)) {
      errors.push("Color invalido (usa formato #RRGGBB).");
    }

    const linkedSchedules = scheduleByCode.get(code.toLowerCase()) ?? [];
    const sessions: ImportSessionPayload[] = [];

    linkedSchedules.forEach((entry) => {
      const dayValue = (entry.data.dia || "").trim();
      const startTime = (entry.data.hora_inicio || "").trim();
      const endTime = (entry.data.hora_fin || "").trim();
      const room = (entry.data.salon || entry.data.room || "").trim();
      const modalityRaw = (entry.data.modalidad || "").trim();

      const dayOfWeek = parseDay(dayValue);
      if (dayOfWeek === undefined) {
        errors.push(`Horario fila ${entry.rowNumber}: dia invalido.`);
        return;
      }

      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
        errors.push(`Horario fila ${entry.rowNumber}: formato de hora invalido.`);
        return;
      }

      if (startTime >= endTime) {
        errors.push(`Horario fila ${entry.rowNumber}: hora_inicio debe ser menor a hora_fin.`);
        return;
      }

      const modality = parseModality(modalityRaw);
      if (!modality) {
        errors.push(`Horario fila ${entry.rowNumber}: modalidad invalida.`);
        return;
      }

      sessions.push({
        dayOfWeek,
        startTime,
        endTime,
        room: room || undefined,
        modality,
      });
    });

    const previewRow: PreviewRow = {
      name,
      code,
      teacher: teacher || undefined,
      credits,
      semester: semester || undefined,
      color: color || undefined,
      sessions: sessions.length > 0 ? sessions : undefined,
      rowNumber,
      isValid: errors.length === 0,
      errors,
    };

    return previewRow;
  });

  return { rows: parsedRows, fileErrors };
}

function createTemplate() {
  const workbook = XLSX.utils.book_new();
  const materias = XLSX.utils.json_to_sheet([
    {
      nombre: "Calculo I",
      codigo: "MAT101",
      profesor: "Dr. Garcia",
      creditos: 4,
      semestre: "2026-1",
      color: "#3B82F6",
    },
  ]);
  const horarios = XLSX.utils.json_to_sheet([
    {
      codigo_materia: "MAT101",
      dia: "lunes",
      hora_inicio: "08:00",
      hora_fin: "10:00",
      salon: "Aula 3",
      modalidad: "PRESENCIAL",
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, materias, "Materias");
  XLSX.utils.book_append_sheet(workbook, horarios, "Horarios");
  XLSX.writeFile(workbook, "uniplanner-import-template.xlsx");
}

export function ImportCoursesModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("upload");
      setRows([]);
      setResult(null);
      setFileName("");
      setError("");
      setIsParsing(false);
      setIsSubmitting(false);
    }
  }, [open]);

  const validRows = useMemo(() => rows.filter((row) => row.isValid), [rows]);
  const invalidRows = useMemo(() => rows.filter((row) => !row.isValid), [rows]);

  async function parseFile(file: File): Promise<void> {
    setError("");
    setResult(null);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const parsed = parseWorkbook(workbook);

      if (parsed.fileErrors.length > 0) {
        setError(parsed.fileErrors.join(" "));
        setRows([]);
        setStep("upload");
        return;
      }

      setFileName(file.name);
      setRows(parsed.rows);
      setStep("preview");
    } catch {
      setError("No se pudo leer el archivo. Verifica el formato e intenta de nuevo.");
      setRows([]);
      setStep("upload");
    } finally {
      setIsParsing(false);
    }
  }

  async function onInputChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    await parseFile(file);
  }

  async function onDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await parseFile(file);
  }

  async function submitImport(): Promise<void> {
    setError("");
    if (validRows.length === 0) {
      setError("No hay filas validas para importar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = validRows.map<ImportCoursePayload>((row) => ({
        name: row.name,
        code: row.code,
        teacher: row.teacher,
        credits: row.credits,
        semester: row.semester,
        color: row.color,
        sessions: row.sessions,
      }));

      const response = await api.post<ImportResult>("/courses/import", { courses: payload });
      setResult(response.data);
      if (onImported) {
        await onImported();
      }
      setStep("result");
    } catch (importError) {
      setError(getErrorMessage(importError));
    } finally {
      setIsSubmitting(false);
    }
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
            <DialogPanel className="w-full max-w-5xl rounded-3xl border border-ink-200 bg-white p-6 shadow-panel dark:border-ink-700 dark:bg-[var(--surface)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                    Importacion
                  </p>
                  <DialogTitle className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-100">
                    Importar materias y horarios
                  </DialogTitle>
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
                    Sube un archivo .xlsx, .xls o .csv para importar en lote.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-ink-200 p-2 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                  aria-label="Cerrar modal de importacion"
                >
                  <XMarkIcon className="size-5" />
                </button>
              </div>

              {error && <Alert tone="error" message={error} className="mb-4" />}

              <div className="mb-4 flex items-center gap-2">
                <Badge tone={step === "upload" ? "brand" : "default"}>1. Upload</Badge>
                <Badge tone={step === "preview" ? "brand" : "default"}>2. Preview</Badge>
                <Badge tone={step === "result" ? "brand" : "default"}>3. Resultado</Badge>
              </div>

              {step === "upload" && (
                <div className="space-y-4">
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => void onDrop(event)}
                    className="rounded-2xl border border-dashed border-ink-300 bg-ink-50/60 p-8 text-center dark:border-ink-700 dark:bg-ink-800/35"
                  >
                    <ArrowUpTrayIcon className="mx-auto mb-3 size-8 text-ink-500 dark:text-ink-400" />
                    <p className="text-sm text-ink-700 dark:text-ink-300">
                      Arrastra y suelta tu archivo aqui o selecciona uno desde tu equipo.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <input
                        ref={inputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(event) => void onInputChange(event)}
                      />
                      <Button type="button" onClick={() => inputRef.current?.click()} disabled={isParsing}>
                        {isParsing ? "Procesando..." : "Seleccionar archivo"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={createTemplate}>
                        <ArrowDownTrayIcon className="mr-1 size-4" />
                        Descargar plantilla
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Formatos soportados: .xlsx, .xls, .csv. Limite: {MAX_IMPORT_ROWS} materias por importacion.
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
                      <Badge tone="success">Validas: {validRows.length}</Badge>
                      <Badge tone={invalidRows.length > 0 ? "danger" : "default"}>Con error: {invalidRows.length}</Badge>
                    </div>
                  </div>

                  <div className="max-h-[48vh] overflow-auto rounded-2xl border border-ink-200 dark:border-ink-700">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="sticky top-0 bg-white dark:bg-[var(--surface)]">
                        <tr className="border-b border-ink-200 dark:border-ink-700">
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Fila</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Codigo</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Nombre</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Sesiones</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={`${row.rowNumber}-${row.code}-${row.name}`} className="border-b border-ink-100 dark:border-ink-800">
                            <td className="px-3 py-2 text-ink-600 dark:text-ink-400">{row.rowNumber}</td>
                            <td className="px-3 py-2 font-semibold text-ink-800 dark:text-ink-200">{row.code || "-"}</td>
                            <td className="px-3 py-2 text-ink-800 dark:text-ink-200">{row.name || "-"}</td>
                            <td className="px-3 py-2 text-ink-600 dark:text-ink-400">{row.sessions?.length ?? 0}</td>
                            <td className="px-3 py-2">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  <CheckCircleIcon className="size-4" />
                                  Valida
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-danger-700 dark:text-danger-400">Error</p>
                                  {row.errors.map((rowError, index) => (
                                    <p key={index} className="text-xs text-danger-700 dark:text-danger-400">
                                      - {rowError}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setStep("upload")}>
                      Volver
                    </Button>
                    <Button type="button" onClick={() => void submitImport()} disabled={isSubmitting || validRows.length === 0}>
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
