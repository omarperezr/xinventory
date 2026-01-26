import { Package, LayoutGrid, Search, ShoppingCart, History } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface InventoryHeaderProps {
  defaultCurrency: string;
  onCurrencyChange: (currency: string) => void;
}

export function InventoryHeader({ defaultCurrency, onCurrencyChange }: InventoryHeaderProps) {
  const location = useLocation();
  const isDashboard = location.pathname === '/';
  const isSearch = location.pathname === '/search';
  const isTotal = location.pathname === '/total';
  const isHistory = location.pathname === '/history';

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2196F3] rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-[#1A1A1A] tracking-tight">XInventory</h1>
                <p className="text-sm text-gray-500 font-light">Producto de XSingularity</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center bg-gray-100/80 p-1 rounded-lg">
              <Link 
                to="/" 
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isDashboard 
                    ? 'bg-white text-[#2196F3] shadow-sm' 
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Admin
              </Link>
              <Link 
                to="/search" 
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isSearch 
                    ? 'bg-white text-[#2196F3] shadow-sm' 
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Search className="w-4 h-4 mr-2" />
                Buscar
              </Link>
              <Link 
                to="/total" 
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isTotal
                    ? 'bg-white text-[#2196F3] shadow-sm' 
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Total
              </Link>
              <Link 
                to="/history" 
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isHistory
                    ? 'bg-white text-[#2196F3] shadow-sm' 
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <History className="w-4 h-4 mr-2" />
                Historial
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center justify-between md:justify-end gap-3">
            <nav className="flex md:hidden items-center bg-gray-100/80 p-1 rounded-lg mr-4">
              <Link 
                to="/" 
                className={`p-2 rounded-md transition-all ${
                  isDashboard ? 'bg-white text-[#2196F3] shadow-sm' : 'text-gray-500'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </Link>
              <Link 
                to="/search" 
                className={`p-2 rounded-md transition-all ${
                  isSearch ? 'bg-white text-[#2196F3] shadow-sm' : 'text-gray-500'
                }`}
              >
                <Search className="w-4 h-4" />
              </Link>
              <Link 
                to="/total" 
                className={`p-2 rounded-md transition-all ${
                  isTotal ? 'bg-white text-[#2196F3] shadow-sm' : 'text-gray-500'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
              </Link>
              <Link 
                to="/history" 
                className={`p-2 rounded-md transition-all ${
                  isHistory ? 'bg-white text-[#2196F3] shadow-sm' : 'text-gray-500'
                }`}
              >
                <History className="w-4 h-4" />
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 font-normal hidden sm:block">Moneda Default:</label>
              <Select value={defaultCurrency} onValueChange={onCurrencyChange}>
                <SelectTrigger className="w-[120px] border-gray-300 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">BS (Bs)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
