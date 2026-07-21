// Everything that moves money and is not a sale: expenses, other income,
// transfers between pots, recurring obligations, money set aside, and the
// purchases that turn cash into stock.
//
// Two invariants live here rather than in the screens, because every screen
// would otherwise have to remember them:
//
//   1. Amounts are USD. A bolivar payment also records the bolivares and the
//      rate that valued them, stamped once, at write time. A later change to
//      the honest rate can then never restate what a past expense cost.
//   2. Definitions (accounts, categories, payees, rules) are data. Nothing here
//      or downstream may look one up by name - the shop renames them freely.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { toast } from "sonner";
import { useApp, RateKey } from "./app-context";
import * as offlineStore from "../utils/offlineStore";
import type {
  FinanceAccountRow,
  FinanceAllocationRow,
  FinanceCategoryRow,
  FinanceEntryRow,
  FinancePayeeRow,
  FinanceRecurringRow,
  ItemSupplierRow,
  PurchaseLineRow,
  PurchaseReturnRow,
  PurchaseRow,
} from "../utils/offlineStore";
import { supabase } from "../services/supabase";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type EntryKind = "income" | "expense" | "transfer";
export type EntryStatus = "paid" | "pending" | "void";
export type PaidIn = "USD" | "BS";
export type AccountKind = "cash" | "bank" | "digital" | "credit" | "other";
export type AccountBasis = "USD" | "BS";

/**
 * What a category IS, structurally. The name is the shop's business; this is
 * the app's, because the profit statement is built out of these buckets:
 *
 *   cogs       stock bought for resale - cash out now, cost when it sells
 *   fixed      owed whether or not anything sells (drives break-even)
 *   variable   scales with activity
 *   tax        owed to the state
 *   investment profit deliberately set aside, not consumed
 *   owner      money the owner took out - not a business cost
 */
export type CategoryNature =
  | "cogs"
  | "fixed"
  | "variable"
  | "tax"
  | "investment"
  | "owner"
  | "other";

export type PayeeKind =
  | "employee"
  | "supplier"
  | "landlord"
  | "service"
  | "government"
  | "customer"
  | "other";

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type AllocationBasis = "gross_sales" | "gross_profit" | "net_profit";

export interface FinanceAccount {
  id: string;
  name: string;
  kind: AccountKind;
  /** The currency the pot physically holds. Bolivares carry devaluation risk;
   *  dollars do not. Locked once the account has movements. */
  basis: AccountBasis;
  openingBalanceUsd: number;
  openingBalanceBs: number;
  active: boolean;
  sortOrder: number;
  /** Sale payment methods that land in this pot. Declared by the admin, so
   *  counter takings can be traced to a real balance instead of vanishing. */
  paymentMethods: string[];
  notes: string;
}

export interface FinanceCategory {
  id: string;
  name: string;
  kind: "income" | "expense";
  nature: CategoryNature;
  monthlyBudgetUsd: number | null;
  color: string | null;
  archived: boolean;
}

export interface FinancePayee {
  id: string;
  name: string;
  kind: PayeeKind;
  phone: string;
  /** Cédula or RIF. Blank until something formal needs it. */
  cedulaRif: string;
  notes: string;
  baseSalaryUsd: number | null;
  payCadence: "weekly" | "biweekly" | "monthly" | null;
  active: boolean;
}

export interface RecurringRule {
  id: string;
  name: string;
  kind: "income" | "expense";
  categoryId: string | null;
  accountId: string | null;
  payeeId: string | null;
  amountUsd: number;
  cadence: Cadence;
  anchorDate: string;
  endsOn: string | null;
  active: boolean;
  notes: string;
}

export interface Allocation {
  id: string;
  name: string;
  basis: AllocationBasis;
  percent: number;
  accountId: string | null;
  targetUsd: number | null;
  active: boolean;
  notes: string;
}

