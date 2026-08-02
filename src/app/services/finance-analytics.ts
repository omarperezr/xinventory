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
  FinanceBalances,
  FinanceCategory,
  FinanceEntry,
  FinancePayee,
  Purchase,
  PurchaseLine,
  PurchaseReturn,
  RecurringRule,
} from "../context/finance-context";
// Explicit extension so the runnable check next to this file can be executed
// straight by node, which does not resolve extensionless specifiers.
import {
  buildCatalog,
  buildLines,
  computeMetrics,
  previousRange,
  transactionsInRange,
  type DateRange,
} from "./report-analytics.ts";

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
  /** Cumulative totals over the whole ledger and the whole sales history. The
   *  arrays above are pages, so the balances cannot be summed from them. Null
   *  when the server could not be reached: the balances then fall back to those
   *  pages and the screen flags them as partial. */
  balances: FinanceBalances | null;
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
  /** The pot it was recorded against. Settling it must keep that pot, or the
   *  balance it was charged to stays overstated. */
  accountId: string | null;
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

/** Puts per-method takings in the pot the admin declared for that method. */
function routeMethodTotals(
  totals: Iterable<[string, number]>,
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

  for (const [method, amount] of totals) {
    const accountId = byMethod.get(normalizeMethod(method));
    if (accountId) {
      byAccount.set(accountId, (byAccount.get(accountId) ?? 0) + amount);
    } else {
      unassigned += amount;
      if (method) unassignedMethods.add(method);
    }
  }

  return { byAccount, unassigned, unassignedMethods: [...unassignedMethods] };
}

function routeSalePayments(
  transactions: Transaction[],
  accounts: FinanceAccount[],
): ReturnType<typeof routeMethodTotals> {
  const kept = new Map<string, number>();

  for (const tx of transactions) {
    const payments: PaymentRecord[] = tx.payments ?? [];
    // A payment records the money the customer HANDED OVER, which is not what
    // the drawer keeps: change goes straight back out, and a returned sale is
    // refunded. tx.total is already net of returns, so crediting the raw
    // tender would leave the shop $2 richer on paper for every $20 note taken
    // against an $18 sale, and $100 richer for every sale returned in full.
    const tendered = payments.reduce((sum, p) => sum + p.amount, 0);
    const share = tendered > 0 ? Math.min(tendered, Math.max(0, tx.total)) / tendered : 0;

    for (const payment of payments) {
      const method = payment.method || "";
      kept.set(method, (kept.get(method) ?? 0) + payment.amount * share);
    }
  }

  return routeMethodTotals(kept, accounts);
}

