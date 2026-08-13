import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  formatMoneyValue,
  isReferenceLens,
  useApp,
} from "../context/app-context";
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
  /**
   * Shorter control for dense desktop tables, where the full 44px version is
   * wide enough to push neighbouring columns out of the row. Only use this
   * where the control is not a primary touch target.
   */
  compact?: boolean;
}

// Venezuelan keyboards type comma decimals ("4,50"). A type="number" field
// never lets us see them - Firefox reports badInput as an empty value, so the
// blur would silently reset a price the seller believes was changed. The
// field is therefore plain text and the comma is normalized here. Number()
// rather than parseFloat, so trailing garbage ("4,5x") errors out instead of
// silently truncating the amount.
const parseAmount = (raw: string): number => {
  const normalized = raw.trim().replace(",", ".");
  return normalized === "" ? NaN : Number(normalized);
};

/**
 * Money entry with an explicit USD/Bs toggle.
 *
 * Deliberately ignores the app's display-currency lens for conversion, and
 * disables itself entirely while a reference lens (BCV/EUR) is active: those
 * rates are not what we consider the real worth of a bolivar, so a figure
 * read off a reference screen and retyped here would book at the honest rate
 * as a different value. Bolivares here always convert at the honest rate, and
 * because bsToUsd/usdToBs are exact inverses, focusing and blurring without
 * typing can never alter the stored price.
 */
export function MoneyInput({
  valueUsd,
  onCommitUsd,
  label,
  disabled,
  autoFocus,
  className,
  showPreview,
  compact,
}: MoneyInputProps) {
  const { bsToUsd, usdToBs, honestRate, currency } = useApp();
  const [entry, setEntry] = useState<EntryCurrency>("USD");
  const [text, setText] = useState("");
  // Only a real edit may write. Without this, any focus/blur would commit a
  // recomputed value - historically the source of silent price drift.
  const dirty = useRef(false);

  // Blocked, not just discouraged: same rule as the Pagar button in
  // total-view. Guarding in the shared field covers every money entry
  // built on it at once.
  const lensBlocked = isReferenceLens(currency);
  const isDisabled = disabled || lensBlocked;

  const toDisplay = (usd: number) => (entry === "USD" ? usd : usdToBs(usd));
  const toUsd = (amount: number) => (entry === "USD" ? amount : bsToUsd(amount));

  // Resync whenever the underlying value, the entry basis, or the honest rate
  // itself changes (a background rate sync must not leave a mounted Bs field
  // quoting bolivares at the old rate), but never while the user is mid-edit.
  useEffect(() => {
    if (dirty.current) return;
    setText(toDisplay(valueUsd).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueUsd, entry, honestRate]);

  const reset = () => {
    dirty.current = false;
    setText(toDisplay(valueUsd).toFixed(2));
  };

  const commit = () => {
    if (!dirty.current) return;
    const parsed = parseAmount(text);
    if (!Number.isFinite(parsed) || parsed < 0) {
      // Say why the edit did not stick: a silent reset reads as a saved
      // price, and the sale then closes at the old one.
      if (text.trim() !== "") toast.error(`Monto inválido: "${text.trim()}"`);
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

  const parsedPreview = parseAmount(text);
  const previewUsd = Number.isFinite(parsedPreview) ? toUsd(parsedPreview) : null;

  return (
    <div className={className}>
      <div className="flex items-stretch gap-1">
        <div className="relative flex-1">
          <span
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground pointer-events-none"
          >
            {entry === "USD" ? "$" : "Bs"}
          </span>
          <Input
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={`${label} en ${entry === "USD" ? "dólares" : "bolívares"}`}
            disabled={isDisabled}
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
            data-money
            className={`${compact ? "h-10" : "h-12"} pl-9 pr-3 font-semibold`}
          />
        </div>
        <button
          type="button"
          disabled={isDisabled}
          aria-label={`Cambiar entrada a ${entry === "USD" ? "bolívares" : "dólares"}`}
          aria-pressed={entry === "BS"}
          onClick={() => {
            // Switching basis re-renders the same stored value in the other
            // unit; it must not count as an edit.
            dirty.current = false;
            setEntry((c) => (c === "USD" ? "BS" : "USD"));
          }}
          className={`${compact ? "h-10 min-w-10 px-2" : "h-12 min-w-12 px-3"} rounded-lg border border-input bg-input-background text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50`}
        >
          {entry === "USD" ? "USD" : "Bs"}
        </button>
      </div>

      {lensBlocked && (
        <p className="text-sm text-pending mt-1.5">
          Estás viendo una tasa de referencia. Cambia a USD o Bs para ingresar
          montos.
        </p>
      )}

      {showPreview && previewUsd !== null && (
        <div
          data-money
          className="text-sm text-muted-foreground mt-1.5 flex flex-wrap items-baseline gap-x-2"
        >
          <span className={entry === "USD" ? "font-bold text-foreground" : ""}>
            {`$ ${formatMoneyValue(previewUsd)}`}
          </span>
          <span className="text-border-strong" aria-hidden="true">
            ·
          </span>
          <span className={entry === "BS" ? "font-bold text-foreground" : ""}>
            {`Bs ${formatMoneyValue(usdToBs(previewUsd))}`}
          </span>
        </div>
      )}
    </div>
  );
}