export interface FinanceEntry {
  id: string;
  kind: EntryKind;
  status: EntryStatus;
  /** ISO date (no time). The ledger thinks in days, not timestamps. */
  occurredOn: string;
  dueOn: string | null;
  categoryId: string | null;
  accountId: string | null;
  counterAccountId: string | null;
  payeeId: string | null;
  amountUsd: number;
  amountBs: number | null;
  rateUsed: number | null;
  rateKey: RateKey | null;
  paidIn: PaidIn;
  description: string;
  notes: string;
  tags: string[];
  attachments: string[];
  recurringId: string | null;
  periodKey: string | null;
  allocationId: string | null;
  createdBy: string;
  createdAt?: string;
}

export interface Purchase {
  id: string;
  supplierId: string | null;
  accountId: string | null;
  categoryId: string | null;
  occurredOn: string;
  dueOn: string | null;
  paymentStatus: "paid" | "pending";
  goodsUsd: number;
  freightUsd: number;
  prorateFreight: boolean;
  creditAppliedUsd: number;
  totalUsd: number;
  paidIn: PaidIn;
  invoiceNumber: string;
  notes: string;
  attachments: string[];
  entryId: string | null;
  status: "posted" | "void";
  createdBy: string;
}

export interface PurchaseLine {
  id: string;
  purchaseId: string;
  itemId: string | null;
  name: string;
  quantity: number;
  unitCostUsd: number;
  /** Unit cost after freight was spread across the invoice - what the stock
   *  really cost, and what gets written onto the item. */
  landedUnitCostUsd: number;
  quantityReturned: number;
}

export interface PurchaseReturn {
  id: string;
  purchaseId: string;
  supplierId: string | null;
  occurredOn: string;
  settlement: "credit" | "cash";
  accountId: string | null;
  entryId: string | null;
  totalUsd: number;
  reason: string;
  notes: string;
}

export interface ItemSupplier {
  id: string;
  itemId: string;
  supplierId: string;
  supplierSku: string;
  lastCostUsd: number | null;
  lastPurchasedOn: string | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** What a screen has to supply to record a movement. The rate provenance is
 *  not in here on purpose: the context stamps it, so no caller can forget. */
export interface EntryInput {
  kind: EntryKind;
  status?: EntryStatus;
  occurredOn: string;
  dueOn?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  counterAccountId?: string | null;
  payeeId?: string | null;
  amountUsd: number;
  paidIn?: PaidIn;
  /** Only when the user typed bolivares. Left out, it is derived at the honest
   *  rate, which is the same number the entry form was showing. */
  amountBs?: number | null;
  description?: string;
  notes?: string;
  tags?: string[];
  attachments?: string[];
  recurringId?: string | null;
  periodKey?: string | null;
  allocationId?: string | null;
}

/** A product the catalogue does not have yet. The server creates it as part of
 *  posting the purchase, so an abandoned basket leaves nothing behind. */
export interface NewProductInput {
  name: string;
  barcode: string;
  sellingPriceUsd: number;
  unit: string;
  type: string;
  brand: string;
  includesTaxes: boolean;
  discount: number;
}

export interface PurchaseLineInput {
  itemId: string | null;
  name: string;
  quantity: number;
  unitCostUsd: number;
  newProduct?: NewProductInput;
}

export interface PurchaseInput {
  supplierId: string | null;
  accountId: string | null;
  categoryId: string | null;
  occurredOn: string;
  dueOn?: string | null;
  paymentStatus: "paid" | "pending";
  freightUsd?: number;
  prorateFreight?: boolean;
  creditAppliedUsd?: number;
  paidIn?: PaidIn;
  amountBs?: number | null;
  invoiceNumber?: string;
  notes?: string;
  attachments?: string[];
}

export interface PurchaseReturnLineInput {
  purchaseLineId: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function mapAccount(row: FinanceAccountRow): FinanceAccount {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    basis: row.basis,
    openingBalanceUsd: num(row.opening_balance_usd),
    openingBalanceBs: num(row.opening_balance_bs),
    active: row.active,
    sortOrder: row.sort_order ?? 0,
    paymentMethods: row.payment_methods || [],
    notes: row.notes || "",
  };
}

function mapCategory(row: FinanceCategoryRow): FinanceCategory {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    nature: row.nature,
    monthlyBudgetUsd: numOrNull(row.monthly_budget_usd),
    color: row.color,
    archived: row.archived,
  };
}

