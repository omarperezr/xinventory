// Shared building blocks for the reports dashboard: the palette, stat tiles,
// section cards and the sortable table every panel reuses.
//
// Series colours are the app's five chart tokens (--chart-1..5); state colours
// (good/warning/serious/critical) reuse the money-green, pending-amber,
// chart-4 purple and destructive-red tokens so a chart never invents a hue the
// rest of the app doesn't already use. Every chart that leans on colour also
// ships a legend, a tooltip and a table or direct labels - colour is never the
// only way to read a value.

import { ReactNode, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Minus } from "lucide-react";
import type { ReportBundle } from "../../services/report-analytics";

/** What every panel of the dashboard receives. Figures arrive in USD; the
 *  formatters render them in whatever display currency is selected. */
export interface PanelProps {
  report: ReportBundle;
  /** Full precision, e.g. "$ 1234.56". */
  money: (usd: number) => string;
  /** Abbreviated for tiles and axes, e.g. "$ 1.2K". */
  moneyCompact: (usd: number) => string;
  /** USD to the display currency, for chart values. */
  convert: (usd: number) => number;
  symbol: string;
}

/** Categorical slots - the app's chart-1..5 tokens. Assign in order and never
 *  cycle past the last one. */
export const SERIES = [
  "#0f7b4d", // chart-1 / primary
  "#3f6fae", // chart-2
  "#d9962b", // chart-3
  "#8a5fa8", // chart-4
  "#c05252", // chart-5
] as const;

/** Reserved for state, never for identity. Sourced from the same tokens as
 *  every other status colour in the app. */
export const STATUS = {
  good: "#0f7b4d", // --primary
  warning: "#8a5a06", // --pending
  serious: "#8a5fa8", // --chart-4, for "frozen" states distinct from warning/critical
  critical: "#bf2e2e", // --destructive
} as const;

export const INK = {
  secondary: "#2c3833", // --secondary-foreground
  muted: "#55625c", // --muted-foreground
  grid: "#e3e8e6", // --border
  axis: "#e3e8e6", // --border
} as const;

/** A number a shop owner can read at a glance: 1.284 / 12,3K / 4,2M. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(1)}K`;
  if (abs >= 1000) return value.toFixed(0);
  return value.toFixed(abs < 10 ? 2 : 0);
}

export function formatDays(days: number): string {
  if (!Number.isFinite(days)) return "—";
  if (days < 1) return "<1 día";
  if (days < 10) return `${days.toFixed(1)} días`;
  if (days > 999) return "+999 días";
  return `${Math.round(days)} días`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function SectionCard({
  title,
  subtitle,
  icon,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-white rounded-xl border border-border shadow-card ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 md:px-5 pt-4 pb-3 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground text-base flex items-center gap-2">
            {icon}
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </header>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground py-6 text-center">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Stat tiles
// ---------------------------------------------------------------------------

export function DeltaBadge({
  value,
  higherIsBetter = true,
  suffix = "%",
  label,
}: {
  value: number | null;
  higherIsBetter?: boolean;
  suffix?: string;
  label?: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1 text-meta text-muted-foreground">
        <Minus className="w-3 h-3" aria-hidden="true" />
        sin base
      </span>
    );
  }
  const flat = Math.abs(value) < 0.5;
  const good = higherIsBetter ? value > 0 : value < 0;
  const color = flat
    ? "text-muted-foreground"
    : good
      ? "text-primary-soft-foreground"
      : "text-destructive";
  const Icon = flat ? Minus : value > 0 ? ArrowUp : ArrowDown;
  // The comparison is named in words: a bare "↓ 81.6%" next to another figure
  // reads as noise to the slowest user. es-VE decimal comma for display.
  const pct = Math.abs(value).toFixed(value >= 100 ? 0 : 1).replace(".", ",");
  return (
    <span className={`inline-flex items-center gap-0.5 text-meta font-medium ${color}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      <span className="sr-only">{flat ? "igual," : value > 0 ? "subió" : "bajó"}</span>
      {pct}
      {suffix}
      <span className="text-muted-foreground font-normal ml-0.5">
        {label ?? "vs. anterior"}
      </span>
    </span>
  );
}

/** One card with the period's headline figures. On phones they wrap into a
 *  two-column grid so everything is visible without horizontal scrolling; on
 *  lg+ they sit side by side with dividers. relative keeps the absolute
 *  sr-only spans inside from widening the page. */
