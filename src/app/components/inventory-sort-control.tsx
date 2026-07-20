import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ArrowDownUp, X } from "lucide-react";
import {
  SORT_FIELDS,
  SortField,
  SortOption,
  fieldOf,
  dirOf,
} from "../utils/sortInventory";

interface Props {
  value: SortOption[];
  onChange: (value: SortOption[]) => void;
  className?: string;
}

/**
 * "Ordenar por" control that supports ordering by several parameters at once.
 * Each chosen field shows its priority (1, 2, 3, and so on) - the order in
 * which it was selected - and its direction can be flipped. Selecting a
 * field's active direction again removes it from the sort.
 */
export function InventorySortControl({ value, onChange, className }: Props) {
  const indexOfField = (field: SortField) => value.findIndex((o) => fieldOf(o) === field);

  const setDirection = (field: SortField, dir: "asc" | "desc") => {
    const option = `${field}-${dir}` as SortOption;
    const idx = indexOfField(field);
    if (idx === -1) {
      onChange([...value, option]);
    } else if (value[idx] === option) {
      onChange(value.filter((_, i) => i !== idx));
    } else {
      onChange(value.map((o, i) => (i === idx ? option : o)));
    }
  };

  const summary =
    value.length === 0
      ? "Ordenar por"
      : value
          .map((o) => SORT_FIELDS.find((f) => f.field === fieldOf(o))!.label)
          .join(" › ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={`justify-start font-medium bg-input-background hover:bg-input-background hover:brightness-100 border border-input text-foreground ${className || ""}`}
        >
          <ArrowDownUp className="w-4 h-4 mr-2 shrink-0" />
          <span className="truncate">{summary}</span>
          {value.length > 0 && (
            <span className="ml-2 shrink-0 rounded-full bg-primary text-white text-xs font-semibold min-w-[20px] h-5 px-1 flex items-center justify-center">
              {value.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2 bg-white">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold text-gray-700">Ordenar por</span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Limpiar
            </button>
          )}
        </div>
        <p className="px-2 pb-1.5 text-xs text-gray-400">
          El orden de selección define la prioridad.
        </p>
        <div className="space-y-1">
          {SORT_FIELDS.map((f) => {
            const idx = indexOfField(f.field);
            const active = idx !== -1;
            const dir = active ? dirOf(value[idx]) : undefined;
            return (
              <div
                key={f.field}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold shrink-0 ${
                    active ? "bg-primary text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {active ? idx + 1 : "·"}
                </span>
                <span className="flex-1 text-sm text-gray-700">{f.label}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDirection(f.field, "asc")}
                    className={`text-xs px-2 py-1 rounded border ${
                      active && dir === "asc"
                        ? "bg-primary border-primary text-white font-medium"
                        : "border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {f.ascLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection(f.field, "desc")}
                    className={`text-xs px-2 py-1 rounded border ${
                      active && dir === "desc"
                        ? "bg-primary border-primary text-white font-medium"
                        : "border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {f.descLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