function mapPayee(row: FinancePayeeRow): FinancePayee {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    phone: row.phone || "",
    cedulaRif: row.cedula_rif || "",
    notes: row.notes || "",
    baseSalaryUsd: numOrNull(row.base_salary_usd),
    payCadence: row.pay_cadence,
    active: row.active,
  };
}

function mapRecurring(row: FinanceRecurringRow): RecurringRule {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    categoryId: row.category_id,
    accountId: row.account_id,
    payeeId: row.payee_id,
    amountUsd: num(row.amount_usd),
    cadence: row.cadence,
    anchorDate: row.anchor_date,
    endsOn: row.ends_on,
    active: row.active,
    notes: row.notes || "",
  };
}

function mapAllocation(row: FinanceAllocationRow): Allocation {
  return {
    id: row.id,
    name: row.name,
    basis: row.basis,
    percent: num(row.percent),
    accountId: row.account_id,
    targetUsd: numOrNull(row.target_usd),
    active: row.active,
    notes: row.notes || "",
  };
}

function mapEntry(row: FinanceEntryRow): FinanceEntry {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    occurredOn: row.occurred_on,
    dueOn: row.due_on,
    categoryId: row.category_id,
    accountId: row.account_id,
    counterAccountId: row.counter_account_id,
    payeeId: row.payee_id,
    amountUsd: num(row.amount_usd),
    amountBs: numOrNull(row.amount_bs),
    rateUsed: numOrNull(row.rate_used),
    rateKey: row.rate_key,
    paidIn: row.paid_in,
    description: row.description || "",
    notes: row.notes || "",
    tags: row.tags || [],
    attachments: row.attachments || [],
    recurringId: row.recurring_id,
    periodKey: row.period_key,
    allocationId: row.allocation_id,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
  };
}

function mapPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    accountId: row.account_id,
    categoryId: row.category_id,
    occurredOn: row.occurred_on,
    dueOn: row.due_on,
    paymentStatus: row.payment_status,
    goodsUsd: num(row.goods_usd),
    freightUsd: num(row.freight_usd),
    prorateFreight: row.prorate_freight,
    creditAppliedUsd: num(row.credit_applied_usd),
    totalUsd: num(row.total_usd),
    paidIn: row.paid_in,
    invoiceNumber: row.invoice_number || "",
    notes: row.notes || "",
    attachments: row.attachments || [],
    entryId: row.entry_id,
    status: row.status,
    createdBy: row.created_by || "",
  };
}

function mapPurchaseLine(row: PurchaseLineRow): PurchaseLine {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    itemId: row.item_id,
    name: row.name,
    quantity: num(row.quantity),
    unitCostUsd: num(row.unit_cost_usd),
    landedUnitCostUsd: num(row.landed_unit_cost_usd),
    quantityReturned: num(row.quantity_returned),
  };
}

function mapPurchaseReturn(row: PurchaseReturnRow): PurchaseReturn {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    supplierId: row.supplier_id,
    occurredOn: row.occurred_on,
    settlement: row.settlement,
    accountId: row.account_id,
    entryId: row.entry_id,
    totalUsd: num(row.total_usd),
    reason: row.reason || "",
    notes: row.notes || "",
  };
}

function mapItemSupplier(row: ItemSupplierRow): ItemSupplier {
  return {
    id: row.id,
    itemId: row.item_id,
    supplierId: row.supplier_id,
    supplierSku: row.supplier_sku || "",
    lastCostUsd: numOrNull(row.last_cost_usd),
    lastPurchasedOn: row.last_purchased_on,
    notes: row.notes || "",
  };
}

/** Categories are matched on exact name by the database's uniqueness rule, so
 *  they are normalized the same way inventory text is. */
