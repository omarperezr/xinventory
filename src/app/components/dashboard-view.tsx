import { InventoryForm, type InventoryItem } from "./inventory-form";
import { ExchangesPrice } from "./exchanges-price";
import { InventoryTable } from "./inventory-table";

interface DashboardViewProps {
  items: InventoryItem[];
  editingItem?: InventoryItem;
  defaultCurrency: string;
  onAddItem: (item: Omit<InventoryItem, "id">) => void;
  onEditItem: (item: InventoryItem) => void;
  onCancelEdit: () => void;
  onDeleteItem: (id: string) => void;
  usdValue: number;
  eurValue: number;
  setUsdValue: (value: number) => void;
  setEurValue: (value: number) => void;
}

export function DashboardView({
  items,
  editingItem,
  defaultCurrency,
  onAddItem,
  onEditItem,
  onCancelEdit,
  onDeleteItem,
  usdValue,
  eurValue,
  setUsdValue,
  setEurValue,
}: DashboardViewProps) {
  return (
    <div className="space-y-8">
      <ExchangesPrice
        usdValue={usdValue}
        eurValue={eurValue}
        setUsdValue={setUsdValue}
        setEurValue={setEurValue}
      />
      <InventoryForm
        onSubmit={onAddItem}
        defaultCurrency={defaultCurrency}
        editItem={editingItem}
        onCancelEdit={onCancelEdit}
      />

      <InventoryTable
        items={items}
        onEdit={onEditItem}
        onDelete={onDeleteItem}
        usdValue={usdValue}
        eurValue={eurValue}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
}
