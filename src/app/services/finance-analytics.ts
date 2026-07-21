// Analytics behind the finance dashboard.
//
// Pure, like report-analytics: it takes the ledger, the definitions, the sales
// history and the catalogue, and returns view models. Every figure stays in USD
// and the screens convert at render time.
//
// The one idea worth understanding before changing anything: buying stock is
// not an expense. It converts cash into inventory. The cost reaches the profit
// statement later, when the item sells, taken from the snapshot on the sale
// line. So a purchase shows up in the CASH FLOW immediately and in the PROFIT
// statement never - what shows there is cost of goods sold. Counting both would
// charge the business twice for the same money, and would make any month with a
// big restock look like a disaster.
//
// That is what `nature` on a category encodes, and why the split matters:
//
//   cogs       -> cash flow only
//   fixed      -> profit statement, and the denominator of break-even
//   variable   -> profit statement
//   tax        -> profit statement
//   investment -> below the net profit line (profit set aside, not consumed)
//   owner      -> below the net profit line (money taken out, not a cost)

import type { InventoryItem, PaymentRecord } from "../context/app-context";
import type { Transaction } from "../context/history-context";
import type {
  Allocation,
  CategoryNature,
  FinanceAccount,
  FinanceCategory,
  FinanceEntry,
  FinancePayee,
  Purchase,
  PurchaseLine,
  PurchaseReturn,
  RecurringRule,
} from "../context/finance-context";
import {
  buildCatalog,
  buildLines,
  computeMetrics,
  previousRange,
  transactionsInRange,
  type DateRange,
} from "./report-analytics";

/** Days in an average month. Ranges are normalized through this so a 17-day
 *  window can still be compared against a monthly budget or a monthly rent. */
export const AVG_MONTH_DAYS = 30.44;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Ledger dates are plain days ("2026-07-20"). Parsed at local midnight so a
 *  timezone never shifts an expense into the neighbouring month. */
