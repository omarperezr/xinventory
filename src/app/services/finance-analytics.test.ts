// Runnable check for the money rules in finance-analytics that are easy to
// break and expensive to get wrong. Run with `npm test`.
//
// Every case here failed before the fix it names; none of them is a style
// preference. Assertions only, no framework.

import assert from "node:assert/strict";
import { buildFinanceReport, dueOccurrences, type FinanceInput } from "./finance-analytics.ts";
import type {
  FinanceAccount,
  FinanceBalances,
  FinanceEntry,
  RecurringRule,
} from "../context/finance-context.tsx";

const day = (iso: string) => new Date(`${iso}T12:00:00`);

function input(over: Partial<FinanceInput> = {}): FinanceInput {
  return {
    entries: [],
    categories: [],
    accounts: [],
    payees: [],
    allocations: [],
    recurring: [],
    purchases: [],
    purchaseLines: [],
    purchaseReturns: [],
    transactions: [],
    items: [],
    range: { from: day("2026-07-01"), to: day("2026-07-31"), days: 31 },
    honestRate: 50,
    balances: null,
    ...over,
  };
}

function entry(over: Partial<FinanceEntry>): FinanceEntry {
  return {
    id: crypto.randomUUID(),
    kind: "expense",
    status: "paid",
    occurredOn: "2026-07-10",
    dueOn: null,
    categoryId: null,
    accountId: null,
    counterAccountId: null,
    payeeId: null,
    amountUsd: 100,
    amountBs: null,
    rateUsed: null,
    rateKey: null,
    paidIn: "USD",
    description: "",
    notes: "",
    tags: [],
    attachments: [],
    recurringId: null,
    periodKey: null,
    allocationId: null,
    createdBy: "",
    ...over,
  };
}

function account(over: Partial<FinanceAccount>): FinanceAccount {
  return {
    id: crypto.randomUUID(),
    name: "CAJA",
    kind: "cash",
    basis: "USD",
    openingBalanceUsd: 0,
    openingBalanceBs: 0,
    active: true,
    sortOrder: 0,
    paymentMethods: [],
    notes: "",
    ...over,
  };
}

function rule(over: Partial<RecurringRule>): RecurringRule {
  return {
    id: crypto.randomUUID(),
    name: "ALQUILER",
    kind: "expense",
    categoryId: null,
    accountId: null,
    payeeId: null,
    amountUsd: 100,
    cadence: "monthly",
    anchorDate: "2026-01-01",
    endsOn: null,
    active: true,
    notes: "",
    ...over,
  };
}

const balances = (over: Partial<FinanceBalances> = {}): FinanceBalances => ({
  accounts: [],
  methods: [],
  postedPeriods: [],
  ...over,
});

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed++;
  void name;
};

// --- break-even ------------------------------------------------------------

check("a shop with no fixed costs has covered them, not failed to", () => {
  const report = buildFinanceReport(input());
  assert.equal(report.breakEven.fixedMonthly, 0);
  // 0/0 read as 0% put a red "por debajo del punto de equilibrio" alert on a
  // shop that owes nothing every single month.
  assert.equal(report.breakEven.coveragePct, 100);
  assert.equal(
    report.alerts.some((a) => a.id === "breakeven"),
    false,
  );
});

// --- category breakdown ----------------------------------------------------

check("uncategorised income is not counted as spending", () => {
  const report = buildFinanceReport(
    input({
      entries: [
        entry({ kind: "income", amountUsd: 500, categoryId: null }),
        entry({ kind: "expense", amountUsd: 200, categoryId: null }),
      ],
    }),
  );
  const expense = report.categories.filter((c) => c.kind === "expense");
  const income = report.categories.filter((c) => c.kind === "income");
  // Both fell into one shared "" bucket that defaulted to expense, reporting
  // $700 of spending against $200 actually spent.
  assert.equal(
    expense.reduce((s, c) => s + c.amount, 0),
    200,
  );
  assert.equal(
    income.reduce((s, c) => s + c.amount, 0),
    500,
  );
});

// --- stamped rates ---------------------------------------------------------

check("a bolivar pot values a dollar movement at the rate it stamped", () => {
  const pot = account({ basis: "BS" });
  const report = buildFinanceReport(
    input({
      accounts: [pot],
      honestRate: 300, // today's rate, far from the stamped one
      entries: [
        entry({
          kind: "income",
          accountId: pot.id,
          amountUsd: 100,
          paidIn: "USD",
          rateUsed: 40,
        }),
      ],
    }),
  );
  // Today's rate would show 30 000 Bs sitting in a drawer that only ever
  // received 4 000, and would hide the devaluation since.
  assert.equal(report.accounts[0].balanceBs, 4000);
});

check("counter takings land in a bolivar pot at each sale's stamped rate", () => {
  const pot = account({ basis: "BS", paymentMethods: ["efectivo"] });
  const report = buildFinanceReport(
    input({
      accounts: [pot],
      honestRate: 300,
      balances: balances({
        // $18 kept at a stamped 40, plus $10 from a sale that stamped nothing.
        methods: [
          { method: "efectivo", keptUsd: 28, keptBs: 720, keptUsdAtRate: 10 },
        ],
      }),
    }),
  );
  assert.equal(report.accounts[0].balanceBs, 720 + 10 * 300);
});

// --- recurring occurrences -------------------------------------------------

const oldRule = rule({ anchorDate: "2026-01-01" });
const today = day("2026-07-15");

check("an occurrence settled outside the loaded page is not proposed again", () => {
  const settled = { recurringId: oldRule.id, periodKey: "2026-01-01" };
  // The page only reaches back to July; January fell out of it long ago.
  const page = [entry({ occurredOn: "2026-07-01" })];

  const withServer = dueOccurrences([oldRule], page, today, [settled]);
  assert.equal(
    withServer.some((o) => o.periodKey === settled.periodKey),
    false,
    "the server said this one is posted",
  );
  // Everything since January that genuinely has not been posted still shows.
  assert.ok(withServer.length > 0);
});

check("without the server list, nothing older than the page is judged", () => {
  const page = [entry({ occurredOn: "2026-07-01" })];
  const windowOnly = dueOccurrences([oldRule], page, today);
  // "No matching row" means "posted outside the page" here, not "never paid".
  assert.equal(
    windowOnly.some((o) => o.periodKey < "2026-07-01"),
    false,
  );
});

check("an empty ledger still proposes every occurrence since the anchor", () => {
  const fresh = dueOccurrences([oldRule], [], today);
  assert.equal(fresh.length, 7); // January through July
});

console.log(`finance-analytics: ${passed} cases passed`);
