import { useMemo } from "react";
import { useHistory } from "../context/history-context";
import { useApp } from "../context/app-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Award,
  AlertCircle,
  AlertTriangle,
  DollarSign,
  ShoppingBag,
  Users,
  Package,
  Wallet,
  CreditCard,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { format } from "date-fns";
import type { ReportData } from "../services/report-export";

// jspdf + xlsx are heavy; load them only when an export button is clicked.
const exportReportPdf = async (data: ReportData) =>
  (await import("../services/report-export")).exportReportPdf(data);
const exportReportExcel = async (data: ReportData) =>
  (await import("../services/report-export")).exportReportExcel(data);

const CHART_COLORS = [
  "#2196F3",
  "#4CAF50",
  "#FF9800",
  "#E91E63",
  "#9C27B0",
  "#00BCD4",
];

const CustomBarTooltip = ({
  active,
  payload,
  label,
  formatPrice,
  isRevenue,
}: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-lg text-xs">
        <p className="font-semibold text-gray-800 mb-1 max-w-[140px] truncate">
          {payload[0]?.payload?.fullName || label}
        </p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color || entry.fill }}>
            {isRevenue ? formatPrice(entry.value) : `${entry.value} unidades`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CustomAreaTooltip = ({ active, payload, label, formatPrice }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-lg text-xs">
        <p className="text-gray-500 mb-1">{label}</p>
        <p className="font-semibold text-primary">
          {formatPrice(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export function ReportsView() {
  const { transactions } = useHistory();
  const { formatPrice, items, convertPrice, currencySymbol } = useApp();

  // ── Aggregations ──────────────────────────────────────────────────────
  // Memoized: this walks every transaction and every line item, and without
  // it the whole pipeline (plus several sorts) re-ran on every render.
  const aggregates = useMemo(() => {
  const itemSales: Record<
    string,
    { name: string; quantity: number; total: number; cost: number }
  > = {};
  const userSales: Record<string, { total: number; count: number }> = {};
  // Keyed by sortable ISO day so the trend can be ordered chronologically;
  // `label` is the human-readable form shown on the axis.
  const dailySales: Record<string, { label: string; total: number }> = {};
  const paymentMethodTotals: Record<string, number> = {};

  const buyingPriceById = new Map(items.map((i) => [i.id, i.buyingPrice]));

  transactions.forEach((t) => {
    if (!userSales[t.userId]) userSales[t.userId] = { total: 0, count: 0 };
    userSales[t.userId].total += t.total;
    userSales[t.userId].count += 1;

    // A malformed date must not take down the entire reports screen.
    const parsedDate = new Date(t.date);
    if (!Number.isNaN(parsedDate.getTime())) {
      const key = format(parsedDate, "yyyy-MM-dd");
      const label = format(parsedDate, "dd/MM");
      if (!dailySales[key]) dailySales[key] = { label, total: 0 };
      dailySales[key].total += t.total;
    }

    t.items.forEach((item) => {
      // Net of returns so reports reflect what was actually kept/sold.
      const netQty = item.cartQuantity - (item.quantityReturned || 0);
      if (netQty <= 0) return;
      if (!itemSales[item.id])
        itemSales[item.id] = {
          name: item.name,
          quantity: 0,
          total: 0,
          cost: 0,
        };
      itemSales[item.id].quantity += netQty;
      itemSales[item.id].total += netQty * item.sellingPrice;
      const buyingPrice = buyingPriceById.get(item.id) ?? 0;
      itemSales[item.id].cost += netQty * buyingPrice;
    });

    t.payments?.forEach((p) => {
      paymentMethodTotals[p.method] = (paymentMethodTotals[p.method] || 0) + p.amount;
    });
  });

  const sortedItems = Object.values(itemSales).sort(
    (a, b) => b.quantity - a.quantity,
  );
  const sortedUsers = Object.entries(userSales).sort(
    ([, a], [, b]) => b.total - a.total,
  );
  const sortedByProfit = Object.values(itemSales)
    .map((i) => ({ ...i, profit: i.total - i.cost }))
    .sort((a, b) => b.profit - a.profit);

  const mostSoldItem = sortedItems[0];
  const leastSoldItem = sortedItems[sortedItems.length - 1];
  const bestSeller = sortedUsers[0];
  const worstSeller = sortedUsers[sortedUsers.length - 1];

  const totalRevenue = transactions.reduce((s, t) => s + t.total, 0);
  const totalCost = Object.values(itemSales).reduce((s, i) => s + i.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const totalTransactions = transactions.length;
  const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // ── Current business situation indicators (live inventory, not sales) ──
  const inventoryCost = items.reduce(
    (sum, i) => sum + i.buyingPrice * i.quantity,
    0,
  );
  const lowStockItems = items
    .filter((i) => i.quantity > 0 && i.quantity < 10)
    .sort((a, b) => a.quantity - b.quantity);
  const outOfStockItems = items.filter((i) => i.quantity === 0);

  const paymentMethodData = Object.entries(paymentMethodTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([method, total], i) => ({
      method,
      total,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));

  // ── Chart datasets ────────────────────────────────────────────────────
  const shorten = (name: string, max = 10) =>
    name.length > max ? name.slice(0, max) + "…" : name;

  const topRevenueData = Object.values(itemSales)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((item) => ({
      name: shorten(item.name),
      fullName: item.name,
      revenue: parseFloat(item.total.toFixed(2)),
    }));

  const topUnitsData = sortedItems.slice(0, 6).map((item) => ({
    name: shorten(item.name),
    fullName: item.name,
    units: item.quantity,
  }));

  // Sort chronologically BEFORE taking the last 10. Transactions arrive
  // newest-first, so slicing insertion order returned the OLDEST ten days
  // while the chart claimed to show the recent trend.
  const dailySalesData = Object.keys(dailySales)
    .sort()
    .slice(-10)
    .map((key) => ({
      day: dailySales[key].label,
      total: parseFloat(dailySales[key].total.toFixed(2)),
    }));

  const userSalesData = sortedUsers.map(([userId, data], i) => ({
    name: userId.split(" ")[0],
    fullName: userId,
    total: parseFloat(data.total.toFixed(2)),
    count: data.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  // Computed once and reused instead of re-sorting itemSales at each use site.
  const itemSalesByRevenue = Object.values(itemSales).sort(
    (a, b) => b.total - a.total,
  );
  const maxItemTotal = itemSalesByRevenue[0]?.total ?? 0;

    return {
      itemSales,
      sortedItems,
      sortedUsers,
      sortedByProfit,
      itemSalesByRevenue,
      maxItemTotal,
      mostSoldItem,
      leastSoldItem,
      bestSeller,
      worstSeller,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      totalTransactions,
      avgTicket,
      inventoryCost,
      lowStockItems,
      outOfStockItems,
      paymentMethodData,
      topRevenueData,
      topUnitsData,
      dailySalesData,
      userSalesData,
    };
  }, [transactions, items]);

  const {
    itemSales,
    sortedItems,
    sortedUsers,
    sortedByProfit,
    itemSalesByRevenue,
    maxItemTotal,
    mostSoldItem,
    leastSoldItem,
    bestSeller,
    worstSeller,
    totalRevenue,
    totalCost,
    totalProfit,
    profitMargin,
    totalTransactions,
    avgTicket,
    inventoryCost,
    lowStockItems,
    outOfStockItems,
    paymentMethodData,
    topRevenueData,
    topUnitsData,
    dailySalesData,
    userSalesData,
  } = aggregates;

  // ── Empty state ────────────────────────────────────────────────────────
  const hasData = transactions.length > 0;

  // ── Downloadable report (PDF / Excel) ──────────────────────────────────
  const buildReportData = (): ReportData => ({
    transactions,
    symbol: currencySymbol,
    convert: convertPrice,
    itemSales: itemSalesByRevenue,
    userSales: sortedUsers.map(([user, d]) => ({
      user,
      total: d.total,
      count: d.count,
    })),
    paymentMethodTotals: paymentMethodData.map((p) => ({
      method: p.method,
      total: p.total,
    })),
    totals: {
      revenue: totalRevenue,
      cost: totalCost,
      profit: totalProfit,
      margin: profitMargin,
      transactions: totalTransactions,
      avgTicket,
    },
  });

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-medium text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            Reportes y Estadísticas
          </h2>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            Análisis de rendimiento basado en el historial de transacciones.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={!hasData}
            onClick={() => exportReportPdf(buildReportData())}
          >
            <FileText className="w-4 h-4 mr-1.5 text-red-500" />
            Descargar PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={!hasData}
            onClick={() => exportReportExcel(buildReportData())}
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-green-600" />
            Descargar Excel
          </Button>
        </div>
      </div>

      {/* ── KPI summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Ingresos Totales
              </p>
              <DollarSign className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-green-600 truncate">
              {formatPrice(totalRevenue)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Transacciones
              </p>
              <ShoppingBag className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold">
              {totalTransactions}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Más Vendido
              </p>
              <TrendingUp className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            </div>
            <p className="text-sm md:text-base font-bold truncate">
              {mostSoldItem?.name ?? "—"}
            </p>
            {mostSoldItem && (
              <p className="text-[10px] md:text-xs text-muted-foreground">
                {mostSoldItem.quantity} u
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Mejor Vendedor
              </p>
              <Users className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            </div>
            <p className="text-sm md:text-base font-bold truncate">
              {bestSeller?.[0]?.split(" ")[0] ?? "—"}
            </p>
            {bestSeller && (
              <p className="text-[10px] md:text-xs text-muted-foreground">
                {formatPrice(bestSeller[1].total)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Profitability & business-health KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Ganancia Neta
              </p>
              <Wallet className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-green-600 truncate">
              {formatPrice(totalProfit)}
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground">
              Margen: {profitMargin.toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Ticket Promedio
              </p>
              <ShoppingBag className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-gray-900 truncate">
              {formatPrice(avgTicket)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Costo de Inventario Actual
              </p>
              <Package className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-gray-900 truncate">
              {formatPrice(inventoryCost)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Bajo / Sin Stock
              </p>
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-gray-900">
              {lowStockItems.length}
              <span className="text-red-500"> / {outOfStockItems.length}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Low stock alert ── */}
      {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
          <h3 className="font-medium text-gray-900 mb-3 text-sm md:text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Alertas de Inventario
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {outOfStockItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 bg-red-50 rounded-md border border-red-100"
              >
                <span className="text-sm font-medium text-gray-900 truncate">
                  {item.name}
                </span>
                <span className="text-xs font-medium text-red-600 flex-shrink-0">
                  Sin stock
                </span>
              </div>
            ))}
            {lowStockItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 bg-yellow-50 rounded-md border border-yellow-100"
              >
                <span className="text-sm font-medium text-gray-900 truncate">
                  {item.name}
                </span>
                <span className="text-xs font-medium text-yellow-700 flex-shrink-0">
                  {item.quantity} {item.unit === "units" ? "u" : item.unit}{" "}
                  restantes
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat cards (most/least sold + best/worst seller) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
            <CardTitle className="text-xs md:text-sm font-medium">
              Producto Más Vendido
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {mostSoldItem ? (
              <>
                <div className="text-lg md:text-2xl font-bold truncate">
                  {mostSoldItem.name}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mostSoldItem.quantity} unidades vendidas
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
            <CardTitle className="text-xs md:text-sm font-medium">
              Producto Menos Vendido
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {leastSoldItem ? (
              <>
                <div className="text-lg md:text-2xl font-bold truncate">
                  {leastSoldItem.name}
                </div>
                <p className="text-xs text-muted-foreground">
                  {leastSoldItem.quantity} unidades vendidas
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
            <CardTitle className="text-xs md:text-sm font-medium">
              Mejor Vendedor
            </CardTitle>
            <Award className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {bestSeller ? (
              <>
                <div className="text-lg md:text-2xl font-bold truncate">
                  {bestSeller[0]}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatPrice(bestSeller[1].total)} · {bestSeller[1].count}{" "}
                  ventas
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
            <CardTitle className="text-xs md:text-sm font-medium">
              Vendedor con Menos Ventas
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {worstSeller ? (
              <>
                <div className="text-lg md:text-2xl font-bold truncate">
                  {worstSeller[0]}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatPrice(worstSeller[1].total)} · {worstSeller[1].count}{" "}
                  ventas
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ── */}
      {hasData ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Daily sales trend */}
          {dailySalesData.length >= 2 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 lg:col-span-2">
              <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base">
                Tendencia de Ventas Diarias
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={dailySalesData}
                  margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#2196F3"
                        stopOpacity={0.18}
                      />
                      <stop offset="95%" stopColor="#2196F3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                    tickFormatter={(v) => v.toFixed(0)}
                  />
                  <Tooltip
                    content={<CustomAreaTooltip formatPrice={formatPrice} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#2196F3"
                    strokeWidth={2.5}
                    fill="url(#salesGrad)"
                    dot={{ r: 3, fill: "#2196F3" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top products by revenue */}
          {topRevenueData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
              <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base">
                Top Ingresos por Producto
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={topRevenueData}
                  margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                    tickFormatter={(v) => v.toFixed(0)}
                  />
                  <Tooltip
                    content={
                      <CustomBarTooltip
                        formatPrice={formatPrice}
                        isRevenue={true}
                      />
                    }
                  />
                  <Bar dataKey="revenue" radius={[5, 5, 0, 0]}>
                    {topRevenueData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top products by units */}
          {topUnitsData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
              <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base">
                Top Unidades Vendidas
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={topUnitsData}
                  margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    content={
                      <CustomBarTooltip
                        formatPrice={formatPrice}
                        isRevenue={false}
                      />
                    }
                  />
                  <Bar dataKey="units" fill="#4CAF50" radius={[5, 5, 0, 0]}>
                    {topUnitsData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={`hsl(${142 + i * 15}, ${60 - i * 3}%, ${48 + i * 2}%)`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sales by user */}
          {userSalesData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
              <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base">
                Ventas por Vendedor
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={userSalesData}
                  margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="35%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                    tickFormatter={(v) => v.toFixed(0)}
                  />
                  <Tooltip
                    content={
                      <CustomBarTooltip
                        formatPrice={formatPrice}
                        isRevenue={true}
                      />
                    }
                  />
                  <Bar dataKey="total" radius={[5, 5, 0, 0]}>
                    {userSalesData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Payment methods breakdown */}
          {paymentMethodData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
              <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Ventas por Método de Pago
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    dataKey="total"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={3}
                    label={({ method, percent }) =>
                      `${method} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {paymentMethodData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [formatPrice(value), "Total"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pie – revenue share by product */}
          {topRevenueData.length >= 2 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
              <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base">
                Distribución de Ingresos
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={topRevenueData}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={3}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {topRevenueData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [formatPrice(value), "Ingresos"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BarChart2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            No hay datos para mostrar gráficas
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Realiza algunas ventas para ver estadísticas
          </p>
        </div>
      )}

      {/* ── Detailed table ── */}
      {hasData && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
          <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base">
            Ranking de Productos por Ingresos
          </h3>
          <div className="space-y-3">
            {itemSalesByRevenue.slice(0, 5).map((item, idx) => {
                const pct = Math.round(
                  (item.total / (maxItemTotal || 1)) * 100,
                );
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-gray-400 flex-shrink-0 w-5">
                          #{idx + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatPrice(item.total)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1.5">
                          {item.quantity}u
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            CHART_COLORS[idx % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Profit leaders table ── */}
      {hasData && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
          <h3 className="font-medium text-gray-900 mb-4 text-sm md:text-base">
            Productos Más Rentables (Ganancia)
          </h3>
          <div className="space-y-3">
            {sortedByProfit.slice(0, 5).map((item, idx) => {
              const maxProfit = sortedByProfit[0]?.profit || 1;
              const pct = Math.max(
                0,
                Math.round((item.profit / maxProfit) * 100),
              );
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-gray-400 flex-shrink-0 w-5">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span
                        className={`text-sm font-semibold ${item.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatPrice(item.profit)}
                      </span>
                      <span className="text-xs text-gray-400 ml-1.5">
                        {item.quantity}u
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