export function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function toIso(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dayInRange(iso: string, range: DateRange): boolean {
  const t = parseDay(iso).getTime();
  return t >= range.from.getTime() - 1 && t <= range.to.getTime();
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Anchoring on the 31st must not skid into the next month.
  if (d.getDate() < day) d.setDate(0);
  return d;
}

// ---------------------------------------------------------------------------
// Inputs and outputs
// ---------------------------------------------------------------------------

export interface FinanceInput {
  entries: FinanceEntry[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  payees: FinancePayee[];
  allocations: Allocation[];
  recurring: RecurringRule[];
  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  purchaseReturns: PurchaseReturn[];
  transactions: Transaction[];
  items: InventoryItem[];
  range: DateRange;
  /** Bolivares per dollar of real worth, for valuing bolivar balances today. */
  honestRate: number;
}

export interface ProfitAndLoss {
  salesRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPct: number;
  otherIncome: number;
  fixedExpenses: number;
  variableExpenses: number;
  taxExpenses: number;
  operatingExpenses: number;
  operatingProfit: number;
  netProfit: number;
  netMarginPct: number;
  /** Below the line: not costs, but they do consume the profit. */
  investments: number;
  ownerDraws: number;
  retained: number;
  /** Cash spent acquiring stock. Deliberately absent from every line above. */
  merchandisePurchases: number;
}

export interface CategorySpend {
  id: string;
  name: string;
  kind: "income" | "expense";
  nature: CategoryNature;
  amount: number;
  previousAmount: number;
  /** Share of all spend of the same kind, 0-100. */
  sharePct: number;
  /** Budget scaled to the length of the range, null when none is set. */
  budgetForRange: number | null;
  budgetUsedPct: number | null;
  entries: number;
}

export interface AccountBalance {
  id: string;
  name: string;
  basis: "USD" | "BS";
  kind: string;
  active: boolean;
  inflowUsd: number;
  outflowUsd: number;
  /** Balance at the value each movement was booked at. */
  balanceUsd: number;
  /** Bolivares actually sitting there, for BS accounts. */
  balanceBs: number;
  /** What those bolivares are worth at today's honest rate. */
  worthNowUsd: number;
  /** worthNow - booked. Negative means holding bolivares cost money. */
  devaluationUsd: number;
  /** Sale takings routed here through the account's declared methods. */
  salesInflowUsd: number;
}

export interface CashFlow {
  openingUsd: number;
  salesInflow: number;
  otherInflow: number;
  operatingOutflow: number;
  merchandiseOutflow: number;
  investmentOutflow: number;
  ownerOutflow: number;
  netUsd: number;
  closingUsd: number;
  /** Sale money whose payment method no account claims. */
  unassignedSalesUsd: number;
  unassignedMethods: string[];
  series: { date: string; inflow: number; outflow: number; net: number }[];
}

export interface BreakEven {
  fixedMonthly: number;
  grossMarginRatio: number;
  /** Sales needed in a month just to cover the fixed costs. */
  monthlySalesNeeded: number;
  dailySalesNeeded: number;
  currentDailySales: number;
  /** How much of the requirement current sales already cover, 0-100+. */
  coveragePct: number;
  reachable: boolean;
}

export interface Runway {
  cashUsd: number;
  monthlyBurnUsd: number;
  /** Months of fixed obligations the cash on hand can absorb. */
  months: number | null;
}

export interface Obligation {
  id: string;
  kind: "income" | "expense";
  description: string;
  payeeName: string | null;
  categoryName: string | null;
  amountUsd: number;
  dueOn: string | null;
  daysUntilDue: number | null;
  overdue: boolean;
}

export interface DueOccurrence {
  ruleId: string;
  ruleName: string;
  kind: "income" | "expense";
  categoryId: string | null;
  accountId: string | null;
  payeeId: string | null;
  amountUsd: number;
  /** The occurrence's own date. Doubles as the idempotency key. */
  periodKey: string;
  daysLate: number;
}

export interface AllocationStatus {
  id: string;
  name: string;
  basis: Allocation["basis"];
  percent: number;
  /** Where the money is parked once moved. Null means the fund is a rule with
   *  nowhere to put anything - the panel offers to link one. */
  accountId: string | null;
  baseUsd: number;
  shouldBeUsd: number;
  fundedUsd: number;
  gapUsd: number;
  targetUsd: number | null;
  /** Progress against the target, when one is set. */
  targetPct: number | null;
}

export interface SupplierStanding {
  id: string;
  name: string;
  purchasedUsd: number;
  /** Unpaid purchases still owed to them. */
  owedUsd: number;
  /** Returns settled as credit that no later purchase has consumed yet. */
  creditUsd: number;
  purchases: number;
  lastPurchaseOn: string | null;
  returnedUsd: number;
}

export interface SupplierPrice {
  itemId: string;
  itemName: string;
  supplierId: string;
  supplierName: string;
  lastCostUsd: number;
  lastPurchasedOn: string | null;
  /** True when this is the cheapest known source for the item. */
  cheapest: boolean;
  /** How much above the cheapest source, in percent. */
  premiumPct: number;
}

export type AlertLevel = "critical" | "warning" | "info";

export interface FinanceAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface FinanceReport {
  range: DateRange;
  pnl: ProfitAndLoss;
  previousPnl: ProfitAndLoss;
  categories: CategorySpend[];
  accounts: AccountBalance[];
  cashFlow: CashFlow;
  breakEven: BreakEven;
  runway: Runway;
  obligations: {
    payables: Obligation[];
    receivables: Obligation[];
    overdueCount: number;
    next30Usd: number;
    payablesUsd: number;
    receivablesUsd: number;
  };
  dueOccurrences: DueOccurrence[];
  allocations: AllocationStatus[];
  suppliers: SupplierStanding[];
  supplierPrices: SupplierPrice[];
  trend: MonthPoint[];
  alerts: FinanceAlert[];
  /** Ledger rows inside the range, newest first - what the movements table shows. */
  rangeEntries: FinanceEntry[];
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Profit and loss
// ---------------------------------------------------------------------------

interface NatureTotals {
  cogs: number;
  fixed: number;
  variable: number;
  tax: number;
  investment: number;
  owner: number;
  other: number;
}

const emptyNatureTotals = (): NatureTotals => ({
  cogs: 0,
  fixed: 0,
  variable: 0,
  tax: 0,
  investment: 0,
  owner: 0,
  other: 0,
});

function computePnl(
  entries: FinanceEntry[],
  categoryById: Map<string, FinanceCategory>,
  refundEntryIds: Set<string>,
  salesRevenue: number,
  costOfGoodsSold: number,
): ProfitAndLoss {
  const expense = emptyNatureTotals();
  let otherIncome = 0;

  for (const entry of entries) {
    if (entry.status !== "paid") continue;
    // A transfer moves money between pots. It is neither income nor cost, and
    // counting it as either would inflate both sides of the statement.
    if (entry.kind === "transfer") continue;

    if (entry.kind === "income") {
      // A supplier refund is stock money coming back, not revenue the business
      // earned. It belongs in the cash flow only.
      if (refundEntryIds.has(entry.id)) continue;
      otherIncome += entry.amountUsd;
      continue;
    }

    const nature = entry.categoryId
      ? (categoryById.get(entry.categoryId)?.nature ?? "other")
      : "other";
    expense[nature] += entry.amountUsd;
  }

  const grossProfit = salesRevenue - costOfGoodsSold;
  const operatingExpenses =
    expense.fixed + expense.variable + expense.tax + expense.other;
  const operatingProfit = grossProfit - operatingExpenses;
  const netProfit = operatingProfit + otherIncome;

  return {
    salesRevenue,
    costOfGoodsSold,
    grossProfit,
    grossMarginPct: salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0,
    otherIncome,
    fixedExpenses: expense.fixed,
    variableExpenses: expense.variable + expense.other,
    taxExpenses: expense.tax,
    operatingExpenses,
    operatingProfit,
    netProfit,
    netMarginPct: salesRevenue > 0 ? (netProfit / salesRevenue) * 100 : 0,
    investments: expense.investment,
    ownerDraws: expense.owner,
    retained: netProfit - expense.investment - expense.owner,
    merchandisePurchases: expense.cogs,
  };
}

// ---------------------------------------------------------------------------
// Accounts and cash flow
// ---------------------------------------------------------------------------

/** Which pot a sale payment method lands in, from what the admin declared.
 *  Matching is case- and accent-insensitive because "Pago Móvil" and "pago
 *  movil" are the same method typed by two different people. */
function normalizeMethod(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function routeSalePayments(
  transactions: Transaction[],
  accounts: FinanceAccount[],
): {
  byAccount: Map<string, number>;
  unassigned: number;
  unassignedMethods: string[];
} {
  const byMethod = new Map<string, string>();
  for (const account of accounts) {
    for (const method of account.paymentMethods) {
      byMethod.set(normalizeMethod(method), account.id);
    }
  }

  const byAccount = new Map<string, number>();
  const unassignedMethods = new Set<string>();
  let unassigned = 0;

  for (const tx of transactions) {
    const payments: PaymentRecord[] = tx.payments ?? [];
    for (const payment of payments) {
      const accountId = byMethod.get(normalizeMethod(payment.method || ""));
      if (accountId) {
        byAccount.set(accountId, (byAccount.get(accountId) ?? 0) + payment.amount);
      } else {
        unassigned += payment.amount;
        if (payment.method) unassignedMethods.add(payment.method);
      }
    }
  }

  return { byAccount, unassigned, unassignedMethods: [...unassignedMethods] };
}

function computeAccounts(
  accounts: FinanceAccount[],
  entries: FinanceEntry[],
  salesByAccount: Map<string, number>,
  honestRate: number,
): AccountBalance[] {
  const rate = honestRate > 0 ? honestRate : 1;

  return accounts.map((account) => {
    let inflowUsd = 0;
    let outflowUsd = 0;
    let bs = account.openingBalanceBs;

    for (const entry of entries) {
      if (entry.status !== "paid") continue;

      const isDestination =
        entry.accountId === account.id
          ? entry.kind === "income"
          : entry.kind === "transfer" && entry.counterAccountId === account.id;
      const isSource =
        entry.accountId === account.id &&
        (entry.kind === "expense" || entry.kind === "transfer");

      if (!isDestination && !isSource) continue;

      if (isDestination) {
        inflowUsd += entry.amountUsd;
        if (entry.paidIn === "BS" && entry.amountBs) bs += entry.amountBs;
      } else {
        outflowUsd += entry.amountUsd;
        if (entry.paidIn === "BS" && entry.amountBs) bs -= entry.amountBs;
      }
    }

    const salesInflowUsd = salesByAccount.get(account.id) ?? 0;
    inflowUsd += salesInflowUsd;
    // Counter takings in a bolivar pot arrive as bolivares, valued at today's
    // rate: the sale was priced in dollars and paid in bolivares at that rate.
    if (account.basis === "BS") bs += salesInflowUsd * rate;

    const balanceUsd = account.openingBalanceUsd + inflowUsd - outflowUsd;
    const worthNowUsd = account.basis === "BS" ? bs / rate : balanceUsd;

    return {
      id: account.id,
      name: account.name,
      basis: account.basis,
      kind: account.kind,
      active: account.active,
      inflowUsd,
      outflowUsd,
      balanceUsd,
      balanceBs: account.basis === "BS" ? bs : 0,
      worthNowUsd,
      // Only bolivar pots can lose worth by sitting still.
      devaluationUsd: account.basis === "BS" ? worthNowUsd - balanceUsd : 0,
      salesInflowUsd,
    };
  });
}

// ---------------------------------------------------------------------------
// Recurring occurrences
// ---------------------------------------------------------------------------

function cadenceStep(cadence: RecurringRule["cadence"], from: Date, n: number): Date {
  switch (cadence) {
    case "weekly":
      return new Date(from.getTime() + n * 7 * 86_400_000);
    case "biweekly":
      return new Date(from.getTime() + n * 14 * 86_400_000);
    case "monthly":
      return addMonths(from, n);
    case "quarterly":
      return addMonths(from, n * 3);
    case "yearly":
      return addMonths(from, n * 12);
  }
}

/**
 * Which occurrences of the standing rules are due and not yet recorded.
 *
 * Nothing is generated on a schedule: the dates are derived from the rule and
 * checked against what is already in the ledger, so opening the screen twice,
 * or from two devices, proposes the same list rather than posting twice.
 */
export function dueOccurrences(
  rules: RecurringRule[],
  entries: FinanceEntry[],
  today = new Date(),
): DueOccurrence[] {
  const posted = new Set(
    entries
      .filter((e) => e.recurringId && e.periodKey)
      .map((e) => `${e.recurringId}:${e.periodKey}`),
  );

  const todayTime = parseDay(toIso(today)).getTime();
  const out: DueOccurrence[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    const anchor = parseDay(rule.anchorDate);
    if (Number.isNaN(anchor.getTime())) continue;
    const endsOn = rule.endsOn ? parseDay(rule.endsOn).getTime() : null;

    // Walk forward from the anchor. Bounded so a rule anchored years back with
    // a weekly cadence cannot spin.
    for (let n = 0; n < 520; n++) {
      const date = cadenceStep(rule.cadence, anchor, n);
      const time = date.getTime();
      if (time > todayTime) break;
      if (endsOn !== null && time > endsOn) break;

      const periodKey = toIso(date);
      if (posted.has(`${rule.id}:${periodKey}`)) continue;

      out.push({
        ruleId: rule.id,
        ruleName: rule.name,
        kind: rule.kind,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        payeeId: rule.payeeId,
        amountUsd: rule.amountUsd,
        periodKey,
        daysLate: Math.round((todayTime - time) / 86_400_000),
      });
    }
  }

  return out.sort((a, b) => b.daysLate - a.daysLate);
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export function buildFinanceReport(input: FinanceInput): FinanceReport {
  const {
    entries,
    categories,
    accounts,
    payees,
    allocations,
    recurring,
    purchases,
    purchaseLines,
    purchaseReturns,
    transactions,
    items,
    range,
    honestRate,
  } = input;

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const payeeById = new Map(payees.map((p) => [p.id, p]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const prevRange = previousRange(range);

  // Cash refunds from suppliers are money back on stock, not earnings. They are
  // identified by the return that created them rather than by their wording.
  const refundEntryIds = new Set(
    purchaseReturns
      .filter((r) => r.entryId)
      .map((r) => r.entryId as string),
  );

  const rangeEntries = entries
    .filter((e) => e.status !== "void" && dayInRange(e.occurredOn, range))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const prevEntries = entries.filter(
    (e) => e.status !== "void" && dayInRange(e.occurredOn, prevRange),
  );

  // Sales revenue and cost of goods come from the sales pipeline, not the
  // ledger: the counter already records them, line by line, with the cost each
  // item carried on the day it sold.
  const catalog = buildCatalog(items);
  const rangeTxs = transactionsInRange(transactions, range);
  const prevTxs = transactionsInRange(transactions, prevRange);
  const rangeMetrics = computeMetrics(rangeTxs, buildLines(rangeTxs, catalog), range.days);
  const prevMetrics = computeMetrics(prevTxs, buildLines(prevTxs, catalog), prevRange.days);

  const pnl = computePnl(
    rangeEntries,
    categoryById,
    refundEntryIds,
    rangeMetrics.revenue,
    rangeMetrics.cost,
  );
  const previousPnl = computePnl(
    prevEntries,
    categoryById,
    refundEntryIds,
    prevMetrics.revenue,
    prevMetrics.cost,
  );

  // --- Category breakdown ---------------------------------------------------

  const spendByCategory = new Map<string, { amount: number; entries: number }>();
  const prevByCategory = new Map<string, number>();

  for (const entry of rangeEntries) {
    if (entry.status !== "paid" || entry.kind === "transfer") continue;
    if (refundEntryIds.has(entry.id)) continue;
    const key = entry.categoryId ?? "";
    const bucket = spendByCategory.get(key) ?? { amount: 0, entries: 0 };
    bucket.amount += entry.amountUsd;
    bucket.entries += 1;
    spendByCategory.set(key, bucket);
  }
  for (const entry of prevEntries) {
    if (entry.status !== "paid" || entry.kind === "transfer") continue;
    if (refundEntryIds.has(entry.id)) continue;
    const key = entry.categoryId ?? "";
    prevByCategory.set(key, (prevByCategory.get(key) ?? 0) + entry.amountUsd);
  }

  const totalByKind = { income: 0, expense: 0 };
  for (const [id, bucket] of spendByCategory) {
    const kind = categoryById.get(id)?.kind ?? "expense";
    totalByKind[kind] += bucket.amount;
  }

  const budgetFactor = range.days / AVG_MONTH_DAYS;
  const categorySpend: CategorySpend[] = [...spendByCategory.entries()].map(
    ([id, bucket]) => {
      const category = categoryById.get(id);
      const kind = category?.kind ?? "expense";
      const budgetForRange =
        category?.monthlyBudgetUsd != null
          ? category.monthlyBudgetUsd * budgetFactor
          : null;
      const total = totalByKind[kind];
      return {
        id,
        name: category?.name ?? "SIN CATEGORÍA",
        kind,
        nature: category?.nature ?? "other",
        amount: bucket.amount,
        previousAmount: prevByCategory.get(id) ?? 0,
        sharePct: total > 0 ? (bucket.amount / total) * 100 : 0,
        budgetForRange,
        budgetUsedPct:
          budgetForRange && budgetForRange > 0
            ? (bucket.amount / budgetForRange) * 100
            : null,
        entries: bucket.entries,
      };
    },
  );
  categorySpend.sort((a, b) => b.amount - a.amount);

  // --- Accounts and cash flow ----------------------------------------------

  // Balances are cumulative: every movement ever recorded, not just the range,
  // because "how much is in the drawer" is not a question about a date filter.
  const paidEntries = entries.filter((e) => e.status === "paid");
  const routedAll = routeSalePayments(transactions, accounts);
  const accountBalances = computeAccounts(
    accounts,
    paidEntries,
    routedAll.byAccount,
    honestRate,
  );

  const routedRange = routeSalePayments(rangeTxs, accounts);
  const salesInflowRange = [...routedRange.byAccount.values()].reduce(
    (s, v) => s + v,
    0,
  );

  let otherInflow = 0;
  let operatingOutflow = 0;
  let merchandiseOutflow = 0;
  let investmentOutflow = 0;
  let ownerOutflow = 0;
  const dailyFlow = new Map<string, { inflow: number; outflow: number }>();

  for (const entry of rangeEntries) {
    if (entry.status !== "paid" || entry.kind === "transfer") continue;
    const bucket = dailyFlow.get(entry.occurredOn) ?? { inflow: 0, outflow: 0 };

    if (entry.kind === "income") {
      otherInflow += entry.amountUsd;
      bucket.inflow += entry.amountUsd;
    } else {
      const nature = entry.categoryId
        ? (categoryById.get(entry.categoryId)?.nature ?? "other")
        : "other";
      if (nature === "cogs") merchandiseOutflow += entry.amountUsd;
      else if (nature === "investment") investmentOutflow += entry.amountUsd;
      else if (nature === "owner") ownerOutflow += entry.amountUsd;
      else operatingOutflow += entry.amountUsd;
      bucket.outflow += entry.amountUsd;
    }
    dailyFlow.set(entry.occurredOn, bucket);
  }

  for (const tx of rangeTxs) {
    const day = toIso(new Date(tx.date));
    const bucket = dailyFlow.get(day) ?? { inflow: 0, outflow: 0 };
    bucket.inflow += tx.total;
    dailyFlow.set(day, bucket);
  }

  const totalOutflow =
    operatingOutflow + merchandiseOutflow + investmentOutflow + ownerOutflow;
  const totalInflow = salesInflowRange + routedRange.unassigned + otherInflow;
  const closingUsd = accountBalances.reduce((s, a) => s + a.worthNowUsd, 0);

  const cashFlow: CashFlow = {
    openingUsd: closingUsd - (totalInflow - totalOutflow),
    salesInflow: salesInflowRange + routedRange.unassigned,
    otherInflow,
    operatingOutflow,
    merchandiseOutflow,
    investmentOutflow,
    ownerOutflow,
    netUsd: totalInflow - totalOutflow,
    closingUsd,
    unassignedSalesUsd: routedRange.unassigned,
    unassignedMethods: routedRange.unassignedMethods,
    series: [...dailyFlow.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        inflow: v.inflow,
        outflow: v.outflow,
        net: v.inflow - v.outflow,
      })),
  };

  // --- Break-even and runway ------------------------------------------------

  const fixedMonthly = (pnl.fixedExpenses / range.days) * AVG_MONTH_DAYS;
  const grossMarginRatio =
    pnl.salesRevenue > 0 ? pnl.grossProfit / pnl.salesRevenue : 0;
  const monthlySalesNeeded =
    grossMarginRatio > 0 ? fixedMonthly / grossMarginRatio : 0;
  const currentDailySales = pnl.salesRevenue / range.days;
  const dailySalesNeeded = monthlySalesNeeded / AVG_MONTH_DAYS;

  const breakEven: BreakEven = {
    fixedMonthly,
    grossMarginRatio,
    monthlySalesNeeded,
    dailySalesNeeded,
    currentDailySales,
    coveragePct:
      dailySalesNeeded > 0 ? (currentDailySales / dailySalesNeeded) * 100 : 0,
    // Without a positive margin no amount of selling covers the fixed costs,
    // and reporting a break-even figure would be a lie.
    reachable: grossMarginRatio > 0,
  };

  const monthlyBurn =
    ((pnl.fixedExpenses + pnl.variableExpenses + pnl.taxExpenses) / range.days) *
    AVG_MONTH_DAYS;
  const runway: Runway = {
    cashUsd: closingUsd,
    monthlyBurnUsd: monthlyBurn,
    months: monthlyBurn > 0 ? closingUsd / monthlyBurn : null,
  };

  // --- Obligations ----------------------------------------------------------

  const todayIsoDate = toIso(new Date());
  const todayTime = parseDay(todayIsoDate).getTime();

  const toObligation = (entry: FinanceEntry): Obligation => {
    const due = entry.dueOn ? parseDay(entry.dueOn) : null;
    const daysUntilDue = due
      ? Math.round((due.getTime() - todayTime) / 86_400_000)
      : null;
    return {
      id: entry.id,
      kind: entry.kind === "income" ? "income" : "expense",
      description: entry.description || "Sin descripción",
      payeeName: entry.payeeId ? (payeeById.get(entry.payeeId)?.name ?? null) : null,
      categoryName: entry.categoryId
        ? (categoryById.get(entry.categoryId)?.name ?? null)
        : null,
      amountUsd: entry.amountUsd,
      dueOn: entry.dueOn,
      daysUntilDue,
      overdue: daysUntilDue !== null && daysUntilDue < 0,
    };
  };

  // Pending obligations are not filtered by the range: a bill from three months
  // ago is still owed today, and hiding it behind a date filter is how it stays
  // unpaid.
  const pending = entries.filter((e) => e.status === "pending");
  const payables = pending
    .filter((e) => e.kind !== "income")
    .map(toObligation)
    .sort(sortByDue);
  const receivables = pending
    .filter((e) => e.kind === "income")
    .map(toObligation)
    .sort(sortByDue);

  const next30Usd = payables
    .filter((o) => o.daysUntilDue !== null && o.daysUntilDue <= 30)
    .reduce((s, o) => s + o.amountUsd, 0);

  // --- Allocations ----------------------------------------------------------

  const allocationBase = (basis: Allocation["basis"]): number => {
    switch (basis) {
      case "gross_sales":
        return pnl.salesRevenue;
      case "gross_profit":
        return pnl.grossProfit;
      case "net_profit":
        return Math.max(pnl.netProfit, 0);
    }
  };

  const fundedByAllocation = new Map<string, number>();
  for (const entry of rangeEntries) {
    if (!entry.allocationId || entry.status !== "paid") continue;
    fundedByAllocation.set(
      entry.allocationId,
      (fundedByAllocation.get(entry.allocationId) ?? 0) + entry.amountUsd,
    );
  }

  const allocationStatus: AllocationStatus[] = allocations
    .filter((a) => a.active)
    .map((allocation) => {
      const baseUsd = allocationBase(allocation.basis);
      const shouldBeUsd = (baseUsd * allocation.percent) / 100;
      const fundedUsd = fundedByAllocation.get(allocation.id) ?? 0;
      return {
        id: allocation.id,
        name: allocation.name,
        basis: allocation.basis,
        percent: allocation.percent,
        accountId: allocation.accountId,
        baseUsd,
        shouldBeUsd,
        fundedUsd,
        gapUsd: shouldBeUsd - fundedUsd,
        targetUsd: allocation.targetUsd,
        targetPct:
          allocation.targetUsd && allocation.targetUsd > 0
            ? (fundedUsd / allocation.targetUsd) * 100
            : null,
      };
    });

  // --- Suppliers ------------------------------------------------------------

  const linesByPurchase = new Map<string, PurchaseLine[]>();
  for (const line of purchaseLines) {
    const bucket = linesByPurchase.get(line.purchaseId);
    if (bucket) bucket.push(line);
    else linesByPurchase.set(line.purchaseId, [line]);
  }

  const standingById = new Map<string, SupplierStanding>();
  const ensureStanding = (id: string): SupplierStanding => {
    const existing = standingById.get(id);
    if (existing) return existing;
    const created: SupplierStanding = {
      id,
      name: payeeById.get(id)?.name ?? "Proveedor",
      purchasedUsd: 0,
      owedUsd: 0,
      creditUsd: 0,
      purchases: 0,
      lastPurchaseOn: null,
      returnedUsd: 0,
    };
    standingById.set(id, created);
    return created;
  };

  for (const purchase of purchases) {
    if (!purchase.supplierId || purchase.status === "void") continue;
    const standing = ensureStanding(purchase.supplierId);
    standing.purchasedUsd += purchase.goodsUsd + purchase.freightUsd;
    standing.purchases += 1;
    if (purchase.paymentStatus === "pending") standing.owedUsd += purchase.totalUsd;
    // Credit already consumed by this purchase is no longer available.
    standing.creditUsd -= purchase.creditAppliedUsd;
    if (
      !standing.lastPurchaseOn ||
      purchase.occurredOn > standing.lastPurchaseOn
    ) {
      standing.lastPurchaseOn = purchase.occurredOn;
    }
  }

  for (const ret of purchaseReturns) {
    if (!ret.supplierId) continue;
    const standing = ensureStanding(ret.supplierId);
    standing.returnedUsd += ret.totalUsd;
    if (ret.settlement === "credit") standing.creditUsd += ret.totalUsd;
  }

  const suppliers = [...standingById.values()]
    .map((s) => ({ ...s, creditUsd: Math.max(s.creditUsd, 0) }))
    .sort((a, b) => b.purchasedUsd - a.purchasedUsd);

  // Cheapest known source per item, from the newest purchase per pair.
  const priceByPair = new Map<string, SupplierPrice>();
  for (const purchase of purchases) {
    if (!purchase.supplierId) continue;
    for (const line of linesByPurchase.get(purchase.id) ?? []) {
      if (!line.itemId) continue;
      const key = `${line.itemId}:${purchase.supplierId}`;
      const existing = priceByPair.get(key);
      if (existing && existing.lastPurchasedOn && existing.lastPurchasedOn >= purchase.occurredOn) {
        continue;
      }
      priceByPair.set(key, {
        itemId: line.itemId,
        itemName: itemById.get(line.itemId)?.name ?? line.name,
        supplierId: purchase.supplierId,
        supplierName: payeeById.get(purchase.supplierId)?.name ?? "Proveedor",
        lastCostUsd: line.unitCostUsd,
        lastPurchasedOn: purchase.occurredOn,
        cheapest: false,
        premiumPct: 0,
      });
    }
  }

  const bestByItem = new Map<string, number>();
  for (const price of priceByPair.values()) {
    const best = bestByItem.get(price.itemId);
    if (best === undefined || price.lastCostUsd < best) {
      bestByItem.set(price.itemId, price.lastCostUsd);
    }
  }
  const supplierPrices = [...priceByPair.values()]
    .map((price) => {
      const best = bestByItem.get(price.itemId) ?? price.lastCostUsd;
      return {
        ...price,
        cheapest: price.lastCostUsd <= best,
        premiumPct: best > 0 ? ((price.lastCostUsd - best) / best) * 100 : 0,
      };
    })
    .sort((a, b) => b.premiumPct - a.premiumPct);

  // --- Trend ----------------------------------------------------------------

  const byMonth = new Map<string, MonthPoint>();
  const bumpMonth = (month: string): MonthPoint => {
    const existing = byMonth.get(month);
    if (existing) return existing;
    const created: MonthPoint = { month, income: 0, expense: 0, net: 0 };
    byMonth.set(month, created);
    return created;
  };

  for (const tx of rangeTxs) {
    const point = bumpMonth(toIso(new Date(tx.date)).slice(0, 7));
    point.income += tx.total;
  }
  for (const entry of rangeEntries) {
    if (entry.status !== "paid" || entry.kind === "transfer") continue;
    if (refundEntryIds.has(entry.id)) continue;
    const point = bumpMonth(entry.occurredOn.slice(0, 7));
    if (entry.kind === "income") point.income += entry.amountUsd;
    else point.expense += entry.amountUsd;
  }
  const trend = [...byMonth.values()]
    .map((p) => ({ ...p, net: p.income - p.expense }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // --- Alerts ---------------------------------------------------------------

  const occurrences = dueOccurrences(recurring, entries);
  const alerts = buildAlerts({
    pnl,
    previousPnl,
    breakEven,
    runway,
    accountBalances,
    categorySpend,
    payables,
    occurrences,
    cashFlow,
  });

  return {
    range,
    pnl,
    previousPnl,
    categories: categorySpend,
    accounts: accountBalances,
    cashFlow,
    breakEven,
    runway,
    obligations: {
      payables,
      receivables,
      overdueCount: payables.filter((o) => o.overdue).length,
      next30Usd,
      payablesUsd: payables.reduce((s, o) => s + o.amountUsd, 0),
      receivablesUsd: receivables.reduce((s, o) => s + o.amountUsd, 0),
    },
    dueOccurrences: occurrences,
    allocations: allocationStatus,
    suppliers,
    supplierPrices,
    trend,
    alerts,
    rangeEntries,
    entryCount: rangeEntries.length,
  };
}

function sortByDue(a: Obligation, b: Obligation): number {
  if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
  if (a.dueOn) return -1;
  if (b.dueOn) return 1;
  return b.amountUsd - a.amountUsd;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function buildAlerts(input: {
  pnl: ProfitAndLoss;
  previousPnl: ProfitAndLoss;
  breakEven: BreakEven;
  runway: Runway;
  accountBalances: AccountBalance[];
  categorySpend: CategorySpend[];
  payables: Obligation[];
  occurrences: DueOccurrence[];
  cashFlow: CashFlow;
}): FinanceAlert[] {
  const alerts: FinanceAlert[] = [];
  const money = (n: number) => `$ ${n.toFixed(2)}`;

  if (input.pnl.netProfit < 0) {
    alerts.push({
      id: "loss",
      level: "critical",
      title: "El período cerró en pérdida",
      detail: `Utilidad neta ${money(input.pnl.netProfit)}. Las ventas no cubrieron los gastos.`,
    });
  }

  if (input.breakEven.reachable && input.breakEven.coveragePct < 100) {
    alerts.push({
      id: "below-breakeven",
      level: "warning",
      title: "Ventas por debajo del punto de equilibrio",
      detail: `Necesitas vender ${money(input.breakEven.dailySalesNeeded)} al día para cubrir los gastos fijos; vas en ${money(input.breakEven.currentDailySales)}.`,
    });
  }

  if (input.runway.months !== null && input.runway.months < 2) {
    alerts.push({
      id: "runway",
      level: "critical",
      title: "Poco colchón de efectivo",
      detail: `El efectivo disponible cubre ${input.runway.months.toFixed(1)} mes(es) de gastos al ritmo actual.`,
    });
  }

  const overdue = input.payables.filter((o) => o.overdue);
  if (overdue.length > 0) {
    alerts.push({
      id: "overdue",
      level: "critical",
      title: `${overdue.length} cuenta(s) vencida(s)`,
      detail: `Suman ${money(overdue.reduce((s, o) => s + o.amountUsd, 0))}.`,
    });
  }

  const dueSoon = input.payables.filter(
    (o) => !o.overdue && o.daysUntilDue !== null && o.daysUntilDue <= 7,
  );
  if (dueSoon.length > 0) {
    alerts.push({
      id: "due-soon",
      level: "warning",
      title: `${dueSoon.length} pago(s) vencen esta semana`,
      detail: `Suman ${money(dueSoon.reduce((s, o) => s + o.amountUsd, 0))}.`,
    });
  }

  if (input.occurrences.length > 0) {
    alerts.push({
      id: "recurring-pending",
      level: "info",
      title: `${input.occurrences.length} movimiento(s) recurrente(s) sin registrar`,
      detail: "Revísalos en Obligaciones y regístralos con un clic.",
    });
  }

  for (const account of input.accountBalances) {
    if (account.active && account.worthNowUsd < 0) {
      alerts.push({
        id: `negative-${account.id}`,
        level: "critical",
        title: `${account.name} en negativo`,
        detail: `Saldo ${money(account.worthNowUsd)}. Falta registrar un ingreso o hay un gasto duplicado.`,
      });
    }
    // Only worth saying when the loss is material - every bolivar balance
    // drifts a little, and an alert on every one of them would be noise.
    if (account.devaluationUsd < -1 && account.balanceUsd > 0) {
      const pct = Math.abs(account.devaluationUsd / account.balanceUsd) * 100;
      if (pct >= 3) {
        alerts.push({
          id: `devaluation-${account.id}`,
          level: "warning",
          title: `${account.name} perdió valor`,
          detail: `Los bolívares en esta cuenta valen ${money(Math.abs(account.devaluationUsd))} menos que cuando entraron (${pct.toFixed(1)}%).`,
        });
      }
    }
  }

  for (const category of input.categorySpend) {
    if (category.budgetUsedPct !== null && category.budgetUsedPct > 100) {
      alerts.push({
        id: `budget-${category.id}`,
        level: "warning",
        title: `${category.name} pasó el presupuesto`,
        detail: `Lleva ${money(category.amount)} de ${money(category.budgetForRange ?? 0)} (${category.budgetUsedPct.toFixed(0)}%).`,
      });
    }
    // A category that doubled deserves a look even when no budget was set.
    if (
      category.kind === "expense" &&
      category.previousAmount > 0 &&
      category.amount > category.previousAmount * 2 &&
      category.amount - category.previousAmount > 20
    ) {
      alerts.push({
        id: `spike-${category.id}`,
        level: "info",
        title: `${category.name} subió fuerte`,
        detail: `${money(category.previousAmount)} en el período anterior, ${money(category.amount)} en este.`,
      });
    }
  }

  if (input.cashFlow.unassignedSalesUsd > 0) {
    alerts.push({
      id: "unassigned-sales",
      level: "info",
      title: "Cobros sin cuenta asignada",
      detail: `${money(input.cashFlow.unassignedSalesUsd)} entraron por métodos que ninguna cuenta reclama (${input.cashFlow.unassignedMethods.join(", ")}). Asígnalos en Cuentas para que el saldo cuadre.`,
    });
  }

  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
