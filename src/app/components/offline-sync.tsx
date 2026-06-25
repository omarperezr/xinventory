import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { getOutboxCount, flushOutbox } from "../utils/offlineStore";
import { useApp } from "../context/app-context";

export function OfflineSync() {
  const { refreshData } = useApp();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const checkPending = async () => setPending(await getOutboxCount());

  const sync = async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      await flushOutbox();
      await checkPending();
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

    const interval = setInterval(() => {
      checkPending();
      if (navigator.onLine) sync();
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className="fixed bottom-3 left-3 z-50">
      {!online ? (
        <div className="flex items-center gap-2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
          <CloudOff className="w-3.5 h-3.5" />
          Sin conexión{pending > 0 ? ` · ${pending} cambio(s) pendiente(s)` : ""}
        </div>
      ) : (
        <button
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-2 bg-amber-500 text-slate-900 text-xs font-medium px-3 py-2 rounded-lg shadow-lg hover:bg-amber-400 disabled:opacity-70"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {pending} cambio(s) pendiente(s) · toca para reintentar
        </button>
      )}
    </div>
  );
}
