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
          variant="outline"
          className={`justify-start ${className || ""}`}
        >
          <ArrowDownUp className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{summary}</span>
          {value.length > 0 && (
            <span className="ml-1 shrink-0 rounded-full bg-primary text-white text-meta font-bold min-w-5 h-5 px-1.5 flex items-center justify-center">
              {value.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-base font-bold text-foreground">Ordenar por</span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="tap-target text-sm font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="size-4" aria-hidden="true" />
              Limpiar
            </button>
          )}
        </div>
        <p className="px-2 pb-2 text-sm text-muted-foreground">
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
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary"
              >
                <span
                  data-money
                  className={`flex items-center justify-center size-6 rounded-full text-sm font-bold shrink-0 ${
                    active
                      ? "bg-primary text-white"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {active ? idx + 1 : "·"}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">
                  {f.label}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDirection(f.field, "asc")}
                    className={`tap-target h-9 px-2.5 rounded-md border text-sm font-semibold ${
                      active && dir === "asc"
                        ? "bg-primary border-primary text-white"
                        : "border-border-strong text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {f.ascLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection(f.field, "desc")}
                    className={`tap-target h-9 px-2.5 rounded-md border text-sm font-semibold ${
                      active && dir === "desc"
                        ? "bg-primary border-primary text-white"
                        : "border-border-strong text-muted-foreground hover:bg-secondary"
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
