import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { getOutboxCount, flushOutbox } from "../utils/offlineStore";
import { useApp } from "../context/app-context";

export function OfflineSync() {
  const { refreshData } = useApp();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const checkPending = async () => {
    const count = await getOutboxCount();
    setPending(count);
    return count;
  };

  const sync = async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      await flushOutbox();
      await checkPending();
      // Safe to refetch even when the flush stopped early: fetchInventory
      // replays whatever is still queued on top of the server rows, so this
      // cannot restore stock that a queued sale already took off the shelf.
      await refreshData();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    checkPending();
    const handleOnline = () => {
      setOnline(true);
      sync();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // The poll only reads the pending counter (a local IndexedDB read) and
    // only retries a flush when something is actually queued. It used to call
    // sync() on every tick, which refetched the whole inventory and settings
    // every five seconds for a queue that was almost always empty.
    const interval = setInterval(async () => {
      if ((await checkPending()) > 0) sync();
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (online && pending === 0) return null;

  // A full-width strip docked above the mobile tab bar (floating pill on
  // desktop). Never overlaps the navigation; never small enough to miss:
  // "did my sale save?" must answer itself.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-40 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:bottom-4 md:left-4 md:right-auto"
    >
      {!online ? (
        <div className="flex items-center justify-center gap-2.5 bg-foreground text-white text-sm font-semibold px-4 py-2.5 md:rounded-xl md:shadow-raised">
          <CloudOff className="size-4.5 shrink-0" aria-hidden="true" />
          Sin conexión
          {pending > 0 && (
            <span className="font-normal text-white/80" data-money>
              · {pending} {pending === 1 ? "cambio guardado" : "cambios guardados"} aquí
            </span>
          )}
        </div>
      ) : (
        <button
          onClick={sync}
          disabled={syncing}
          className="flex w-full md:w-auto items-center justify-center gap-2.5 bg-pending-strong text-foreground text-sm font-semibold px-4 py-2.5 md:rounded-xl md:shadow-raised hover:brightness-105 disabled:opacity-70"
        >
          <RefreshCw
            className={`size-4.5 shrink-0 ${syncing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span data-money>
            {pending} {pending === 1 ? "cambio" : "cambios"} por enviar
          </span>
          <span className="font-normal">· toca para reenviar</span>
        </button>
      )}
    </div>
  );
}
