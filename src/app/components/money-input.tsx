import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/app-context";
import { Input } from "./ui/input";

type EntryCurrency = "USD" | "BS";

interface MoneyInputProps {
  /** Canonical USD value. This is the single source of truth. */
  valueUsd: number;
  /** Called only when the user actually changed the amount. */
  onCommitUsd: (usd: number) => void;
  label: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Renders the "$ x.xx / Bs y.yy" equivalence line under the field. */
  showPreview?: boolean;
}

/**
 * Money entry with an explicit USD/Bs toggle.
 *
 * Deliberately ignores the app's display-currency lens. The lens can be a
 * reference rate (BCV/EUR) that we do NOT consider the real worth of a
 * bolivar, so entering money through it would book the amount at the wrong
 * value. Bolivares here always convert at the honest rate, and because
 * bsToUsd/usdToBs are exact inverses, focusing and blurring without typing can
 * never alter the stored price.
 */
export function MoneyInput({
  valueUsd,
  onCommitUsd,
  label,
  disabled,
  autoFocus,
  className,
  showPreview,
}: MoneyInputProps) {
  const { bsToUsd, usdToBs, honestRateKey } = useApp();
  const [entry, setEntry] = useState<EntryCurrency>("USD");
  const [text, setText] = useState("");
  // Only a real edit may write. Without this, any focus/blur would commit a
  // recomputed value - historically the source of silent price drift.
  const dirty = useRef(false);

  const toDisplay = (usd: number) => (entry === "USD" ? usd : usdToBs(usd));
  const toUsd = (amount: number) => (entry === "USD" ? amount : bsToUsd(amount));

  // Resync whenever the underlying value or the entry basis changes, but never
  // while the user is mid-edit.
  useEffect(() => {
    if (dirty.current) return;
    setText(toDisplay(valueUsd).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueUsd, entry, honestRateKey]);

  const reset = () => {
    dirty.current = false;
    setText(toDisplay(valueUsd).toFixed(2));
  };

  const commit = () => {
    if (!dirty.current) return;
    const parsed = parseFloat(text);
    if (!Number.isFinite(parsed) || parsed < 0) {
      reset();
      return;
    }
    const usd = toUsd(parsed);
    if (!Number.isFinite(usd)) {
      reset();
      return;
    }
    dirty.current = false;
    // Round to cents so repeated edits can't accumulate float dust.
    const rounded = Math.round(usd * 100) / 100;
    if (Math.abs(rounded - valueUsd) < 0.005) {
      setText(toDisplay(valueUsd).toFixed(2));
      return;
    }
    onCommitUsd(rounded);
  };

  const parsedPreview = parseFloat(text);
  const previewUsd = Number.isFinite(parsedPreview) ? toUsd(parsedPreview) : null;

  return (
    <div className={className}>
      <div className="flex items-stretch gap-1">
        <div className="relative flex-1">
          <span
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none"
          >
            {entry === "USD" ? "$" : "Bs"}
          </span>
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={`${label} en ${entry === "USD" ? "dólares" : "bolívares"}`}
            disabled={disabled}
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => {
              dirty.current = true;
              setText(e.target.value);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                reset();
              }
            }}
            className="h-11 pl-8 pr-2"
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Cambiar entrada a ${entry === "USD" ? "bolívares" : "dólares"}`}
          aria-pressed={entry === "BS"}
          onClick={() => {
            // Switching basis re-renders the same stored value in the other
            // unit; it must not count as an edit.
            dirty.current = false;
            setEntry((c) => (c === "USD" ? "BS" : "USD"));
          }}
          className="h-11 min-w-11 px-2 rounded-md border border-input bg-input-background text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {entry === "USD" ? "USD" : "Bs"}
        </button>
      </div>

      {showPreview && previewUsd !== null && (
        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2">
          <span className={entry === "USD" ? "font-bold text-primary" : ""}>
            $ {previewUsd.toFixed(2)}
          </span>
          <span className="text-gray-300" aria-hidden="true">
            |
          </span>
          <span className={entry === "BS" ? "font-bold text-primary" : ""}>
            Bs {usdToBs(previewUsd).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
