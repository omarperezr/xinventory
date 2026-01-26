import { useState } from 'react';
import { format } from 'date-fns';
import { 
  History, 
  Search, 
  Receipt, 
  Calendar, 
  ChevronRight, 
  Upload, 
  CornerUpLeft,
  Image as ImageIcon,
  X,
  CreditCard,
  StickyNote
} from 'lucide-react';
import { useHistory, Transaction, TransactionItem } from '../context/history-context';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from 'sonner';

const currencySymbols: Record<string, string> = {
  BS: 'BS',
  USD: '$',
  EUR: '€'
};

interface HistoryViewProps {
  onReturnInventory: (itemId: string, quantity: number) => void;
}

export function HistoryView({ onReturnInventory }: HistoryViewProps) {
  const { transactions, returnItem, addImageToTransaction } = useHistory();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const filteredTransactions = transactions.filter(t => 
    t.id.includes(searchTerm) || 
    t.items.some(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, transactionId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (limit to 1MB for localStorage safety)
    if (file.size > 1024 * 1024) {
      toast.error("Image too large. Please select an image under 1MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      addImageToTransaction(transactionId, base64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <History className="w-5 h-5 text-[#2196F3]" />
          Transaction History
        </h2>
        <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
           <Input 
             placeholder="Busca transacciones por ID o nombre del producto" 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="pl-9"
           />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        {transactions.length === 0 ? (
           <div className="p-16 text-center">
             <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
             <p className="text-gray-500">No transactions yet</p>
           </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">ID de la Transaccion</th>
                  <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">Fecha</th>
                  <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">Items</th>
                  <th className="text-right px-6 py-4 text-sm text-gray-600 font-normal">Total</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map(transaction => (
                  <tr 
                    key={transaction.id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedTransaction(transaction)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-gray-500">#{transaction.id.slice(-8)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {format(new Date(transaction.date), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        {transaction.items.length} items
                        <span className="text-xs text-gray-400 ml-2">
                          ({transaction.items.reduce((acc, i) => acc + i.cartQuantity, 0)} unidades)
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-medium text-[#1A1A1A]">
                        ${transaction.total.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="w-4 h-4 text-gray-400 inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Details Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <DialogContent className="sm:max-w-4xl max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>Detalles de la Transaccion</DialogTitle>
            <DialogDescription>
              ID de la Transaccion: #{selectedTransaction?.id} • {selectedTransaction && format(new Date(selectedTransaction.date), 'PPP p')}
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-8 mt-4">
              {/* Items List */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                   <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-medium">
                     <tr>
                       <th className="px-4 py-3 text-left">Producto</th>
                       <th className="px-4 py-3 text-right">Precio</th>
                       <th className="px-4 py-3 text-center">Cantidad Comprada</th>
                       <th className="px-4 py-3 text-center">Vuelto</th>
                       <th className="px-4 py-3 text-right">Subtotal</th>
                       <th className="px-4 py-3"></th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100 text-sm">
                     {selectedTransaction.items.map(item => (
                       <TransactionItemRow 
                         key={item.id} 
                         item={item} 
                         transactionId={selectedTransaction.id}
                         onReturn={(qty) => {
                           returnItem(selectedTransaction.id, item.id, qty);
                           onReturnInventory(item.id, qty);
                         }}
                       />
                     ))}
                   </tbody>
                   <tfoot className="bg-gray-50 text-sm">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-right text-gray-500">Subtotal:</td>
                        <td className="px-4 py-2 text-right font-medium">${selectedTransaction.subtotal.toFixed(2)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-right text-gray-500">Impuestos (10%):</td>
                        <td className="px-4 py-2 text-right font-medium">${selectedTransaction.tax.toFixed(2)}</td>
                        <td></td>
                      </tr>
                      <tr className="border-t border-gray-200">
                        <td colSpan={4} className="px-4 py-3 text-right font-bold text-gray-900">Total Pagado:</td>
                        <td className="px-4 py-3 text-right font-bold text-[#2196F3]">${selectedTransaction.total.toFixed(2)}</td>
                        <td></td>
                      </tr>
                   </tfoot>
                </table>
              </div>

              {/* Payment Details */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#2196F3]" />
                      Detalles del Pago
                  </h3>
                  <div className="grid gap-2">
                      {selectedTransaction.payments.map((p, i) => (
                          <div key={i} className="flex justify-between text-sm">
                              <span className="text-gray-600">{p.method}</span>
                              <span className="font-medium text-gray-900">${p.amount.toFixed(2)}</span>
                          </div>
                      ))}
                      {selectedTransaction.total < selectedTransaction.payments.reduce((sum, p) => sum + p.amount, 0) && (
                          <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                              <span className="text-gray-600">Vuelto Dado</span>
                              <span className="font-medium text-red-600">
                                  -${(selectedTransaction.payments.reduce((sum, p) => sum + p.amount, 0) - selectedTransaction.total).toFixed(2)}
                              </span>
                          </div>
                      )}
                  </div>
                  {selectedTransaction.notes && (
                      <div className="pt-2 border-t border-gray-200 mt-2">
                          <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                              <StickyNote className="w-3 h-3" />
                              Notas
                          </div>
                          <p className="text-sm text-gray-700 italic bg-white p-2 rounded border border-gray-100">
                              {selectedTransaction.notes}
                          </p>
                      </div>
                  )}
              </div>

              {/* Images Section */}
              <div className="space-y-4">
                 <h3 className="font-medium text-gray-900 flex items-center gap-2">
                   <ImageIcon className="w-4 h-4 text-[#2196F3]" />
                   Archivos (Recibos/Facturas)
                 </h3>
                 
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {selectedTransaction.images.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                        <img src={img} alt="Receipt" className="w-full h-full object-cover" />
                      </div>
                    ))}
                    
                    <div className="aspect-square bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors relative">
                       <input 
                         type="file" 
                         accept="image/*"
                         className="absolute inset-0 opacity-0 cursor-pointer"
                         onChange={(e) => handleFileUpload(e, selectedTransaction.id)}
                       />
                       <Upload className="w-6 h-6 text-gray-400 mb-2" />
                       <span className="text-xs text-gray-500">Upload Image</span>
                    </div>
                 </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransactionItemRow({ 
  item, 
  transactionId,
  onReturn 
}: { 
  item: TransactionItem, 
  transactionId: string,
  onReturn: (qty: number) => void 
}) {
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const availableToReturn = item.cartQuantity - item.quantityReturned;

  const handleReturnClick = () => {
    if (returnQty > 0 && returnQty <= availableToReturn) {
      onReturn(returnQty);
      toast.success(`Returned ${returnQty} ${item.name}(s)`);
      setReturnMode(false);
      setReturnQty(1);
    }
  };

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{item.name}</div>
        <div className="text-xs text-gray-500 font-mono">{item.barcode}</div>
      </td>
      <td className="px-4 py-3 text-right text-gray-600">
        {currencySymbols[item.currency] || '$'}{item.price.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-center text-gray-900">
        {item.cartQuantity}
      </td>
      <td className="px-4 py-3 text-center">
        {item.quantityReturned > 0 ? (
          <span className="text-red-600 font-medium bg-red-50 px-2 py-1 rounded text-xs">
            -{item.quantityReturned}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">
        {currencySymbols[item.currency] || '$'}{(item.price * item.cartQuantity).toFixed(2)}
      </td>
      <td className="px-4 py-3 text-right">
        {availableToReturn > 0 && (
          !returnMode ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-xs"
              onClick={() => setReturnMode(true)}
            >
              <CornerUpLeft className="w-3 h-3 mr-1" />
              Retornar Producto
            </Button>
          ) : (
            <div className="flex items-center justify-end gap-2 bg-gray-50 p-1 rounded border border-gray-200">
              <Input 
                type="number" 
                min="1" 
                max={availableToReturn}
                value={returnQty}
                onChange={(e) => setReturnQty(Math.min(availableToReturn, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-12 h-7 text-xs px-1 text-center"
              />
              <Button 
                size="sm" 
                className="h-7 px-2 text-xs bg-red-600 hover:bg-red-700 text-white"
                onClick={handleReturnClick}
              >
                Confirmar
              </Button>
              <button 
                onClick={() => setReturnMode(false)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          )
        )}
      </td>
    </tr>
  );
}
