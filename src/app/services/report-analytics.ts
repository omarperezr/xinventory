// Analytics engine behind the reports dashboard.
//
// Everything here is pure: it takes the loaded sales history plus the live
// catalogue and returns view models. No React, no formatting, no currency
// conversion - every figure stays in USD (the canonical currency) and the UI
// converts at render time.
//
// Two data sources with different meanings are combined on purpose:
//   - transactions -> what was sold (the past)
//   - items        -> what is in stock right now (the present)
// Crossing them is what makes the forward-looking reports possible: sales
// velocity from the first, remaining stock from the second.

import type { InventoryItem } from "../context/app-context";
import type { Transaction, TransactionItem } from "../context/history-context";

export const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

export type PeriodKey = "today" | "7d" | "30d" | "90d" | "365d" | "all" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  /** Whole days covered, at least 1. Used for per-day rates and forecasting. */
  days: number;
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string; short: string }[] = [
  { key: "today", label: "Hoy", short: "Hoy" },
  { key: "7d", label: "Últimos 7 días", short: "7d" },
  { key: "30d", label: "Últimos 30 días", short: "30d" },
  { key: "90d", label: "Últimos 90 días", short: "90d" },
  { key: "365d", label: "Último año", short: "1a" },
  { key: "all", label: "Todo el historial", short: "Todo" },
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export function resolveRange(
  key: PeriodKey,
  transactions: Transaction[],
  custom?: { from: string; to: string },
): DateRange {
  const now = new Date();
  const to = endOfDay(now);

  if (key === "custom" && custom?.from) {
    const from = startOfDay(new Date(`${custom.from}T00:00:00`));
    const customTo = custom.to ? endOfDay(new Date(`${custom.to}T00:00:00`)) : to;
    return withDays(from, customTo);
  }

  if (key === "all") {
    // Oldest loaded sale, so "todo" means the whole window we can actually see.
    let oldest = now.getTime();
    for (const t of transactions) {
      const ts = new Date(t.date).getTime();
      if (Number.isFinite(ts) && ts < oldest) oldest = ts;
    }
    return withDays(startOfDay(new Date(oldest)), to);
  }

  const spans: Record<Exclude<PeriodKey, "all" | "custom">, number> = {
    today: 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "365d": 365,
  };
  const span = spans[key as Exclude<PeriodKey, "all" | "custom">] ?? 30;
  const from = startOfDay(new Date(now.getTime() - (span - 1) * MS_PER_DAY));
  return withDays(from, to);
}

function withDays(from: Date, to: Date): DateRange {
  const days = Math.max(
    1,
    Math.round((endOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY),
  );
  return { from, to, days };
}

/** The equally long window immediately before `range`, for period-over-period. */
export function previousRange(range: DateRange): DateRange {
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(range.from.getTime() - range.days * MS_PER_DAY);
  return { from, to, days: range.days };
}

// ---------------------------------------------------------------------------
// Catalogue + sale lines
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  id: string;
  name: string;
  listPrice: number;
  buyingPrice: number;
  type: string;
  brand: string;
  quantity: number;
  unit: string;
}

export const UNCATEGORIZED = "SIN CATEGORÍA";
export const UNKNOWN_BRAND = "SIN MARCA";

export function buildCatalog(items: InventoryItem[]): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const i of items) {
    map.set(i.id, {
      id: i.id,
      name: i.name,
      listPrice: i.sellingPrice,
      buyingPrice: i.buyingPrice,
      type: i.type?.trim() || UNCATEGORIZED,
      brand: i.brand?.trim() || UNKNOWN_BRAND,
      quantity: i.quantity,
      unit: i.unit,
    });
  }
  return map;
}

/** Unit price actually charged on a line, after its own discount. */
function effectiveUnitPrice(item: TransactionItem): number {
  if (item.applyDiscount && item.discount > 0) {
    return item.sellingPrice * (1 - item.discount / 100);
  }
  return item.sellingPrice;
}

export interface SaleLine {
  txId: string;
  date: Date;
  seller: string;
  itemId: string;
  name: string;
  type: string;
  brand: string;
  unitPrice: number;
  /** Catalogue price today. Falls back to the charged price for deleted items. */
  listPrice: number;
  unitCost: number;
  soldQty: number;
  returnedQty: number;
  netQty: number;
  revenue: number;
  cost: number;
  profit: number;
  /** Revenue given up against the list price (negative when sold above list). */
  discountGiven: number;
}

