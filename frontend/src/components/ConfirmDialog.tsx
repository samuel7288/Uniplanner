import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Fragment, ReactNode } from "react";
import { Button } from "./UI";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onCancel} className="relative z-[60]">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-[#0f2439]/50 backdrop-blur-sm dark:bg-black/60" aria-hidden="true" />
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
            <DialogPanel className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-6 shadow-panel dark:border-ink-700 dark:bg-[var(--surface)]">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50 dark:bg-danger-900/30">
                  <ExclamationTriangleIcon className="size-5 text-danger-600 dark:text-danger-400" />
                </div>
                <div className="flex-1">
                  <DialogTitle className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
                    {title}
                  </DialogTitle>
                  <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-400">{description}</p>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel}>
                  {cancelLabel}
                </Button>
                <Button
                  type="button"
                  variant={tone === "danger" ? "danger" : "primary"}
                  onClick={() => void onConfirm()}
                >
                  {confirmLabel}
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
