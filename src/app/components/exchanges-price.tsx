import { Input } from "./ui/input";

export function ExchangesPrice({
  usdValue,
  eurValue,
  setUsdValue,
  setEurValue,
}: {
  usdValue: number;
  eurValue: number;
  setUsdValue: (value: number) => void;
  setEurValue: (value: number) => void;
}) {
  const setUsdValueGlobal = (value: number) => {
    setUsdValue(value);
    localStorage.setItem("usdValue", value.toString());
  };

  const setEurValueGlobal = (value: number) => {
    setEurValue(value);
    localStorage.setItem("eurValue", value.toString());
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[#1A1A1A]">
          Valores de Cambio de Moneda
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col">
          <label htmlFor="usdValue" className="mb-2 font-medium text-gray-700">
            Valor del Dólar (USD)
          </label>
          <Input
            id="usdValue"
            type="text"
            value={usdValue}
            onChange={(e) => setUsdValueGlobal(parseFloat(e.target.value))}
            placeholder="0"
            className="flex-1 border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
            required
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="eurValue" className="mb-2 font-medium text-gray-700">
            Valor del Euro (EUR)
          </label>
          <Input
            id="eurValue"
            type="text"
            value={eurValue}
            onChange={(e) => setEurValueGlobal(parseFloat(e.target.value))}
            placeholder="0"
            className="flex-1 border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
            required
          />
        </div>
      </div>
    </div>
  );
}