function inRange(date: Date, range: DateRange): boolean {
  const t = date.getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

export function transactionsInRange(
  transactions: Transaction[],
  range: DateRange,
): Transaction[] {
  return transactions.filter((t) => {
    const d = new Date(t.date);
    return !Number.isNaN(d.getTime()) && inRange(d, range);
  });
}

export function buildLines(
  transactions: Transaction[],
  catalog: Map<string, CatalogEntry>,
): SaleLine[] {
  const lines: SaleLine[] = [];
  for (const t of transactions) {
    const date = new Date(t.date);
    if (Number.isNaN(date.getTime())) continue;
    for (const item of t.items) {
      const cat = catalog.get(item.id);
      const netQty = item.cartQuantity - (item.quantityReturned || 0);
      const unitPrice = effectiveUnitPrice(item);
      // Prefer the cost snapshotted at sale time; sales predating that column
      // carry 0, so fall back to the catalogue rather than reporting a false
      // 100% margin.
      const unitCost =
        item.buyingPrice > 0 ? item.buyingPrice : (cat?.buyingPrice ?? 0);
      const listPrice = cat?.listPrice && cat.listPrice > 0 ? cat.listPrice : unitPrice;
      lines.push({
        txId: t.id,
        date,
        seller: t.userId || "—",
        itemId: item.id,
        name: item.name,
        type: cat?.type ?? UNCATEGORIZED,
        brand: cat?.brand ?? UNKNOWN_BRAND,
        unitPrice,
        listPrice,
        unitCost,
        soldQty: item.cartQuantity,
        returnedQty: item.quantityReturned || 0,
        netQty,
        revenue: unitPrice * netQty,
        cost: unitCost * netQty,
        profit: (unitPrice - unitCost) * netQty,
        discountGiven: (listPrice - unitPrice) * netQty,
      });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Headline metrics
// ---------------------------------------------------------------------------

export interface PeriodMetrics {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  transactions: number;
  units: number;
  avgTicket: number;
  unitsPerTicket: number;
  /** Days inside the range that actually had a sale. */
  activeDays: number;
  revenuePerDay: number;
  returnedUnits: number;
  returnedValue: number;
  returnRate: number;
  discountGiven: number;
  discountRate: number;
  tax: number;
}

export function computeMetrics(
  txs: Transaction[],
  lines: SaleLine[],
  days: number,
): PeriodMetrics {
  const revenue = txs.reduce((s, t) => s + t.total, 0);
  const tax = txs.reduce((s, t) => s + t.tax, 0);
  const cost = lines.reduce((s, l) => s + l.cost, 0);
  const units = lines.reduce((s, l) => s + Math.max(0, l.netQty), 0);
  const returnedUnits = lines.reduce((s, l) => s + l.returnedQty, 0);
  const returnedValue = lines.reduce((s, l) => s + l.returnedQty * l.unitPrice, 0);
  const grossValue = lines.reduce((s, l) => s + l.soldQty * l.unitPrice, 0);
  const discountGiven = lines.reduce((s, l) => s + l.discountGiven, 0);
  const listValue = lines.reduce((s, l) => s + l.listPrice * Math.max(0, l.netQty), 0);
  const profit = revenue - cost;

  const activeDayKeys = new Set(txs.map((t) => dayKey(new Date(t.date))));

  return {
    revenue,
    cost,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    transactions: txs.length,
    units,
    avgTicket: txs.length > 0 ? revenue / txs.length : 0,
    unitsPerTicket: txs.length > 0 ? units / txs.length : 0,
    activeDays: activeDayKeys.size,
    revenuePerDay: days > 0 ? revenue / days : 0,
    returnedUnits,
    returnedValue,
    returnRate: grossValue > 0 ? (returnedValue / grossValue) * 100 : 0,
    discountGiven,
    discountRate: listValue > 0 ? (discountGiven / listValue) * 100 : 0,
    tax,
  };
}

/** Percentage change, or null when the baseline is zero (no honest ratio). */
export function delta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export type Granularity = "day" | "week" | "month";

export function chooseGranularity(days: number): Granularity {
  if (days <= 45) return "day";
  if (days <= 300) return "week";
  return "month";
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function bucketStart(d: Date, g: Granularity): Date {
  const c = startOfDay(d);
  if (g === "week") {
    // Weeks start on Monday, which is how a shop reads its week.
    const dow = (c.getDay() + 6) % 7;
    c.setDate(c.getDate() - dow);
  } else if (g === "month") {
    c.setDate(1);
  }
  return c;
}

function advance(d: Date, g: Granularity): Date {
  const c = new Date(d);
  if (g === "day") c.setDate(c.getDate() + 1);
  else if (g === "week") c.setDate(c.getDate() + 7);
  else c.setMonth(c.getMonth() + 1);
  return c;
}

function bucketLabel(d: Date, g: Granularity): string {
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  if (g === "month") {
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${months[d.getMonth()]} ${`${d.getFullYear()}`.slice(2)}`;
  }
  return `${dd}/${mm}`;
}

export interface SeriesPoint {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  transactions: number;
  units: number;
}

/**
 * Buckets sales over the range. Empty buckets are emitted as zeros on purpose:
 * a day with no sales is information, and skipping it would make a flat month
 * look like a busy one.
 */
export function buildSeries(
  txs: Transaction[],
  lines: SaleLine[],
  range: DateRange,
  g: Granularity,
): SeriesPoint[] {
  const buckets = new Map<string, SeriesPoint>();
  let cursor = bucketStart(range.from, g);
  const end = range.to.getTime();
  // Guard against a pathological range producing an unbounded loop.
  for (let i = 0; cursor.getTime() <= end && i < 800; i++) {
    const key = dayKey(cursor);
    buckets.set(key, {
      key,
      label: bucketLabel(cursor, g),
      revenue: 0,
      cost: 0,
      profit: 0,
      transactions: 0,
      units: 0,
    });
    cursor = advance(cursor, g);
  }

  for (const t of txs) {
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    const b = buckets.get(dayKey(bucketStart(d, g)));
    if (!b) continue;
    b.revenue += t.total;
    b.transactions += 1;
  }
  for (const l of lines) {
    const b = buckets.get(dayKey(bucketStart(l.date, g)));
    if (!b) continue;
    b.cost += l.cost;
    b.units += Math.max(0, l.netQty);
  }
  for (const b of buckets.values()) b.profit = b.revenue - b.cost;

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export interface WeekdayPoint {
  label: string;
  revenue: number;
  transactions: number;
  /** How many times this weekday occurred in the range. */
  occurrences: number;
  /** Revenue per occurrence - the comparable figure, not the raw sum. */
  avgRevenue: number;
}

export function weekdayProfile(txs: Transaction[], range: DateRange): WeekdayPoint[] {
  const points: WeekdayPoint[] = WEEKDAYS.map((label) => ({
    label,
    revenue: 0,
    transactions: 0,
    occurrences: 0,
    avgRevenue: 0,
  }));

  // Count occurrences over the range so a 10-day window does not make Monday
  // look twice as good as Tuesday simply because it came around twice.
  let cursor = startOfDay(range.from);
  for (let i = 0; cursor.getTime() <= range.to.getTime() && i < 800; i++) {
    points[(cursor.getDay() + 6) % 7].occurrences += 1;
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }

  for (const t of txs) {
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    const p = points[(d.getDay() + 6) % 7];
    p.revenue += t.total;
    p.transactions += 1;
  }
  for (const p of points) {
    p.avgRevenue = p.occurrences > 0 ? p.revenue / p.occurrences : 0;
  }
  return points;
}

export interface HourPoint {
  hour: number;
  label: string;
  revenue: number;
  transactions: number;
}

export function hourProfile(txs: Transaction[]): HourPoint[] {
  const points: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${`${hour}`.padStart(2, "0")}h`,
    revenue: 0,
    transactions: 0,
  }));
  for (const t of txs) {
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    points[d.getHours()].revenue += t.total;
    points[d.getHours()].transactions += 1;
  }
  return points;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type AbcClass = "A" | "B" | "C";

export interface ProductStat {
  itemId: string;
  name: string;
  type: string;
  brand: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  avgPrice: number;
  listPrice: number;
  /** Average charged / list price. Below 100% means discounting. */
  priceRealization: number;
  discountGiven: number;
  returnedUnits: number;
  returnRate: number;
  ticketCount: number;
  lastSold: Date | null;
  revenueShare: number;
  /** Running share of total profit, for the Pareto curve. */
  cumulativeProfitShare: number;
  abc: AbcClass;
  /** Units sold per day over the analysed range. */
  velocity: number;
  inStock: number;
  /** null when the item no longer exists in the catalogue. */
  inCatalog: boolean;
}

export function productStats(
  lines: SaleLine[],
  catalog: Map<string, CatalogEntry>,
  days: number,
): ProductStat[] {
  const acc = new Map<string, ProductStat & { txIds: Set<string>; grossValue: number }>();

  for (const l of lines) {
    let p = acc.get(l.itemId);
    if (!p) {
      const cat = catalog.get(l.itemId);
      p = {
        itemId: l.itemId,
        name: l.name,
        type: l.type,
        brand: l.brand,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        avgPrice: 0,
        listPrice: l.listPrice,
        priceRealization: 0,
        discountGiven: 0,
        returnedUnits: 0,
        returnRate: 0,
        ticketCount: 0,
        lastSold: null,
        revenueShare: 0,
        cumulativeProfitShare: 0,
        abc: "C",
        velocity: 0,
        inStock: cat?.quantity ?? 0,
        inCatalog: !!cat,
        txIds: new Set<string>(),
        grossValue: 0,
      };
      acc.set(l.itemId, p);
    }
    p.units += Math.max(0, l.netQty);
    p.revenue += l.revenue;
    p.cost += l.cost;
    p.profit += l.profit;
    p.discountGiven += l.discountGiven;
    p.returnedUnits += l.returnedQty;
    p.grossValue += l.soldQty * l.unitPrice;
    p.txIds.add(l.txId);
    if (!p.lastSold || l.date > p.lastSold) p.lastSold = l.date;
  }

  const list = [...acc.values()].map((p) => {
    const { txIds, grossValue, ...rest } = p;
    const avgPrice = p.units > 0 ? p.revenue / p.units : 0;
    return {
      ...rest,
      ticketCount: txIds.size,
      avgPrice,
      margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      priceRealization: p.listPrice > 0 ? (avgPrice / p.listPrice) * 100 : 100,
      returnRate: grossValue > 0 ? (p.returnedUnits * avgPrice) / grossValue * 100 : 0,
      velocity: days > 0 ? p.units / days : 0,
    };
  });

  const totalRevenue = list.reduce((s, p) => s + p.revenue, 0);
  for (const p of list) {
    p.revenueShare = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
  }

  // ABC by profit contribution (Pareto). When nothing was profitable, fall back
  // to revenue so the classification still says something useful.
  const positiveProfit = list.reduce((s, p) => s + Math.max(0, p.profit), 0);
  const useProfit = positiveProfit > 0;
  const ranked = [...list].sort((a, b) =>
    useProfit ? b.profit - a.profit : b.revenue - a.revenue,
  );
  const denom = useProfit ? positiveProfit : totalRevenue;
  let running = 0;
  for (const p of ranked) {
    if (denom <= 0) {
      // Nothing was sold for money in this window (e.g. everything was
      // returned). Calling all of it "class A" would be nonsense.
      p.cumulativeProfitShare = 0;
      p.abc = "C";
      continue;
    }
    running += useProfit ? Math.max(0, p.profit) : p.revenue;
    p.cumulativeProfitShare = (running / denom) * 100;
    p.abc =
      p.cumulativeProfitShare <= 80 ? "A" : p.cumulativeProfitShare <= 95 ? "B" : "C";
  }

  return ranked;
}

export interface GroupStat {
  key: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  share: number;
  products: number;
}

export function groupLines(
  lines: SaleLine[],
  by: (l: SaleLine) => string,
): GroupStat[] {
  const acc = new Map<string, GroupStat & { ids: Set<string> }>();
  for (const l of lines) {
    const key = by(l);
    let g = acc.get(key);
    if (!g) {
      g = {
        key,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        share: 0,
        products: 0,
        ids: new Set<string>(),
      };
      acc.set(key, g);
    }
    g.units += Math.max(0, l.netQty);
    g.revenue += l.revenue;
    g.cost += l.cost;
    g.profit += l.profit;
    g.ids.add(l.itemId);
  }
  const total = [...acc.values()].reduce((s, g) => s + g.revenue, 0);
  return [...acc.values()]
    .map(({ ids, ...g }) => ({
      ...g,
      products: ids.size,
      margin: g.revenue > 0 ? (g.profit / g.revenue) * 100 : 0,
      share: total > 0 ? (g.revenue / total) * 100 : 0,
    }))
    // A group left with nothing after returns is noise in a breakdown chart.
    .filter((g) => g.units > 0 || g.revenue !== 0)
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Sellers and payments
// ---------------------------------------------------------------------------

export interface SellerStat {
  seller: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  transactions: number;
  units: number;
  avgTicket: number;
  unitsPerTicket: number;
  discountGiven: number;
  share: number;
}

export function sellerStats(txs: Transaction[], lines: SaleLine[]): SellerStat[] {
  const acc = new Map<string, SellerStat>();
  const ensure = (seller: string) => {
    let s = acc.get(seller);
    if (!s) {
      s = {
        seller,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        transactions: 0,
        units: 0,
        avgTicket: 0,
        unitsPerTicket: 0,
        discountGiven: 0,
        share: 0,
      };
      acc.set(seller, s);
    }
    return s;
  };

  for (const t of txs) {
    const s = ensure(t.userId || "—");
    s.revenue += t.total;
    s.transactions += 1;
  }
  for (const l of lines) {
    const s = ensure(l.seller);
    s.cost += l.cost;
    s.units += Math.max(0, l.netQty);
    s.discountGiven += l.discountGiven;
  }

  const total = [...acc.values()].reduce((sum, s) => sum + s.revenue, 0);
  return [...acc.values()]
    .map((s) => ({
      ...s,
      profit: s.revenue - s.cost,
      margin: s.revenue > 0 ? ((s.revenue - s.cost) / s.revenue) * 100 : 0,
      avgTicket: s.transactions > 0 ? s.revenue / s.transactions : 0,
      unitsPerTicket: s.transactions > 0 ? s.units / s.transactions : 0,
      share: total > 0 ? (s.revenue / total) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface PaymentStat {
  method: string;
  /** Revenue attributed to this method (see note below). */
  total: number;
  transactions: number;
  share: number;
  avgTicket: number;
}

/**
 * Payment mix.
 *
 * Recorded payment amounts routinely exceed the sale total, because a cash
 * payment is entered as the note handed over and the change is given back.
 * Summing them raw overstates income - one sale of $50 shows as $62 here.
 * So each transaction's own total is split across its methods in proportion to
 * what was tendered, which keeps the mix honest and the total equal to revenue.
 */
export interface PaymentCoverage {
  /** Revenue that could be tied to a payment method. */
  attributed: number;
  /** Revenue from sales that recorded no payment at all. */
  unrecorded: number;
  unrecordedTransactions: number;
}

/**
 * How much of the period's revenue the payment mix actually explains. Sales
 * closed without registering a payment are common in older history, and
 * without this the mix silently looks like the whole story.
 */
export function paymentCoverage(txs: Transaction[]): PaymentCoverage {
  let attributed = 0;
  let unrecorded = 0;
  let unrecordedTransactions = 0;
  for (const t of txs) {
    const tendered = (t.payments || []).reduce(
      (s, p) => s + (Number.isFinite(p?.amount) && p.amount > 0 ? p.amount : 0),
      0,
    );
    if (tendered > 0) {
      attributed += t.total;
    } else {
      unrecorded += t.total;
      unrecordedTransactions += 1;
    }
  }
  return { attributed, unrecorded, unrecordedTransactions };
}

export function paymentStats(txs: Transaction[]): PaymentStat[] {
  const acc = new Map<string, { total: number; txs: number }>();
  for (const t of txs) {
    const payments = (t.payments || []).filter(
      (p) => p && typeof p.amount === "number" && Number.isFinite(p.amount) && p.amount > 0,
    );
    const tendered = payments.reduce((s, p) => s + p.amount, 0);
    if (tendered <= 0) continue;
    const seen = new Set<string>();
    for (const p of payments) {
      const method = p.method || "Otro";
      const cur = acc.get(method) || { total: 0, txs: 0 };
      cur.total += (p.amount / tendered) * t.total;
      if (!seen.has(method)) {
        cur.txs += 1;
        seen.add(method);
      }
      acc.set(method, cur);
    }
  }
  const total = [...acc.values()].reduce((s, v) => s + v.total, 0);
  return [...acc.entries()]
    .map(([method, v]) => ({
      method,
      total: v.total,
      transactions: v.txs,
      share: total > 0 ? (v.total / total) * 100 : 0,
      avgTicket: v.txs > 0 ? v.total / v.txs : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Inventory (the present) and reordering (the future)
// ---------------------------------------------------------------------------

export interface StockRow {
  id: string;
  name: string;
  type: string;
  brand: string;
  quantity: number;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
  margin: number;
  /** Units sold per day in the analysed range. */
  velocity: number;
  unitsSold: number;
  /** Days until the shelf empties at the current pace. Infinity when idle. */
  daysOfStock: number;
  daysSinceLastSale: number | null;
  lastSold: Date | null;
  revenue: number;
  profit: number;
}

export interface InventoryReport {
  rows: StockRow[];
  skus: number;
  units: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
  /** COGS in the range divided by stock at cost - how often stock turns over. */
  turnover: number;
  daysOfInventory: number;
  sellThrough: number;
  outOfStock: StockRow[];
  /** Out of stock but selling: every day closed is money not taken. */
  lostSales: StockRow[];
  urgent: StockRow[];
  deadStock: StockRow[];
  neverSold: StockRow[];
  healthy: number;
}

export interface InventoryOptions {
  /** Below this many days of cover an item counts as urgent. */
  urgentDays: number;
  /** No sale in this many days, with stock on hand, counts as dead capital. */
  deadDays: number;
}

export const DEFAULT_INVENTORY_OPTIONS: InventoryOptions = {
  urgentDays: 7,
  deadDays: 60,
};

export function inventoryReport(
  items: InventoryItem[],
  products: Map<string, ProductStat>,
  lastSoldById: Map<string, Date>,
  range: DateRange,
  cogs: number,
  options: InventoryOptions = DEFAULT_INVENTORY_OPTIONS,
): InventoryReport {
  const now = Date.now();
  const rows: StockRow[] = items.map((i) => {
    const p = products.get(i.id);
    const velocity = p?.velocity ?? 0;
    const lastSold = lastSoldById.get(i.id) ?? null;
    const costValue = i.buyingPrice * i.quantity;
    const retailValue = i.sellingPrice * i.quantity;
    return {
      id: i.id,
      name: i.name,
      type: i.type?.trim() || UNCATEGORIZED,
      brand: i.brand?.trim() || UNKNOWN_BRAND,
      quantity: i.quantity,
      unit: i.unit,
      buyingPrice: i.buyingPrice,
      sellingPrice: i.sellingPrice,
      costValue,
      retailValue,
      potentialProfit: retailValue - costValue,
      margin: retailValue > 0 ? ((retailValue - costValue) / retailValue) * 100 : 0,
      velocity,
      unitsSold: p?.units ?? 0,
      daysOfStock: velocity > 0 ? i.quantity / velocity : Infinity,
      daysSinceLastSale: lastSold
        ? Math.floor((now - lastSold.getTime()) / MS_PER_DAY)
        : null,
      lastSold,
      revenue: p?.revenue ?? 0,
      profit: p?.profit ?? 0,
    };
  });

  const costValue = rows.reduce((s, r) => s + r.costValue, 0);
  const retailValue = rows.reduce((s, r) => s + r.retailValue, 0);
  const unitsSold = rows.reduce((s, r) => s + r.unitsSold, 0);
  const unitsOnHand = rows.reduce((s, r) => s + r.quantity, 0);

  const outOfStock = rows.filter((r) => r.quantity <= 0);
  const lostSales = outOfStock
    .filter((r) => r.velocity > 0)
    .sort((a, b) => b.velocity * b.sellingPrice - a.velocity * a.sellingPrice);
  const urgent = rows
    .filter((r) => r.quantity > 0 && r.daysOfStock <= options.urgentDays)
    .sort((a, b) => a.daysOfStock - b.daysOfStock);
  const deadStock = rows
    .filter(
      (r) =>
        r.quantity > 0 &&
        r.lastSold !== null &&
        (r.daysSinceLastSale ?? 0) >= options.deadDays,
    )
    .sort((a, b) => b.costValue - a.costValue);
  const neverSold = rows
    .filter((r) => r.quantity > 0 && r.lastSold === null)
    .sort((a, b) => b.costValue - a.costValue);

  const flagged = new Set([
    ...outOfStock.map((r) => r.id),
    ...urgent.map((r) => r.id),
    ...deadStock.map((r) => r.id),
    ...neverSold.map((r) => r.id),
  ]);

  const daysPerTurn = costValue > 0 && cogs > 0 ? (costValue / cogs) * range.days : Infinity;

  return {
    rows,
    skus: rows.length,
    units: unitsOnHand,
    costValue,
    retailValue,
    potentialProfit: retailValue - costValue,
    turnover: costValue > 0 ? cogs / costValue : 0,
    daysOfInventory: daysPerTurn,
    sellThrough:
      unitsSold + unitsOnHand > 0 ? (unitsSold / (unitsSold + unitsOnHand)) * 100 : 0,
    outOfStock,
    lostSales,
    urgent,
    deadStock,
    neverSold,
    healthy: rows.filter((r) => !flagged.has(r.id)).length,
  };
}

export interface ReorderRow {
  id: string;
  name: string;
  quantity: number;
  velocity: number;
  daysOfStock: number;
  suggestedQty: number;
  purchaseCost: number;
  expectedRevenue: number;
  expectedProfit: number;
  stockoutDate: Date | null;
}

/** What to buy so nothing runs out within `coverDays`. */
export function reorderPlan(
  rows: StockRow[],
  coverDays: number,
): { rows: ReorderRow[]; totalCost: number; expectedProfit: number } {
  const now = Date.now();
  const plan = rows
    .filter((r) => r.velocity > 0)
    .map((r) => {
      const target = Math.ceil(r.velocity * coverDays);
      const suggestedQty = Math.max(0, target - r.quantity);
      return {
        id: r.id,
        name: r.name,
        quantity: r.quantity,
        velocity: r.velocity,
        daysOfStock: r.daysOfStock,
        suggestedQty,
        purchaseCost: suggestedQty * r.buyingPrice,
        expectedRevenue: suggestedQty * r.sellingPrice,
        expectedProfit: suggestedQty * (r.sellingPrice - r.buyingPrice),
        stockoutDate:
          Number.isFinite(r.daysOfStock) && r.quantity > 0
            ? new Date(now + r.daysOfStock * MS_PER_DAY)
            : r.quantity <= 0
              ? new Date(now)
              : null,
      };
    })
    .filter((r) => r.suggestedQty > 0)
    .sort((a, b) => a.daysOfStock - b.daysOfStock);

  return {
    rows: plan,
    totalCost: plan.reduce((s, r) => s + r.purchaseCost, 0),
    expectedProfit: plan.reduce((s, r) => s + r.expectedProfit, 0),
  };
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface Forecast {
  /** Points continuing the observed series, one per bucket. */
  points: { label: string; revenue: number }[];
  next7: number;
  next30: number;
  expectedProfit30: number;
  /** Change per day implied by the fitted line. */
  slopePerDay: number;
  /** Straight average of the observed daily revenue. */
  baselinePerDay: number;
  /** How well the line fits (0-1). Below ~0.3 the trend is noise. */
  fit: number;
  method: "trend" | "average";
  /** Buckets the fit was computed on. Too few and we say so. */
  sampleSize: number;
}

/**
 * Least-squares fit over the daily revenue series, used to project forward.
 *
 * Deliberately simple, and reported as such in the UI: with a few weeks of a
 * small shop's sales, anything more elaborate would dress up noise as insight.
 * When the fit is weak we fall back to the flat average instead of extending a
 * trend the data does not support.
 */
export function forecast(
  series: SeriesPoint[],
  margin: number,
  horizonBuckets = 14,
): Forecast {
  const values = series.map((p) => p.revenue);
  const n = values.length;
  const baselinePerDay = n > 0 ? values.reduce((s, v) => s + v, 0) / n : 0;

  if (n < 7) {
    return {
      points: Array.from({ length: horizonBuckets }, (_, i) => ({
        label: `+${i + 1}`,
        revenue: baselinePerDay,
      })),
      next7: baselinePerDay * 7,
      next30: baselinePerDay * 30,
      expectedProfit30: baselinePerDay * 30 * (margin / 100),
      slopePerDay: 0,
      baselinePerDay,
      fit: 0,
      method: "average",
      sampleSize: n,
    };
  }

  const meanX = (n - 1) / 2;
  const meanY = baselinePerDay;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    const dy = values[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  const fit = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;

  // A weak fit means the "trend" is noise; project the flat average instead.
  const useTrend = fit >= 0.25;
  const predict = (i: number) =>
    Math.max(0, useTrend ? intercept + slope * i : baselinePerDay);

  const points = Array.from({ length: horizonBuckets }, (_, k) => ({
    label: `+${k + 1}`,
    revenue: predict(n + k),
  }));

  const sumAhead = (days: number) => {
    let total = 0;
    for (let k = 0; k < days; k++) total += predict(n + k);
    return total;
  };

  const next7 = sumAhead(7);
  const next30 = sumAhead(30);

  return {
    points,
    next7,
    next30,
    expectedProfit30: next30 * (margin / 100),
    slopePerDay: useTrend ? slope : 0,
    baselinePerDay,
    fit,
    method: useTrend ? "trend" : "average",
    sampleSize: n,
  };
}

// ---------------------------------------------------------------------------
// Action list
// ---------------------------------------------------------------------------

export type AlertLevel = "critical" | "warning" | "info" | "good";

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  /** Monetary weight in USD, used to rank alerts against each other. */
  impact: number;
  items?: string[];
}

export function buildAlerts(
  metrics: PeriodMetrics,
  previous: PeriodMetrics,
  products: ProductStat[],
  inventory: InventoryReport,
  range: DateRange,
): Alert[] {
  const alerts: Alert[] = [];

  if (inventory.lostSales.length > 0) {
    const perDay = inventory.lostSales.reduce(
      (s, r) => s + r.velocity * r.sellingPrice,
      0,
    );
    alerts.push({
      id: "stockout",
      level: "critical",
      title: `${inventory.lostSales.length} producto(s) que sí se venden están agotados`,
      detail: `Al ritmo actual dejas de facturar cerca de ${perDay.toFixed(2)} USD por día mientras no repongas.`,
      impact: perDay * 30,
      items: inventory.lostSales.slice(0, 6).map((r) => r.name),
    });
  }

  const belowCost = products.filter((p) => p.units > 0 && p.profit < 0);
  if (belowCost.length > 0) {
    const loss = belowCost.reduce((s, p) => s + p.profit, 0);
    alerts.push({
      id: "below-cost",
      level: "critical",
      title: `${belowCost.length} producto(s) se vendieron por debajo del costo`,
      detail: `Pérdida acumulada de ${Math.abs(loss).toFixed(2)} USD en el período. Revisa el precio de venta o el costo registrado.`,
      impact: Math.abs(loss),
      items: belowCost.slice(0, 6).map((p) => p.name),
    });
  }

  if (inventory.urgent.length > 0) {
    alerts.push({
      id: "urgent-stock",
      level: "warning",
      title: `${inventory.urgent.length} producto(s) se agotan en menos de 7 días`,
      detail: `El más urgente es ${inventory.urgent[0].name}, con ${inventory.urgent[0].quantity} en stock (${inventory.urgent[0].daysOfStock.toFixed(1)} días de cobertura).`,
      impact: inventory.urgent.reduce((s, r) => s + r.velocity * r.sellingPrice * 30, 0),
      items: inventory.urgent.slice(0, 6).map((r) => r.name),
    });
  }

  const returned = products
    .filter((p) => p.returnedUnits >= 2 && p.returnRate >= 15)
    .sort((a, b) => b.returnRate - a.returnRate);
  if (returned.length > 0) {
    alerts.push({
      id: "returns",
      level: "warning",
      title: `${returned.length} producto(s) con devoluciones altas`,
      detail: `${returned[0].name} tiene ${returned[0].returnRate.toFixed(0)}% de devoluciones. Puede ser un problema de calidad, talla o expectativa.`,
      impact: returned.reduce((s, p) => s + p.returnedUnits * p.avgPrice, 0),
      items: returned.slice(0, 6).map((p) => p.name),
    });
  }

  const deadValue = inventory.deadStock.reduce((s, r) => s + r.costValue, 0);
  if (deadValue > 0) {
    alerts.push({
      id: "dead-stock",
      level: "warning",
      title: `${deadValue.toFixed(2)} USD inmovilizados en inventario sin rotación`,
      detail: `${inventory.deadStock.length} producto(s) con stock y sin ventas en más de ${DEFAULT_INVENTORY_OPTIONS.deadDays} días. Considera promoción o liquidación.`,
      impact: deadValue,
      items: inventory.deadStock.slice(0, 6).map((r) => r.name),
    });
  }

  const discounted = products
    .filter((p) => p.revenue > 0 && p.priceRealization < 90 && p.discountGiven > 0)
    .sort((a, b) => b.discountGiven - a.discountGiven);
  if (discounted.length > 0 && metrics.discountGiven > 0) {
    alerts.push({
      id: "discounting",
      level: "warning",
      title: `${metrics.discountGiven.toFixed(2)} USD entregados en descuentos`,
      detail: `Equivale al ${metrics.discountRate.toFixed(1)}% del valor de lista. El mayor descuento está en ${discounted[0].name} (se vende al ${discounted[0].priceRealization.toFixed(0)}% del precio de lista).`,
      impact: metrics.discountGiven,
      items: discounted.slice(0, 6).map((p) => p.name),
    });
  }

  if (inventory.neverSold.length > 0) {
    const value = inventory.neverSold.reduce((s, r) => s + r.costValue, 0);
    alerts.push({
      id: "never-sold",
      level: "info",
      title: `${inventory.neverSold.length} producto(s) nunca se han vendido`,
      detail: `Representan ${value.toFixed(2)} USD al costo dentro del historial cargado.`,
      impact: value,
      items: inventory.neverSold.slice(0, 6).map((r) => r.name),
    });
  }

  const revenueDelta = delta(metrics.revenue, previous.revenue);
  if (revenueDelta !== null && Math.abs(revenueDelta) >= 5) {
    const up = revenueDelta > 0;
    alerts.push({
      id: "trend",
      level: up ? "good" : "warning",
      title: `Los ingresos ${up ? "subieron" : "bajaron"} ${Math.abs(revenueDelta).toFixed(0)}% frente al período anterior`,
      detail: `${metrics.revenue.toFixed(2)} USD en los últimos ${range.days} días, contra ${previous.revenue.toFixed(2)} USD del período previo.`,
      impact: Math.abs(metrics.revenue - previous.revenue),
    });
  }

  const marginDrop = metrics.margin - previous.margin;
  if (previous.transactions > 0 && marginDrop <= -5) {
    alerts.push({
      id: "margin",
      level: "warning",
      title: `El margen cayó ${Math.abs(marginDrop).toFixed(1)} puntos`,
      detail: `Pasó de ${previous.margin.toFixed(1)}% a ${metrics.margin.toFixed(1)}%. Suele venir de descuentos o de un cambio en la mezcla de productos.`,
      impact: (Math.abs(marginDrop) / 100) * metrics.revenue,
    });
  }

  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2, good: 3 };
  return alerts.sort(
    (a, b) => order[a.level] - order[b.level] || b.impact - a.impact,
  );
}

// ---------------------------------------------------------------------------
// Top-level assembly
// ---------------------------------------------------------------------------

export interface ReportBundle {
  range: DateRange;
  previous: DateRange;
  granularity: Granularity;
  metrics: PeriodMetrics;
  previousMetrics: PeriodMetrics;
  series: SeriesPoint[];
  previousSeries: SeriesPoint[];
  /** Always daily, whatever `granularity` says - the forecast works on days. */
  dailySeries: SeriesPoint[];
  weekday: WeekdayPoint[];
  hours: HourPoint[];
  products: ProductStat[];
  categories: GroupStat[];
  brands: GroupStat[];
  sellers: SellerStat[];
  payments: PaymentStat[];
  paymentCoverage: PaymentCoverage;
  inventory: InventoryReport;
  forecast: Forecast;
  alerts: Alert[];
  /** Transactions inside the range, for the export and the detail table. */
  rangeTransactions: Transaction[];
  /** Oldest sale we hold locally, so the UI can flag an incomplete window. */
  oldestLoaded: Date | null;
}

export function buildReport(
  transactions: Transaction[],
  items: InventoryItem[],
  range: DateRange,
  options: InventoryOptions = DEFAULT_INVENTORY_OPTIONS,
): ReportBundle {
  const catalog = buildCatalog(items);
  const prevRange = previousRange(range);

  const rangeTxs = transactionsInRange(transactions, range);
  const prevTxs = transactionsInRange(transactions, prevRange);
  const lines = buildLines(rangeTxs, catalog);
  const prevLines = buildLines(prevTxs, catalog);

  // Last sale per item across the whole loaded history, not just the range -
  // "sin ventas en 90 días" has to look further back than the window.
  const lastSoldById = new Map<string, Date>();
  let oldestLoaded: Date | null = null;
  for (const t of transactions) {
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    if (!oldestLoaded || d < oldestLoaded) oldestLoaded = d;
    for (const item of t.items) {
      if (item.cartQuantity - (item.quantityReturned || 0) <= 0) continue;
      const prev = lastSoldById.get(item.id);
      if (!prev || d > prev) lastSoldById.set(item.id, d);
    }
  }

  const metrics = computeMetrics(rangeTxs, lines, range.days);
  const previousMetrics = computeMetrics(prevTxs, prevLines, prevRange.days);
  const granularity = chooseGranularity(range.days);
  const series = buildSeries(rangeTxs, lines, range, granularity);
  const previousSeries = buildSeries(prevTxs, prevLines, prevRange, granularity);
  const products = productStats(lines, catalog, range.days);
  const productById = new Map(products.map((p) => [p.itemId, p]));
  const inventory = inventoryReport(
    items,
    productById,
    lastSoldById,
    range,
    metrics.cost,
    options,
  );

  // Forecast on daily buckets regardless of the chart's granularity, so the
  // "next 30 days" figure means the same thing on every range.
  const dailySeries =
    granularity === "day" ? series : buildSeries(rangeTxs, lines, range, "day");

  return {
    range,
    previous: prevRange,
    granularity,
    metrics,
    previousMetrics,
    series,
    previousSeries,
    dailySeries,
    weekday: weekdayProfile(rangeTxs, range),
    hours: hourProfile(rangeTxs),
    products,
    categories: groupLines(lines, (l) => l.type),
    brands: groupLines(lines, (l) => l.brand),
    sellers: sellerStats(rangeTxs, lines),
    payments: paymentStats(rangeTxs),
    paymentCoverage: paymentCoverage(rangeTxs),
    inventory,
    forecast: forecast(dailySeries, metrics.margin),
    alerts: buildAlerts(metrics, previousMetrics, products, inventory, range),
    rangeTransactions: rangeTxs,
    oldestLoaded,
  };
}