function computeAccounts(
  accounts: FinanceAccount[],
  entries: FinanceEntry[],
  salesByAccount: Map<string, number>,
  honestRate: number,
  cumulative: FinanceBalances | null,
  /** Counter takings in bolivares at the rate each sale stamped. Null when the
   *  server totals are missing, in which case today's rate is all there is. */
  salesBsByAccount: Map<string, number> | null,
): AccountBalance[] {
  const rate = honestRate > 0 ? honestRate : 1;
  const cumulativeById = new Map(
    (cumulative?.accounts ?? []).map((a) => [a.accountId, a]),
  );

  return accounts.map((account) => {
    let inflowUsd = 0;
    let outflowUsd = 0;
    let bs = account.openingBalanceBs;

    if (cumulative) {
      // Every movement ever recorded, counted by the server. An account that
      // never moved has no row.
      const totals = cumulativeById.get(account.id);
      inflowUsd = totals?.inflowUsd ?? 0;
      outflowUsd = totals?.outflowUsd ?? 0;
      bs +=
        (totals?.inflowBs ?? 0) -
        (totals?.outflowBs ?? 0) +
        ((totals?.inflowUsdAtRate ?? 0) - (totals?.outflowUsdAtRate ?? 0)) * rate;
    } else {
      // No server totals: the loaded window is all there is, and the screen
      // says the balances are partial.
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

        // A bolivar pot holds bolivares whatever the movement was denominated
        // in: dollars moved into the drawer arrive as bolivares. Valued at the
        // rate the row stamped when it was written, and only at today's rate
        // when the row genuinely stamped none - a dollar movement usually does
        // not. Using today's rate on a row that carries its own would restate
        // last year's deposit at this year's bolivar, inventing bolivares that
        // were never in the drawer and hiding what holding them cost.
        const movementBs =
          entry.paidIn === "BS" && entry.amountBs
            ? entry.amountBs
            : entry.amountUsd * (entry.rateUsed ?? rate);

        if (isDestination) {
          inflowUsd += entry.amountUsd;
          bs += movementBs;
        } else {
          outflowUsd += entry.amountUsd;
          bs -= movementBs;
        }
      }
    }

    const salesInflowUsd = salesByAccount.get(account.id) ?? 0;
    inflowUsd += salesInflowUsd;
    // Counter takings in a bolivar pot arrive as bolivares, at the rate each
    // sale stamped. Only when the server totals are missing is today's rate
    // used instead, which overstates what is sitting in the pot and hides the
    // devaluation on old takings - the screen says the balances are partial in
    // that case. The dollar worth is unaffected either way: the rate cancels
    // against `bs / rate`.
    if (account.basis === "BS") {
      bs += salesBsByAccount
        ? (salesBsByAccount.get(account.id) ?? 0)
        : salesInflowUsd * rate;
    }

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
  /** Every posted occurrence, counted server-side over the whole ledger. When
   *  present it replaces the page entirely, and the window floor below is not
   *  needed: an occurrence can then be judged however old it is. */
  postedPeriods?: { recurringId: string; periodKey: string }[] | null,
): DueOccurrence[] {
  const posted = new Set(
    postedPeriods
      ? postedPeriods.map((p) => `${p.recurringId}:${p.periodKey}`)
      : entries
          .filter((e) => e.recurringId && e.periodKey)
          .map((e) => `${e.recurringId}:${e.periodKey}`),
  );

  // Without the server's list, `entries` is the newest page of the ledger, not
  // the ledger. Older than its oldest day, "no matching row" stops meaning
  // "never posted" and starts meaning "posted outside the page", so proposing
  // those occurrences tells the shop to pay an obligation it already settled.
  // Only the window the page actually covers can be judged. An empty page means
  // an empty ledger - the fetch falls back to the cache rather than to nothing -
  // so a new shop still sees its first occurrences.
  const oldestLoaded = postedPeriods
    ? null
    : entries.reduce<string | null>(
        (min, e) => (min === null || e.occurredOn < min ? e.occurredOn : min),
        null,
      );
  const floorTime = oldestLoaded ? parseDay(oldestLoaded).getTime() : -Infinity;

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
      if (time < floorTime) continue;

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
    balances,
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

  // Bucketed by the movement's own direction, not only by its category: money
  // coming in with no category, or filed under a category declared as expense,
  // would otherwise be added to the spend breakdown and reported as money the
  // shop spent. The row still carries the plain category id, so nothing
  // downstream has to know about the composite key.
  const spendKey = (entry: FinanceEntry): string =>
    `${entry.kind === "income" ? "income" : "expense"}|${entry.categoryId ?? ""}`;
  const splitKey = (key: string) => ({
    kind: (key.startsWith("income|") ? "income" : "expense") as "income" | "expense",
    id: key.slice(key.indexOf("|") + 1),
  });

  const spendByCategory = new Map<string, { amount: number; entries: number }>();
  const prevByCategory = new Map<string, number>();

  for (const entry of rangeEntries) {
    if (entry.status !== "paid" || entry.kind === "transfer") continue;
    if (refundEntryIds.has(entry.id)) continue;
    const key = spendKey(entry);
    const bucket = spendByCategory.get(key) ?? { amount: 0, entries: 0 };
    bucket.amount += entry.amountUsd;
    bucket.entries += 1;
    spendByCategory.set(key, bucket);
  }
  for (const entry of prevEntries) {
    if (entry.status !== "paid" || entry.kind === "transfer") continue;
    if (refundEntryIds.has(entry.id)) continue;
    const key = spendKey(entry);
    prevByCategory.set(key, (prevByCategory.get(key) ?? 0) + entry.amountUsd);
  }

  const totalByKind = { income: 0, expense: 0 };
  for (const [key, bucket] of spendByCategory) {
    totalByKind[splitKey(key).kind] += bucket.amount;
  }

  const budgetFactor = range.days / AVG_MONTH_DAYS;
  const categorySpend: CategorySpend[] = [...spendByCategory.entries()].map(
    ([key, bucket]) => {
      const { kind, id } = splitKey(key);
      const category = categoryById.get(id);
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
        previousAmount: prevByCategory.get(key) ?? 0,
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
  // Neither `entries` nor `transactions` holds every movement - both are pages -
  // so the totals come from the server and only fall back to the pages offline.
  const paidEntries = entries.filter((e) => e.status === "paid");
  const routedAll = balances
    ? routeMethodTotals(
        balances.methods.map((m): [string, number] => [m.method, m.keptUsd]),
        accounts,
      )
    : routeSalePayments(transactions, accounts);
  // The bolivares the counter actually took, each sale at the rate it stamped.
  // Routed through the same declaration as the dollars, so a method lands in
  // one pot in both currencies. Takings from sales written before the rate was
  // stamped come back as dollars and are valued at today's rate here.
  const salesBsByAccount = balances
    ? routeMethodTotals(
        balances.methods.map((m): [string, number] => [
          m.method,
          m.keptBs + m.keptUsdAtRate * (honestRate > 0 ? honestRate : 1),
        ]),
        accounts,
      ).byAccount
    : null;
  const accountBalances = computeAccounts(
    accounts,
    paidEntries,
    routedAll.byAccount,
    honestRate,
    balances,
    salesBsByAccount,
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
    // A requirement of zero is already met. A shop with no fixed costs has not
    // failed to cover them, and reading 0/0 as "0% covered" is what puts a
    // break-even warning on a period that never owed anything.
    coveragePct:
      dailySalesNeeded > 0
        ? (currentDailySales / dailySalesNeeded) * 100
        : fixedMonthly > 0
          ? 0
          : 100,
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
      accountId: entry.accountId,
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

  const occurrences = dueOccurrences(
    recurring,
    entries,
    undefined,
    balances?.postedPeriods,
  );
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
