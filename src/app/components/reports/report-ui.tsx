// Shared building blocks for the reports dashboard: the palette, stat tiles,
// section cards and the sortable table every panel reuses.
//
// The categorical palette below is validated for colour-vision deficiency on a
// white surface (adjacent-pair ΔE 9.1 protan, normal-vision floor 19.6). Three
// of the slots sit under 3:1 contrast against white, so every chart that uses
// them also ships a legend, a tooltip and a table or direct labels - colour is
// never the only way to read a value.

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

/** Categorical slots. Assign in order and never cycle past the last one. */
export const SERIES = [
  "#2a78d6", // blue
  "#008300", // green
  "#e87ba4", // magenta
  "#eda100", // yellow
  "#1baf7a", // aqua
  "#eb6834", // orange
] as const;

/** Reserved for state, never for identity. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const INK = {
  primary: "#111827",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e5e7eb",
  axis: "#c3c2b7",
  successText: "#006300",
  dangerText: "#b42318",
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
      className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 md:px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="min-w-0">
          <h3 className="font-medium text-gray-900 text-sm md:text-base flex items-center gap-2">
            {icon}
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] md:text-xs text-gray-500 mt-0.5">{subtitle}</p>
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
    <p className="text-xs text-gray-500 py-6 text-center">{children}</p>
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
      <span className="inline-flex items-center gap-1 text-meta text-gray-500">
        <Minus className="w-3 h-3" />
        sin base
      </span>
    );
  }
  const flat = Math.abs(value) < 0.5;
  const good = higherIsBetter ? value > 0 : value < 0;
  const color = flat
    ? "text-gray-500"
    : good
      ? "text-green-700"
      : "text-red-700";
  const Icon = flat ? Minus : value > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-meta font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(value >= 100 ? 0 : 1)}
      {suffix}
      {label && <span className="text-gray-500 font-normal ml-0.5">{label}</span>}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  delta,
  higherIsBetter = true,
  icon,
  tone = "default",
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  higherIsBetter?: boolean;
  icon?: ReactNode;
  tone?: "default" | "good" | "warning" | "critical";
  onClick?: () => void;
}) {
  const valueColor =
    tone === "good"
      ? "text-green-700"
      : tone === "critical"
        ? "text-red-700"
        : tone === "warning"
          ? "text-amber-700"
          : "text-gray-900";
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4 text-left w-full ${
        onClick ? "hover:border-gray-300 transition-colors cursor-pointer" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-meta text-gray-500 leading-tight">{label}</p>
        {icon}
      </div>
      <p className={`text-lg md:text-2xl font-semibold truncate ${valueColor}`}>
        {value}
      </p>
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        {delta !== undefined && (
          <DeltaBadge value={delta} higherIsBetter={higherIsBetter} />
        )}
        {hint && <span className="text-meta text-gray-500">{hint}</span>}
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
    <div className="inline-flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`${
            size === "xs" ? "text-meta px-2 py-1" : "text-xs px-2.5 py-1"
          } rounded-md font-medium transition-colors whitespace-nowrap ${
            value === o.value
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
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
        <li key={e.label} className="flex items-center gap-1.5 text-[11px] text-gray-600">
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
  track = "#eef2f6",
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
          <span className="text-[11px] font-mono text-gray-500 flex-shrink-0 w-5 tabular-nums">
            #{index}
          </span>
          <span className="text-xs md:text-sm font-medium text-gray-900 truncate">
            {name}
          </span>
        </div>
        <div className="text-right flex-shrink-0">
          <span
            className={`text-xs md:text-sm font-semibold tabular-nums ${
              valueTone === "good"
                ? "text-green-700"
                : valueTone === "bad"
                  ? "text-red-700"
                  : "text-gray-900"
            }`}
          >
            {value}
          </span>
          {sub && <span className="text-meta text-gray-500 ml-1.5">{sub}</span>}
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
      <div className="overflow-x-auto -mx-4 md:-mx-5 px-4 md:px-5">
        <div style={{ maxHeight, overflowY: "auto" }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`py-2 px-2 font-medium text-gray-500 whitespace-nowrap ${
                      c.align === "right" ? "text-right" : "text-left"
                    } ${c.secondary ? "hidden md:table-cell" : ""} ${
                      c.sortValue ? "cursor-pointer select-none hover:text-gray-800" : ""
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
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
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
                  className="border-b border-gray-50 hover:bg-gray-50/70"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`py-2 px-2 ${
                        c.align === "right"
                          ? "text-right tabular-nums"
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
          className="mt-3 text-xs text-primary hover:underline font-medium"
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

export function ChartTooltip({
  active,
  payload,
  label,
  format,
  nameKey,
}: any) {
  if (!active || !payload?.length) return null;
  const heading = payload[0]?.payload?.[nameKey] ?? label;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-2 shadow-lg text-[11px] max-w-[220px]">
      {heading != null && (
        <p className="font-medium text-gray-800 mb-1 truncate">{heading}</p>
      )}
      {payload.map((entry: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5 text-gray-600">
          <Swatch color={entry.color || entry.fill || SERIES[0]} />
          <span>{entry.name}</span>
          <span className="ml-auto font-medium text-gray-900 tabular-nums">
            {format ? format(entry.value, entry.dataKey) : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export const AXIS_TICK = { fontSize: 10, fill: INK.muted } as const;
