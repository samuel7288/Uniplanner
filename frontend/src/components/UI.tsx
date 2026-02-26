import clsx from "clsx";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
} from "recharts";
import {
  ButtonHTMLAttributes,
  forwardRef,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Tone = "default" | "brand" | "success" | "warning" | "danger";

export function PageTitle({
  title,
  subtitle,
  overline,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  overline?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {overline && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
            {overline}
          </p>
        )}
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight text-ink-900 dark:text-ink-100 md:text-[2rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-400 md:text-[0.95rem]">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
  tone = "default",
}: PropsWithChildren<{
  className?: string;
  tone?: Tone;
}>) {
  return (
    <section
      className={clsx(
        "surface-border surface-elevated rounded-2xl p-4 md:p-5",
        tone === "brand" &&
          "border-brand-100 bg-gradient-to-b from-brand-50/80 to-white dark:border-brand-700/40 dark:from-brand-700/15 dark:to-[var(--surface)]",
        tone === "success" &&
          "border-accent-100 bg-gradient-to-b from-accent-50/80 to-white dark:border-accent-700/40 dark:from-accent-700/15 dark:to-[var(--surface)]",
        tone === "warning" &&
          "border-amber-200 bg-gradient-to-b from-amber-50/90 to-white dark:border-amber-700/40 dark:from-amber-900/20 dark:to-[var(--surface)]",
        tone === "danger" &&
          "border-danger-100 bg-gradient-to-b from-danger-50/90 to-white dark:border-danger-700/40 dark:from-danger-900/20 dark:to-[var(--surface)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  helper,
  error,
  children,
}: PropsWithChildren<{ label: string; htmlFor?: string; helper?: string; error?: string }>) {
  return (
    <label className="grid gap-1.5 text-sm text-ink-700 dark:text-ink-300" htmlFor={htmlFor}>
      <span className="font-semibold text-ink-700 dark:text-ink-300">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-xs font-medium text-danger-600 dark:text-danger-400">
          {error}
        </span>
      )}
      {helper && !error && (
        <span className="text-xs text-ink-500 dark:text-ink-400">{helper}</span>
      )}
    </label>
  );
}

const baseFieldClass =
  "w-full rounded-xl border border-ink-200 bg-white/90 px-3 py-2.5 text-[0.94rem] text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 placeholder:text-ink-400 " +
  "dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-100 dark:placeholder:text-ink-500 dark:focus:border-brand-500 dark:focus:ring-brand-700/30";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => {
    return <input ref={ref} {...props} className={clsx(baseFieldClass, props.className)} />;
  },
);
TextInput.displayName = "TextInput";

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  (props, ref) => {
    return (
      <select
        ref={ref}
        {...props}
        className={clsx(baseFieldClass, "pr-8 dark:bg-[var(--surface)]", props.className)}
      />
    );
  },
);
SelectInput.displayName = "SelectInput";

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  (props, ref) => {
    return (
      <textarea ref={ref} {...props} className={clsx(baseFieldClass, "min-h-24 resize-y", props.className)} />
    );
  },
);
TextArea.displayName = "TextArea";

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "danger" | "subtle";
    size?: "sm" | "md" | "lg";
  },
) {
  const { variant = "primary", size = "md", className, ...rest } = props;

  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center rounded-xl font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" && "px-2.5 py-1.5 text-xs",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-4.5 py-2.5 text-sm",
        variant === "primary" && "bg-brand-600 text-white shadow-soft hover:bg-brand-700",
        variant === "ghost" &&
          "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-600 dark:bg-[var(--surface)] dark:text-ink-300 dark:hover:bg-ink-800",
        variant === "danger" && "bg-danger-600 text-white shadow-soft hover:bg-danger-700",
        variant === "subtle" &&
          "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-700/20 dark:text-brand-400 dark:hover:bg-brand-700/30",
        className,
      )}
    />
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: PropsWithChildren<{ tone?: Tone; className?: string }>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[0.69rem] font-semibold uppercase tracking-wide",
        tone === "default" &&
          "border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300",
        tone === "brand" &&
          "border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-700/50 dark:bg-brand-700/20 dark:text-brand-400",
        tone === "success" &&
          "border-accent-100 bg-accent-50 text-accent-700 dark:border-accent-700/50 dark:bg-accent-700/20 dark:text-accent-400",
        tone === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400",
        tone === "danger" &&
          "border-danger-100 bg-danger-50 text-danger-700 dark:border-danger-700/50 dark:bg-danger-900/20 dark:text-danger-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone,
  message,
  className,
}: {
  tone: "info" | "success" | "warning" | "error";
  message: string;
  className?: string;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "rounded-xl border px-3 py-2 text-sm",
        tone === "info" &&
          "border-brand-100 bg-brand-50/80 text-brand-700 dark:border-brand-700/40 dark:bg-brand-700/15 dark:text-brand-400",
        tone === "success" &&
          "border-accent-100 bg-accent-50/80 text-accent-700 dark:border-accent-700/40 dark:bg-accent-700/15 dark:text-accent-400",
        tone === "warning" &&
          "border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400",
        tone === "error" &&
          "border-danger-100 bg-danger-50/80 text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400",
        className,
      )}
    >
      {message}
    </p>
  );
}

