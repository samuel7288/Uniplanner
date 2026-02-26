import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { CheckCircleIcon, ClipboardDocumentListIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Button } from "./UI";

const steps = [
  {
    title: "Configura tus materias",
    description: "Empieza creando tus cursos y horarios para que el planner tenga contexto academico.",
    icon: RectangleGroupIcon,
    ctaLabel: "Ir a materias",
    ctaTo: "/courses",
  },
  {
    title: "Carga tareas y examenes",
    description: "Registra deadlines y evaluaciones para activar recordatorios y el timeline diario.",
    icon: ClipboardDocumentListIcon,
    ctaLabel: "Ir a tareas",
    ctaTo: "/assignments",
  },
  {
    title: "Revisa dashboard y calendario",
    description: "Usa el dashboard para ver riesgo academico y el calendario para reprogramar eventos rapido.",
    icon: CheckCircleIcon,
    ctaLabel: "Ir a dashboard",
    ctaTo: "/dashboard",
  },
];

export function OnboardingTour({
  open,
  step,
  onNext,
  onPrev,
  onClose,
}: {
  open: boolean;
  step: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const current = steps[Math.max(0, Math.min(step, steps.length - 1))];
  const Icon = current.icon;
  const isFirst = step <= 0;
  const isLast = step >= steps.length - 1;

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
            <DialogPanel className="w-full max-w-lg rounded-3xl border border-ink-200 bg-white p-6 shadow-panel dark:border-ink-700 dark:bg-[var(--surface)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                Primeros pasos
              </p>
              <DialogTitle className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-100">
                Bienvenido a UniPlanner
              </DialogTitle>

              <div className="mt-4 rounded-2xl border border-ink-200 bg-[var(--surface-soft)] p-4 dark:border-ink-700">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-700 dark:text-ink-300">
                    Paso {step + 1} de {steps.length}
                  </p>
                  <div className="flex gap-1.5">
                    {steps.map((_, idx) => (
                      <span
                        key={idx}
                        className={`h-1.5 w-8 rounded-full ${
                          idx <= step
                            ? "bg-brand-600"
                            : "bg-ink-200 dark:bg-ink-700"
                        }`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-xl bg-brand-50 p-2.5 dark:bg-brand-700/15">
                    <Icon className="size-5 text-brand-700 dark:text-brand-400" />
                  </span>
                  <div>
                    <p className="font-semibold text-ink-800 dark:text-ink-200">{current.title}</p>
                    <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">{current.description}</p>
                    <Link
                      to={current.ctaTo}
                      onClick={onClose}
                      className="mt-3 inline-flex text-sm font-semibold text-brand-700 dark:text-brand-400"
                    >
                      {current.ctaLabel}
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Omitir tour
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={onPrev} disabled={isFirst}>
                    Atras
                  </Button>
                  <Button type="button" onClick={isLast ? onClose : onNext}>
                    {isLast ? "Finalizar" : "Siguiente"}
                  </Button>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
