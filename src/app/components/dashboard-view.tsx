import { InventoryForm, type InventoryItem } from './inventory-form';
import { InventoryTable } from './inventory-table';

interface DashboardViewProps {
  items: InventoryItem[];
  editingItem?: InventoryItem;
  defaultCurrency: string;
  onAddItem: (item: Omit<InventoryItem, 'id'>) => void;
  onEditItem: (item: InventoryItem) => void;
  onCancelEdit: () => void;
  onDeleteItem: (id: string) => void;
}

export function DashboardView({
  items,
  editingItem,
  defaultCurrency,
  onAddItem,
  onEditItem,
  onCancelEdit,
  onDeleteItem,
}: DashboardViewProps) {
  return (
    <div className="space-y-8">
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
      />
    </div>
  );
}