type EmptyStateContext =
  | "assignments"
  | "exams"
  | "projects"
  | "courses"
  | "notifications"
  | "calendar"
  | "schedule"
  | "generic";

function EmptyIllustration({ context }: { context: EmptyStateContext }) {
  if (context === "assignments") {
    return (
      <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <rect x="10" y="8" width="36" height="40" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="18" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="28" x2="38" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="36" x2="28" y2="36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="14" cy="20" r="2" fill="currentColor" />
        <circle cx="14" cy="28" r="2" fill="currentColor" />
        <circle cx="14" cy="36" r="2" fill="currentColor" />
      </svg>
    );
  }
  if (context === "exams") {
    return (
      <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <path d="M28 8 L48 20 L48 36 L28 48 L8 36 L8 20 Z" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M28 16 L40 23 L40 33 L28 40 L16 33 L16 23 Z" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
        <circle cx="28" cy="28" r="4" fill="currentColor" />
      </svg>
    );
  }
  if (context === "projects") {
    return (
      <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <rect x="6" y="14" width="18" height="30" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <rect x="28" y="8" width="22" height="14" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <rect x="28" y="26" width="22" height="18" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="10" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="10" y1="28" x2="20" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="10" y1="34" x2="20" y2="34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (context === "courses") {
    return (
      <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <path d="M28 10 L50 22 L28 34 L6 22 Z" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M14 28 L14 38 C14 38 20 46 28 46 C36 46 42 38 42 38 L42 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <line x1="50" y1="22" x2="50" y2="36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (context === "notifications") {
    return (
      <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <path d="M28 8 C20 8 14 14 14 22 L14 34 L8 40 L48 40 L42 34 L42 22 C42 14 36 8 28 8 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
        <path d="M22 40 C22 43.3 24.7 46 28 46 C31.3 46 34 43.3 34 40" stroke="currentColor" strokeWidth="2" fill="none" />
        <circle cx="38" cy="14" r="5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (context === "calendar") {
    return (
      <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <rect x="8" y="12" width="40" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="8" y1="22" x2="48" y2="22" stroke="currentColor" strokeWidth="2" />
        <line x1="20" y1="8" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="36" y1="8" x2="36" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="16" y="28" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.4" />
        <rect x="26" y="28" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6" />
        <rect x="36" y="28" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.3" />
      </svg>
    );
  }
  if (context === "schedule") {
    return (
      <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="20" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="28" y1="14" x2="28" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="28" y1="28" x2="38" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="28" cy="28" r="2.5" fill="currentColor" />
      </svg>
    );
  }
  // generic
  return (
    <svg aria-hidden="true" className="mx-auto mb-3 text-ink-300 dark:text-ink-600" width="56" height="56" viewBox="0 0 56 56" fill="none">
      <rect x="8" y="8" width="40" height="40" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" fill="none" />
      <circle cx="28" cy="26" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M18 42 C18 36 22 32 28 32 C34 32 38 36 38 42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
  context,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  context?: EmptyStateContext;
}) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-ink-200 bg-white/65 p-6 text-center dark:border-ink-700 dark:bg-[var(--surface-soft)]/40"
    >
      {context && <EmptyIllustration context={context} />}
      <p className="font-display text-lg font-semibold text-ink-800 dark:text-ink-200">{title}</p>
      <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({
  className,
  variant = "block",
}: {
  className?: string;
  variant?: "block" | "text-line" | "avatar" | "table-row" | "card";
}) {
  const variantClass =
    variant === "text-line"
      ? "h-4 w-3/4 rounded-md"
      : variant === "avatar"
        ? "h-10 w-10 rounded-full shrink-0"
        : variant === "card"
          ? "h-32 rounded-2xl"
          : variant === "table-row"
            ? "h-12 w-full rounded-xl"
            : "rounded-xl";

  return (
    <div
      className={clsx(
        "animate-pulse-soft bg-ink-100 dark:bg-ink-800",
        variantClass,
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 dark:border-ink-700 dark:bg-[var(--surface)]">
          <Skeleton variant="text-line" className="w-1/3" />
          <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 dark:border-ink-700 dark:bg-[var(--surface)]">
          <Skeleton variant="text-line" className="w-1/3" />
          <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 dark:border-ink-700 dark:bg-[var(--surface)]">
          <Skeleton variant="text-line" className="w-1/3" />
          <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 dark:border-ink-700 dark:bg-[var(--surface)]">
          <Skeleton variant="text-line" className="w-1/3" />
          <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 dark:border-ink-700 dark:bg-[var(--surface)]">
          <Skeleton className="h-6 w-48 rounded-lg" />
          <Skeleton className="mt-4 h-16 w-full rounded-xl" />
          <Skeleton className="mt-2 h-16 w-full rounded-xl" />
          <Skeleton className="mt-2 h-16 w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 dark:border-ink-700 dark:bg-[var(--surface)]">
          <Skeleton className="h-6 w-36 rounded-lg" />
          <Skeleton className="mt-4 h-12 w-32 rounded-lg" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ScheduleSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="rounded-2xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-[var(--surface)]">
        <div className="grid grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={`head-${idx}`} className="h-8 rounded-lg" />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-8 gap-2">
          {Array.from({ length: 40 }).map((_, idx) => (
            <Skeleton key={`cell-${idx}`} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 dark:border-ink-700 dark:bg-[var(--surface)]">
        <Skeleton className="h-6 w-44 rounded-lg" />
        <Skeleton className="mt-3 h-12 w-full rounded-xl" />
        <Skeleton className="mt-2 h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="rounded-2xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-[var(--surface)]">
        <div className="grid gap-2 md:grid-cols-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-[var(--surface)]">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, idx) => (
            <Skeleton key={idx} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  trend,
  tone = "default",
  trendData,
  className,
}: {
  label: string;
  value: string | number;
  trend?: string;
  tone?: Tone;
  trendData?: number[];
  className?: string;
}) {
  const chartData = trendData?.map((v) => ({ v }));

  return (
    <Card tone={tone} className={clsx("relative overflow-hidden p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className="kpi-value mt-2 text-[2rem] font-semibold leading-none text-ink-900 dark:text-ink-100">
        {value}
      </p>
      {trend && !trendData && (
        <p className="mt-2 text-xs font-semibold text-ink-600 dark:text-ink-400">{trend}</p>
      )}
      {chartData && chartData.length > 0 && (
        <div className="mt-2 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={6} barCategoryGap={3} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Bar dataKey="v" radius={[2, 2, 0, 0]} fill="currentColor" className="text-brand-400 opacity-70" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {trend && trendData && (
        <p className="mt-1 text-xs font-semibold text-ink-500 dark:text-ink-400">{trend}</p>
      )}
      <span className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-white/35 dark:bg-white/10" aria-hidden="true" />
    </Card>
  );
}