function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface FinanceContextType {
  loading: boolean;
  offline: boolean;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  payees: FinancePayee[];
  recurring: RecurringRule[];
  allocations: Allocation[];
  entries: FinanceEntry[];
  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  purchaseReturns: PurchaseReturn[];
  itemSuppliers: ItemSupplier[];

  refreshFinance: () => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;

  addEntry: (input: EntryInput, user: string) => Promise<void>;
  updateEntry: (id: string, input: Partial<EntryInput>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  /** Marks a pending obligation as settled, from a specific pot, on a date. */
  settleEntry: (
    id: string,
    accountId: string | null,
    occurredOn: string,
  ) => Promise<void>;

  saveAccount: (input: Partial<FinanceAccount>, id?: string) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  saveCategory: (input: Partial<FinanceCategory>, id?: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  savePayee: (input: Partial<FinancePayee>, id?: string) => Promise<void>;
  deletePayee: (id: string) => Promise<void>;
  saveRecurring: (input: Partial<RecurringRule>, id?: string) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  saveAllocation: (input: Partial<Allocation>, id?: string) => Promise<void>;
  deleteAllocation: (id: string) => Promise<void>;

  createPurchase: (
    input: PurchaseInput,
    lines: PurchaseLineInput[],
    user: string,
  ) => Promise<void>;
  returnPurchase: (
    purchaseId: string,
    lines: PurchaseReturnLineInput[],
    options: {
      settlement: "credit" | "cash";
      accountId: string | null;
      reason: string;
      notes?: string;
      occurredOn?: string;
    },
    user: string,
  ) => Promise<void>;

  linkSupplier: (
    itemId: string,
    supplierId: string,
    supplierSku?: string,
  ) => Promise<void>;
  unlinkSupplier: (id: string) => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

/** How much of the ledger to hold at once. Extended by "cargar más". */
const PAGE_SIZE = 400;
const PURCHASE_PAGE_SIZE = 200;

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { honestRate, honestRateKey, usdToBs, refreshData } = useApp();

  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [payees, setPayees] = useState<FinancePayee[]>([]);
  const [recurring, setRecurring] = useState<RecurringRule[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [itemSuppliers, setItemSuppliers] = useState<ItemSupplier[]>([]);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadLedger = useCallback(async (limit: number) => {
    const { rows, hasMore: more, offline: isOffline } =
      await offlineStore.fetchFinanceEntries(limit);
    setEntries(rows.map(mapEntry));
    setHasMore(more);
    setOffline(isOffline);
    return isOffline;
  }, []);

  const refreshFinance = useCallback(async () => {
    try {
      const { catalog, offline: catalogOffline } =
        await offlineStore.fetchFinanceCatalog();
      setAccounts(catalog.accounts.map(mapAccount));
      setCategories(catalog.categories.map(mapCategory));
      setPayees(catalog.payees.map(mapPayee));
      setRecurring(catalog.recurring.map(mapRecurring));
      setAllocations(catalog.allocations.map(mapAllocation));

      const ledgerOffline = await loadLedger(pageSize);

      // Purchases are an admin screen and need their lines to say anything, so
      // they are not cached for offline reading. A failure here must not stop
      // the ledger from rendering.
      if (!catalogOffline && !ledgerOffline) {
        try {
          const purchaseData = await offlineStore.fetchPurchases(PURCHASE_PAGE_SIZE);
          setPurchases(purchaseData.purchases.map(mapPurchase));
          setPurchaseLines(purchaseData.lines.map(mapPurchaseLine));
          setPurchaseReturns(purchaseData.returns.map(mapPurchaseReturn));
          setItemSuppliers((await offlineStore.fetchItemSuppliers()).map(mapItemSupplier));
        } catch (e) {
          console.error("Failed to load purchases", e);
        }
      }
    } catch (e) {
      console.error("Failed to load finance data", e);
    } finally {
      setLoading(false);
    }
  }, [loadLedger, pageSize]);

  useEffect(() => {
    refreshFinance();

    // The first fetch runs before authentication, and RLS returns nothing until
    // a session exists - without this the module looks empty until a reload.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") refreshFinance();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = pageSize + PAGE_SIZE;
    setPageSize(next);
    try {
      await loadLedger(next);
    } finally {
      setLoadingMore(false);
    }
  };

  // --- Ledger ---------------------------------------------------------------

  /**
   * Stamps the bolivar provenance. Called on every write, so no screen can
   * record a bolivar payment without saying what it was worth at the time.
   */
  const withRate = (input: EntryInput) => {
    const paidIn: PaidIn = input.paidIn ?? "USD";
    if (paidIn === "USD") {
      return { paidIn, amountBs: null, rateUsed: null, rateKey: null };
    }
    return {
      paidIn,
      amountBs: input.amountBs ?? usdToBs(input.amountUsd),
      rateUsed: honestRate,
      rateKey: honestRateKey,
    };
  };

  const addEntry = async (input: EntryInput, user: string) => {
    const rate = withRate(input);
    const row: FinanceEntryRow = {
      id: crypto.randomUUID(),
      kind: input.kind,
      status: input.status ?? "paid",
      occurred_on: input.occurredOn,
      due_on: input.dueOn ?? null,
      category_id: input.kind === "transfer" ? null : (input.categoryId ?? null),
      account_id: input.accountId ?? null,
      counter_account_id:
        input.kind === "transfer" ? (input.counterAccountId ?? null) : null,
      payee_id: input.payeeId ?? null,
      amount_usd: input.amountUsd,
      amount_bs: rate.amountBs,
      rate_used: rate.rateUsed,
      rate_key: rate.rateKey,
      paid_in: rate.paidIn,
      description: input.description ?? "",
      notes: input.notes ?? "",
      tags: input.tags ?? [],
      attachments: input.attachments ?? [],
      recurring_id: input.recurringId ?? null,
      period_key: input.periodKey ?? null,
      allocation_id: input.allocationId ?? null,
      created_by: user,
      created_at: new Date().toISOString(),
    };

    try {
      const { queued } = await offlineStore.createFinanceEntry(row);
      setEntries((prev) => [mapEntry(row), ...prev]);
      toast.success(
        queued ? "Movimiento guardado localmente (sin conexión)" : "Movimiento registrado",
      );
    } catch (e) {
      console.error(e);
      // A duplicate occurrence is the expected outcome when two devices post
      // the same recurring bill, not a failure worth alarming anyone about.
      const message = (e as { code?: string })?.code;
      toast.error(
        message === "23505"
          ? "Ese movimiento ya estaba registrado"
          : "Error al registrar el movimiento",
      );
    }
  };

  const updateEntry = async (id: string, input: Partial<EntryInput>) => {
    const current = entries.find((e) => e.id === id);
    if (!current) return;

    const merged: EntryInput = {
      kind: input.kind ?? current.kind,
      occurredOn: input.occurredOn ?? current.occurredOn,
      amountUsd: input.amountUsd ?? current.amountUsd,
      paidIn: input.paidIn ?? current.paidIn,
      amountBs: input.amountBs,
    };
    // Re-stamp only when the money itself changed. Editing a note must not
    // silently re-value an old expense at today's rate.
    const moneyChanged =
      input.amountUsd !== undefined || input.paidIn !== undefined;
    const rate = moneyChanged
      ? withRate(merged)
      : {
          paidIn: current.paidIn,
          amountBs: current.amountBs,
          rateUsed: current.rateUsed,
          rateKey: current.rateKey,
        };

    const row: Partial<FinanceEntryRow> = {
      status: input.status,
      occurred_on: input.occurredOn,
      due_on: input.dueOn,
      category_id: input.categoryId,
      account_id: input.accountId,
      counter_account_id: input.counterAccountId,
      payee_id: input.payeeId,
      amount_usd: input.amountUsd,
      description: input.description,
      notes: input.notes,
      tags: input.tags,
      attachments: input.attachments,
      allocation_id: input.allocationId,
      amount_bs: rate.amountBs,
      rate_used: rate.rateUsed,
      rate_key: rate.rateKey,
      paid_in: rate.paidIn,
      updated_at: new Date().toISOString(),
    };
    // Undefined keys would blank columns the caller never mentioned.
    for (const key of Object.keys(row) as (keyof FinanceEntryRow)[]) {
      if (row[key] === undefined) delete row[key];
    }

    try {
      await offlineStore.updateFinanceEntry(id, row);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                ...input,
                amountBs: rate.amountBs,
                rateUsed: rate.rateUsed,
                rateKey: rate.rateKey,
                paidIn: rate.paidIn,
              }
            : e,
        ),
      );
      toast.success("Movimiento actualizado");
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar el movimiento");
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      await offlineStore.deleteFinanceEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Movimiento eliminado");
    } catch (e) {
      console.error(e);
      toast.error("Error al eliminar");
    }
  };

  const settleEntry = async (
    id: string,
    accountId: string | null,
    occurredOn: string,
  ) => {
    await updateEntry(id, { status: "paid", accountId, occurredOn });
  };

  // --- Definitions ----------------------------------------------------------
  // Admin-only on the server. These write straight through: editing the chart
  // of accounts offline would let two devices invent the same category twice.

  const requireOnline = (): boolean => {
    if (offlineStore.isOnline()) return true;
    toast.error("Necesitas conexión para editar cuentas, categorías o reglas");
    return false;
  };

  async function upsert<T>(
    table: string,
    row: Record<string, unknown>,
    id: string | undefined,
    label: string,
  ): Promise<T | null> {
    if (!requireOnline()) return null;
    try {
      const query = id
        ? supabase.from(table).update(row).eq("id", id).select().single()
        : supabase.from(table).insert(row).select().single();
      const { data, error } = await query;
      if (error) throw error;
      toast.success(label);
      return data as T;
    } catch (e) {
      console.error(e);
      const code = (e as { code?: string })?.code;
      toast.error(
        code === "23505" ? "Ya existe uno con ese nombre" : "No se pudo guardar",
      );
      return null;
    }
  }

  async function remove(table: string, id: string, label: string) {
    if (!requireOnline()) return;
    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      toast.success(label);
    } catch (e) {
      console.error(e);
      // The foreign keys are ON DELETE SET NULL, so this is almost always a
      // permission problem rather than a reference one.
      toast.error("No se pudo eliminar. Archívalo en su lugar.");
    }
  }

  const saveAccount = async (input: Partial<FinanceAccount>, id?: string) => {
    const row = {
      name: input.name?.trim(),
      kind: input.kind,
      basis: input.basis,
      opening_balance_usd: input.openingBalanceUsd,
      opening_balance_bs: input.openingBalanceBs,
      active: input.active,
      sort_order: input.sortOrder,
      payment_methods: input.paymentMethods,
      notes: input.notes,
    };
    const saved = await upsert<FinanceAccountRow>(
      "finance_accounts",
      stripUndefined(row),
      id,
      id ? "Cuenta actualizada" : "Cuenta creada",
    );
    if (saved) await refreshFinance();
  };

  const deleteAccount = async (id: string) => {
    await remove("finance_accounts", id, "Cuenta eliminada");
    await refreshFinance();
  };

  const saveCategory = async (input: Partial<FinanceCategory>, id?: string) => {
    const row = {
      name: input.name ? normalizeName(input.name) : undefined,
      kind: input.kind,
      nature: input.nature,
      monthly_budget_usd: input.monthlyBudgetUsd,
      color: input.color,
      archived: input.archived,
    };
    const saved = await upsert<FinanceCategoryRow>(
      "finance_categories",
      stripUndefined(row),
      id,
      id ? "Categoría actualizada" : "Categoría creada",
    );
    if (saved) await refreshFinance();
  };

  const deleteCategory = async (id: string) => {
    await remove("finance_categories", id, "Categoría eliminada");
    await refreshFinance();
  };

  const savePayee = async (input: Partial<FinancePayee>, id?: string) => {
    const row = {
      name: input.name?.trim(),
      kind: input.kind,
      phone: input.phone,
      cedula_rif: input.cedulaRif,
      notes: input.notes,
      base_salary_usd: input.baseSalaryUsd,
      pay_cadence: input.payCadence,
      active: input.active,
    };
    const saved = await upsert<FinancePayeeRow>(
      "finance_payees",
      stripUndefined(row),
      id,
      id ? "Contacto actualizado" : "Contacto creado",
    );
    if (saved) await refreshFinance();
  };

  const deletePayee = async (id: string) => {
    await remove("finance_payees", id, "Contacto eliminado");
    await refreshFinance();
  };

  const saveRecurring = async (input: Partial<RecurringRule>, id?: string) => {
    const row = {
      name: input.name?.trim(),
      kind: input.kind,
      category_id: input.categoryId,
      account_id: input.accountId,
      payee_id: input.payeeId,
      amount_usd: input.amountUsd,
      cadence: input.cadence,
      anchor_date: input.anchorDate,
      ends_on: input.endsOn,
      active: input.active,
      notes: input.notes,
    };
    const saved = await upsert<FinanceRecurringRow>(
      "finance_recurring",
      stripUndefined(row),
      id,
      id ? "Regla actualizada" : "Regla creada",
    );
    if (saved) await refreshFinance();
  };

  const deleteRecurring = async (id: string) => {
    await remove("finance_recurring", id, "Regla eliminada");
    await refreshFinance();
  };

  const saveAllocation = async (input: Partial<Allocation>, id?: string) => {
    const row = {
      name: input.name?.trim(),
      basis: input.basis,
      percent: input.percent,
      account_id: input.accountId,
      target_usd: input.targetUsd,
      active: input.active,
      notes: input.notes,
    };
    const saved = await upsert<FinanceAllocationRow>(
      "finance_allocations",
      stripUndefined(row),
      id,
      id ? "Asignación actualizada" : "Asignación creada",
    );
    if (saved) await refreshFinance();
  };

  const deleteAllocation = async (id: string) => {
    await remove("finance_allocations", id, "Asignación eliminada");
    await refreshFinance();
  };

  // --- Purchases ------------------------------------------------------------

  const createPurchase = async (
    input: PurchaseInput,
    lines: PurchaseLineInput[],
    user: string,
  ) => {
    if (lines.length === 0) {
      toast.error("La compra no tiene líneas");
      return;
    }

    const goods = lines.reduce((s, l) => s + l.quantity * l.unitCostUsd, 0);
    const total = Math.max(
      goods + (input.freightUsd ?? 0) - (input.creditAppliedUsd ?? 0),
      0,
    );
    const paidIn = input.paidIn ?? "USD";

    try {
      const { queued } = await offlineStore.postPurchase(
        {
          id: crypto.randomUUID(),
          supplier_id: input.supplierId,
          account_id: input.accountId,
          category_id: input.categoryId,
          occurred_on: input.occurredOn,
          due_on: input.dueOn ?? null,
          payment_status: input.paymentStatus,
          freight_usd: input.freightUsd ?? 0,
          prorate_freight: input.prorateFreight ?? true,
          credit_applied_usd: input.creditAppliedUsd ?? 0,
          paid_in: paidIn,
          // Same provenance rule as the ledger: bolivares are recorded with
          // the rate that valued them, once, at write time.
          amount_bs: paidIn === "BS" ? (input.amountBs ?? usdToBs(total)) : null,
          rate_used: paidIn === "BS" ? honestRate : null,
          rate_key: paidIn === "BS" ? honestRateKey : null,
          invoice_number: input.invoiceNumber ?? "",
          notes: input.notes ?? "",
          attachments: input.attachments ?? [],
          created_by: user,
        },
        lines.map((l) => ({
          item_id: l.itemId,
          name: l.name,
          quantity: l.quantity,
          unit_cost_usd: l.unitCostUsd,
          // The id is minted here so a queued purchase creates the same product
          // whenever it replays, instead of a second copy.
          new_item: l.newProduct
            ? {
                id: crypto.randomUUID(),
                name: normalizeName(l.newProduct.name),
                barcode: normalizeName(l.newProduct.barcode),
                selling_price_usd: l.newProduct.sellingPriceUsd,
                unit: l.newProduct.unit,
                type: normalizeName(l.newProduct.type || "UNASSIGNED"),
                brand: normalizeName(l.newProduct.brand || "GENERIC"),
                includes_taxes: l.newProduct.includesTaxes,
                discount: l.newProduct.discount,
              }
            : undefined,
        })),
      );

      const created = lines.filter((l) => l.newProduct).length;
      toast.success(
        queued
          ? "Compra guardada localmente (sin conexión). El stock se ajustará al sincronizar."
          : created > 0
            ? `Compra registrada. ${created} producto(s) nuevo(s) creado(s).`
            : "Compra registrada. Stock y costos actualizados.",
      );
      if (!queued) {
        await Promise.all([refreshFinance(), refreshData()]);
      }
    } catch (e) {
      console.error(e);
      const message = (e as { message?: string })?.message ?? "";
      toast.error(
        message.includes("NOT_AUTHORIZED")
          ? "Solo un administrador puede registrar compras"
          : message.includes("ITEM_NOT_FOUND")
            ? "Uno de los productos ya no existe"
            : "Error al registrar la compra",
      );
    }
  };

  const returnPurchase = async (
    purchaseId: string,
    lines: PurchaseReturnLineInput[],
    options: {
      settlement: "credit" | "cash";
      accountId: string | null;
      reason: string;
      notes?: string;
      occurredOn?: string;
    },
    user: string,
  ) => {
    if (lines.length === 0) {
      toast.error("No seleccionaste nada que devolver");
      return;
    }
    try {
      const { queued } = await offlineStore.postPurchaseReturn(
        {
          id: crypto.randomUUID(),
          purchase_id: purchaseId,
          occurred_on: options.occurredOn ?? todayIso(),
          settlement: options.settlement,
          account_id: options.accountId,
          reason: options.reason,
          notes: options.notes ?? "",
          created_by: user,
        },
        lines.map((l) => ({
          purchase_line_id: l.purchaseLineId,
          quantity: l.quantity,
        })),
      );

      toast.success(
        queued
          ? "Devolución guardada localmente (sin conexión)"
          : options.settlement === "credit"
            ? "Devolución registrada. Queda como crédito con el proveedor."
            : "Devolución registrada y reembolso ingresado.",
      );
      if (!queued) {
        await Promise.all([refreshFinance(), refreshData()]);
      }
    } catch (e) {
      console.error(e);
      const message = (e as { message?: string })?.message ?? "";
      toast.error(
        message.includes("RETURN_EXCEEDS_PURCHASED")
          ? "La devolución supera lo comprado"
          : message.includes("INSUFFICIENT_STOCK")
            ? "No hay stock suficiente: parte ya se vendió"
            : "Error al procesar la devolución",
      );
    }
  };

  const linkSupplier = async (
    itemId: string,
    supplierId: string,
    supplierSku = "",
  ) => {
    if (!requireOnline()) return;
    try {
      const { error } = await supabase
        .from("item_suppliers")
        .upsert(
          { item_id: itemId, supplier_id: supplierId, supplier_sku: supplierSku },
          { onConflict: "item_id,supplier_id" },
        );
      if (error) throw error;
      setItemSuppliers((await offlineStore.fetchItemSuppliers()).map(mapItemSupplier));
      toast.success("Proveedor vinculado");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo vincular el proveedor");
    }
  };

  const unlinkSupplier = async (id: string) => {
    await remove("item_suppliers", id, "Proveedor desvinculado");
    try {
      setItemSuppliers((await offlineStore.fetchItemSuppliers()).map(mapItemSupplier));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <FinanceContext.Provider
      value={{
        loading,
        offline,
        accounts,
        categories,
        payees,
        recurring,
        allocations,
        entries,
        purchases,
        purchaseLines,
        purchaseReturns,
        itemSuppliers,
        refreshFinance,
        hasMore,
        loadingMore,
        loadMore,
        addEntry,
        updateEntry,
        deleteEntry,
        settleEntry,
        saveAccount,
        deleteAccount,
        saveCategory,
        deleteCategory,
        savePayee,
        deletePayee,
        saveRecurring,
        deleteRecurring,
        saveAllocation,
        deleteAllocation,
        createPurchase,
        returnPurchase,
        linkSupplier,
        unlinkSupplier,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}

/** Drops keys the caller left out, so a partial edit cannot blank a column. */
function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (context === undefined) {
    throw new Error("useFinance must be used within a FinanceProvider");
  }
  return context;
}
