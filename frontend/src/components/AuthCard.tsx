import { PropsWithChildren, ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: PropsWithChildren<{ title: string; subtitle?: string; footer?: ReactNode }>) {
  return (
    <div className="page-enter mx-auto mt-10 w-full max-w-md rounded-3xl border border-ink-200 bg-white/95 p-7 shadow-panel backdrop-blur dark:border-ink-700 dark:bg-[var(--surface)]">
      <div className="mb-5 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-400">
          <span className="rounded-lg bg-brand-100 px-2 py-1 text-xs uppercase tracking-[0.13em] text-brand-700 dark:bg-brand-700/20 dark:text-brand-400">UP</span>
          UniPlanner
        </Link>
        <span className="rounded-full border border-accent-100 bg-accent-50 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-accent-700 dark:border-accent-700/40 dark:bg-accent-700/15 dark:text-accent-300">
          Student OS
        </span>
      </div>
      <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-100">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-400">{subtitle}</p>}
      <div className="mt-6 grid gap-3">{children}</div>
      {footer && <div className="mt-5 text-sm text-ink-600 dark:text-ink-400">{footer}</div>}
    </div>
  );
}

