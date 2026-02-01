import { useHistory } from "../context/history-context";
import { useApp } from "../context/app-context";
import {
  BarChart,
  TrendingUp,
  TrendingDown,
  Award,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

export function ReportsView() {
  const { transactions } = useHistory();
  const { formatPrice } = useApp();

  // Calculations
  const itemSales: Record<
    string,
    { name: string; quantity: number; total: number }
  > = {};
  const userSales: Record<string, { total: number; count: number }> = {};

  transactions.forEach((t) => {
    // User Sales
    if (!userSales[t.userId]) userSales[t.userId] = { total: 0, count: 0 };
    userSales[t.userId].total += t.total;
    userSales[t.userId].count += 1;

    // Item Sales
    t.items.forEach((item) => {
      if (!itemSales[item.id])
        itemSales[item.id] = { name: item.name, quantity: 0, total: 0 };
      itemSales[item.id].quantity += item.cartQuantity;
      itemSales[item.id].total += item.cartQuantity * item.sellingPrice;
    });
  });

  const sortedItems = Object.values(itemSales).sort(
    (a, b) => b.quantity - a.quantity,
  );
  const sortedUsers = Object.entries(userSales).sort(
    ([, a], [, b]) => b.total - a.total,
  );

  const mostSoldItem = sortedItems[0];
  const leastSoldItem = sortedItems[sortedItems.length - 1];

  const bestSeller = sortedUsers[0];
  const worstSeller = sortedUsers[sortedUsers.length - 1];

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <BarChart className="w-5 h-5 text-[#2196F3]" />
          Reportes y Estadísticas
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Análisis de rendimiento basado en el historial de transacciones.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most Sold Item */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Producto Más Vendido
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {mostSoldItem ? (
              <>
                <div className="text-2xl font-bold">{mostSoldItem.name}</div>
                <p className="text-xs text-muted-foreground">
                  {mostSoldItem.quantity} unidades vendidas
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>

        {/* Least Sold Item */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Producto Menos Vendido
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {leastSoldItem ? (
              <>
                <div className="text-2xl font-bold">{leastSoldItem.name}</div>
                <p className="text-xs text-muted-foreground">
                  {leastSoldItem.quantity} unidades vendidas
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>

        {/* Best Seller */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mejor Vendedor
            </CardTitle>
            <Award className="h-4 w-4 text-[#2196F3]" />
          </CardHeader>
          <CardContent>
            {bestSeller ? (
              <>
                <div className="text-2xl font-bold">{bestSeller[0]}</div>
                <p className="text-xs text-muted-foreground">
                  Total Vendido: {formatPrice(bestSeller[1].total)} (
                  {bestSeller[1].count} ventas)
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>

        {/* Lowest Seller (User) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Vendedor con Menos Ventas
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {worstSeller ? (
              <>
                <div className="text-2xl font-bold">{worstSeller[0]}</div>
                <p className="text-xs text-muted-foreground">
                  Total Vendido: {formatPrice(worstSeller[1].total)} (
                  {worstSeller[1].count} ventas)
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No hay datos suficientes</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="font-medium text-gray-900 mb-4">
          Top Productos por Ingresos
        </h3>
        <div className="space-y-4">
          {Object.values(itemSales)
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)
            .map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-gray-500 w-6">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-gray-900">{item.name}</span>
                </div>
                <span className="text-gray-900 font-medium">
                  {formatPrice(item.total)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