export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="relative bg-white rounded-xl border border-border shadow-card">
      <div className="grid grid-cols-2 lg:flex lg:divide-x lg:divide-border">{children}</div>
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  delta,
  higherIsBetter = true,
  tone = "default",
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  higherIsBetter?: boolean;
  tone?: "default" | "good" | "warning" | "critical";
  onClick?: () => void;
}) {
  const valueColor =
    tone === "good"
      ? "text-primary-soft-foreground"
      : tone === "critical"
        ? "text-destructive"
        : tone === "warning"
          ? "text-pending"
          : "text-foreground";
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`min-w-0 lg:flex-1 p-3.5 md:p-4 text-left ${
        onClick ? "hover:bg-secondary transition-colors cursor-pointer" : ""
      }`}
    >
      <p className="text-sm text-muted-foreground leading-tight truncate">{label}</p>
      <p className={`text-2xl font-bold truncate ${valueColor}`} data-money>
        {value}
      </p>
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        {delta !== undefined && (
          <DeltaBadge value={delta} higherIsBetter={higherIsBetter} />
        )}
        {hint && (
          <span className="text-meta text-muted-foreground">
            {delta !== undefined ? "· " : ""}
            {hint}
          </span>
        )}
      </div>
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex bg-secondary rounded-lg p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`tap-target ${
            size === "xs" ? "text-meta px-2 py-1.5" : "text-sm px-3 py-1.5"
          } rounded-md font-semibold transition-colors whitespace-nowrap ${
            value === o.value
              ? "bg-white text-primary shadow-card"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

/** Legend: identity always readable without matching colours by eye. */
export function Legend({
  entries,
}: {
  entries: { label: string; color: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
      {entries.map((e) => (
        <li key={e.label} className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Swatch color={e.color} />
          {e.label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

export function MeterBar({
  pct,
  color = SERIES[0],
  track = "#eef1f0",
}: {
  pct: number;
  color?: string;
  track?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div
      className="h-1.5 rounded-full overflow-hidden"
      style={{ backgroundColor: track }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function RankRow({
  index,
  name,
  value,
  sub,
  pct,
  color = SERIES[0],
  valueTone = "default",
}: {
  index: number;
  name: string;
  value: string;
  sub?: string;
  pct: number;
  color?: string;
  valueTone?: "default" | "good" | "bad";
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-meta font-mono text-muted-foreground flex-shrink-0 w-5 tabular-nums">
            #{index}
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {name}
          </span>
        </div>
        <div className="text-right flex-shrink-0">
          <span
            className={`text-sm font-semibold tabular-nums ${
              valueTone === "good"
                ? "text-primary-soft-foreground"
                : valueTone === "bad"
                  ? "text-destructive"
                  : "text-foreground"
            }`}
          >
            {value}
          </span>
          {sub && <span className="text-meta text-muted-foreground ml-1.5">{sub}</span>}
        </div>
      </div>
      <MeterBar pct={pct} color={color} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T, index: number) => ReactNode;
  sortValue?: (row: T) => number | string;
  /** Hidden below md, for columns that are nice-to-have on a phone. */
  secondary?: boolean;
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  initialDir = "desc",
  emptyLabel = "Sin datos en este período",
  maxHeight = "24rem",
  pageSize,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  initialSort?: string;
  initialDir?: "asc" | "desc";
  emptyLabel?: string;
  maxHeight?: string;
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSort);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, columns, sortKey, dir]);

  const visible = pageSize && !expanded ? sorted.slice(0, pageSize) : sorted;

  const toggle = (col: Column<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(col.key);
      setDir("desc");
    }
  };

  if (rows.length === 0) return <EmptyNote>{emptyLabel}</EmptyNote>;

  return (
    <div>
      {/* table-fixed on phones so the table splits the screen width instead
          of growing to its content and scrolling sideways; the first column
          (names) gets the biggest share and truncates. */}
      <div className="-mx-4 md:-mx-5 px-4 md:px-5 md:overflow-x-auto">
        <div className="overflow-x-hidden" style={{ maxHeight, overflowY: "auto" }}>
          <table className="w-full text-sm border-collapse table-fixed md:table-auto">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-border">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`py-2 px-2 font-medium text-muted-foreground align-bottom md:whitespace-nowrap first:w-[38%] md:first:w-auto ${
                      c.align === "right" ? "text-right" : "text-left"
                    } ${c.secondary ? "hidden md:table-cell" : ""} ${
                      c.sortValue ? "cursor-pointer select-none hover:text-foreground" : ""
                    }`}
                    onClick={() => toggle(c)}
                  >
                    <span
                      className={`inline-flex items-center gap-1 ${
                        c.align === "right" ? "flex-row-reverse" : ""
                      }`}
                    >
                      {c.header}
                      {c.sortValue &&
                        (sortKey === c.key ? (
                          dir === "asc" ? (
                            <ArrowUp className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="w-3 h-3" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" aria-hidden="true" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  className="border-b border-border hover:bg-canvas"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`py-2 px-2 overflow-hidden ${
                        c.align === "right"
                          ? "text-right tabular-nums whitespace-nowrap"
                          : "text-left"
                      } ${c.secondary ? "hidden md:table-cell" : ""}`}
                    >
                      {c.render(row, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {pageSize && sorted.length > pageSize && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="tap-target mt-3 text-sm text-primary hover:underline font-semibold"
        >
          {expanded ? "Ver menos" : `Ver todo (${sorted.length})`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart tooltip
// ---------------------------------------------------------------------------

/** One series entry as Recharts hands it to a custom tooltip. */
interface TooltipEntry {
  name?: string;
  // Every series in these reports plots a number.
  value: number;
  dataKey?: string | number;
  color?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format?: (value: number, dataKey?: TooltipEntry["dataKey"]) => string;
  nameKey?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  format,
  nameKey,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  // The row a tooltip describes is an untyped chart datum, so the heading is
  // only used when it turns out to be something printable.
  const named = nameKey ? payload[0]?.payload?.[nameKey] : undefined;
  const heading =
    typeof named === "string" || typeof named === "number" ? named : label;
  return (
    <div className="bg-white border border-border rounded-lg px-2.5 py-2 shadow-raised text-meta max-w-[220px]">
      {heading != null && (
        <p className="font-medium text-foreground mb-1 truncate">{heading}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          <Swatch color={entry.color ?? entry.fill ?? SERIES[0]} />
          <span>{entry.name}</span>
          <span className="ml-auto font-medium text-foreground tabular-nums">
            {format ? format(entry.value, entry.dataKey) : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export const AXIS_TICK = { fontSize: 12, fill: INK.muted } as const;
