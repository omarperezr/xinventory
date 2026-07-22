// Redes Sociales: the marketing calendar.
//
// Two tabs, same skeleton as the finance dashboard: "Calendario" is the
// working surface (what goes up, when, and how far along it is) and
// "Configuración" is the identity/AI/cadence panel. The whole module is
// admin-only — the route in App.tsx gates it and RLS enforces it.

import { lazy, Suspense, useState } from "react";
import { CalendarDays, Loader2, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useSocial } from "../context/social-context";

const CalendarPanel = lazy(() =>
  import("./social/calendar-panel").then((m) => ({
    default: m.CalendarPanel,
  })),
);
const ConfigPanel = lazy(() =>
  import("./social/config-panel").then((m) => ({ default: m.ConfigPanel })),
);

type TabKey = "calendario" | "configuracion";

const TABS: { key: TabKey; label: string; icon: typeof CalendarDays; hint: string }[] = [
  {
    key: "calendario",
    label: "Calendario",
    icon: CalendarDays,
    hint: "Qué se publica y cuándo",
  },
  {
    key: "configuracion",
    label: "Configuración",
    icon: Settings2,
    hint: "Marca, estilo, IA y cadencia",
  },
];

export function SocialView() {
  const { generating, generateNow, config } = useSocial();
  const [tab, setTab] = useState<TabKey>("calendario");

  const handleGenerate = async () => {
    const result = await generateNow();
    if (result.success) {
      toast.success("Tanda generada. Revisa el calendario.");
    } else {
      toast.error(result.error ?? "No se pudo generar la tanda.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Redes Sociales</h1>
          <p className="text-sm text-gray-500">
            Posts generados del inventario, listos para publicar.
            {config.lastGeneratedAt && (
              <>
                {" "}
                Última tanda:{" "}
                {config.lastGeneratedAt.toLocaleDateString("es-VE", {
                  day: "2-digit",
                  month: "2-digit",
                })}
                .
              </>
            )}
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {generating ? "Generando…" : "Generar ahora"}
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(({ key, label, icon: Icon, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            title={hint}
            className={`tap-target flex items-center gap-2 px-4 py-2 rounded-full text-sm whitespace-nowrap border transition-colors ${
              tab === key
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            <Icon className="w-4 h-4" strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            Cargando…
          </div>
        }
      >
        {tab === "calendario" ? <CalendarPanel /> : <ConfigPanel />}
      </Suspense>
    </div>
  );
}
