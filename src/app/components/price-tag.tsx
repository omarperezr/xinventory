import {
  useApp,
  isReferenceLens,
  formatMoneyValue,
} from "../context/app-context";
import { cn } from "./ui/utils";

/**
 * The app's one way to print a price: dollars and bolívares side by side at
 * equal weight, because that is how prices are spoken at the counter. The Bs
 * figure always comes from the honest rate; while a reference lens is active
 * it shows that lens instead and says so.
 */

const SIZE = {
  sm: "text-sm font-semibold",
  md: "text-base font-semibold",
  lg: "text-xl font-bold",
  xl: "text-[1.75rem] leading-tight font-bold",
} as const;

export function PriceTag({
  usd,
  size = "md",
  className,
}: {
  usd: number;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const { currency, rates, honestRate } = useApp();

  const lens = isReferenceLens(currency);
  // A reference lens restates the Bs figure at its own rate (read-only);
  // otherwise the honest rate prices the bolívar side.
  const bs =
    currency === "BCV"
      ? usd * rates.USD
      : currency === "EUR"
        ? usd * rates.EUR
        : currency === "USDT"
          ? usd * rates.USDT
          : usd * honestRate;

  return (
    <span
      data-money
      className={cn(
        "inline-flex flex-wrap items-baseline gap-x-2 gap-y-0 text-foreground",
        SIZE[size],
        className,
      )}
    >
      <span>{`$ ${formatMoneyValue(usd)}`}</span>
      <span aria-hidden="true" className="font-normal text-border-strong">
        ·
      </span>
      <span className={lens ? "text-pending" : undefined}>
        {`Bs ${formatMoneyValue(bs)}`}
        {lens && <span className="ml-1 align-middle text-xs font-semibold">ref.</span>}
      </span>
    </span>
  );
}

/** Stock level as words a first-day employee reads correctly. */
export function StockChip({
  quantity,
  unit = "units",
  size = "md",
  className,
}: {
  quantity: number;
  unit?: "units" | "kg" | "liters";
  size?: "sm" | "md";
  className?: string;
}) {
  const unitLabel = { units: "u", kg: "kg", liters: "L" }[unit];
  const state =
    quantity === 0 ? "out" : quantity < 10 ? "low" : "ok";

  const styles = {
    out: "bg-destructive-soft text-destructive-soft-foreground",
    low: "bg-pending-soft text-pending",
    ok: "bg-primary-soft text-primary-soft-foreground",
  }[state];

  const label =
    state === "out"
      ? "Agotado"
      : state === "low"
        ? `Quedan ${quantity} ${unitLabel}`
        : `${quantity} ${unitLabel}`;

  return (
    <span
      data-money
      className={cn(
        "inline-flex items-center rounded-full font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        styles,
        className,
      )}
    >
      {label}
    </span>
  );
}
