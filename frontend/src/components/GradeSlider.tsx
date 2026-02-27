import { TextInput } from "./UI";

type GradeSliderProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  helper?: string;
  onChange: (value: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function GradeSlider({
  id,
  label,
  value,
  min = 0,
  max = 10,
  step = 0.1,
  helper,
  onChange,
}: GradeSliderProps) {
  function handleValueChange(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    onChange(clamp(parsed, min, max));
  }

  return (
    <div className="grid gap-2 rounded-xl border border-ink-200/80 bg-white/80 p-3 dark:border-ink-700 dark:bg-ink-900/30">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-ink-800 dark:text-ink-200">
          {label}
        </label>
        <span className="text-xs font-semibold text-brand-700 dark:text-brand-400">{value.toFixed(1)}</span>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => handleValueChange(event.target.value)}
        className="h-2 w-full cursor-pointer accent-brand-600"
      />

      <div className="flex items-center gap-2">
        <TextInput
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => handleValueChange(event.target.value)}
          className="w-24"
        />
        <span className="text-xs text-ink-500 dark:text-ink-400">/{max}</span>
      </div>

      {helper && <p className="text-xs text-ink-500 dark:text-ink-400">{helper}</p>}
    </div>
  );
}
