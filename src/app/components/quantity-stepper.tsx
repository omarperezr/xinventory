import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "./ui/input";

interface QuantityStepperProps {
  value: number;
  onChange: (quantity: number) => void;
  /** Upper bound (available stock). Omit for unbounded. */
  max?: number;
  min?: number;
  label: string;
  size?: "sm" | "md";
  /**
   * Fill the container instead of sizing to content. The two-up product grid
   * on a 360px phone leaves ~134px inside a card, which is narrower than the
   * stepper's natural width; the number field absorbs the difference so the
   * buttons keep their touch size.
   */
  block?: boolean;
}

/**
 * Buffered quantity stepper.
 *
 * The text field is committed on blur/Enter rather than on every keystroke:
 * typing straight through onChange means clearing the box to retype a number
 * momentarily reads as 0, which callers treat as "remove this line".
 */
export function QuantityStepper({
  value,
  onChange,
  max,
  min = 1,
  label,
  size = "md",
  block = false,
}: QuantityStepperProps) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);

  const commit = () => {
    editing.current = false;
    const parsed = parseInt(text, 10);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    let next = parsed;
    if (max !== undefined) next = Math.min(next, max);
    next = Math.max(next, min);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const atMax = max !== undefined && value >= max;
  const atMin = value <= min;
  const btn =
    size === "sm"
      ? "h-10 w-10 min-w-10 flex-shrink-0"
      : "h-12 w-12 min-w-12 flex-shrink-0";

  return (
    <div className={`flex items-center gap-1 ${block ? "w-full" : ""}`}>
      <button
        type="button"
        aria-label={`Disminuir ${label}`}
        disabled={atMin}
        onClick={() => onChange(value - 1)}
        className={`${btn} flex items-center justify-center rounded-lg bg-secondary text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-secondary`}
      >
        <Minus className="w-5 h-5" aria-hidden="true" />
      </button>
      <Input
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        aria-label={label}
        min={min}
        max={max}
        value={text}
        onChange={(e) => {
          editing.current = true;
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        data-money
        className={`text-center font-semibold ${block ? "flex-1 min-w-0 px-1" : "w-16"} ${size === "sm" ? "h-10" : "h-12"}`}
      />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={atMax}
        onClick={() => onChange(value + 1)}
        className={`${btn} flex items-center justify-center rounded-lg bg-secondary text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-secondary`}
      >
        <Plus className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  );
}
