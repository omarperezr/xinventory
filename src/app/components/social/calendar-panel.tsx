// Month grid for the social posting calendar.
//
// Hand-rolled on date-fns rather than react-day-picker: day-picker renders a
// date *picker*, and this is a *scheduler* — each cell must show the posts
// that land that day (thumbnail, time, status) and open them on tap. Clicking
// a post opens PostDialog with the full plan.

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CheckCheck, ChevronLeft, ChevronRight, Plus, Send } from "lucide-react";
import { Button } from "../ui/button";
import { useSocial, type SocialPost } from "../../context/social-context";
import { PostDialog } from "./post-dialog";
import { NewPostDialog } from "./new-post-dialog";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const STATUS_STYLE: Record<SocialPost["status"], string> = {
  planned: "border-sky-300 bg-sky-50 text-sky-900",
  posted: "border-amber-300 bg-amber-50 text-amber-900",
  confirmed: "border-emerald-300 bg-emerald-50 text-emerald-900",
};

export function CalendarPanel() {
  const { posts, loading, config } = useSocial();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [openPost, setOpenPost] = useState<SocialPost | null>(null);
  // When set, the creation dialog opens prefilled with this slot. Clicking a
  // day picks that day; the toolbar button defaults to tomorrow. Both use the
  // configured posting time.
  const [newPostAt, setNewPostAt] = useState<Date | null>(null);

  const slotFor = (day: Date): Date => {
    const [hh, mm] = config.postTime.split(":").map((n) => parseInt(n, 10) || 0);
    const slot = new Date(day);
    slot.setHours(hh, mm, 0, 0);
    return slot;
  };

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [month]);

  const postsOf = (day: Date) =>
    posts.filter((p) => isSameDay(p.scheduledAt, day));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="font-medium">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewPostAt(slotFor(addDays(new Date(), 1)))}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Agregar post
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-meta">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day) => {
          const dayPosts = postsOf(day);
          const inMonth = isSameMonth(day, month);
          return (
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => setNewPostAt(slotFor(day))}
              onKeyDown={(e) => {
                if (e.key === "Enter") setNewPostAt(slotFor(day));
              }}
              className={`min-h-24 rounded-lg border p-1 text-left align-top cursor-pointer transition-colors hover:border-primary/50 ${
                inMonth ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100"
              } ${isToday(day) ? "ring-2 ring-primary/40" : ""}`}
            >
              <div
                className={`text-xs mb-1 ${
                  inMonth ? "text-gray-600" : "text-gray-400"
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={(e) => {
                      // The cell underneath opens the creation dialog; a chip
                      // opens ITS post, not both.
                      e.stopPropagation();
                      setOpenPost(post);
                    }}
                    className={`w-full flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-opacity hover:opacity-80 ${STATUS_STYLE[post.status]}`}
                  >
                    {post.images[0] && (
                      <img
                        src={post.images[0]}
                        alt=""
                        className="w-6 h-6 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    )}
                    <span className="truncate flex-1">
                      {format(post.scheduledAt, "HH:mm")} · {post.itemName}
                    </span>
                    {post.status === "posted" && (
                      <Send className="w-3 h-3 shrink-0" />
                    )}
                    {post.status === "confirmed" && (
                      <CheckCheck className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-sky-300 bg-sky-50" />
          Planificado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-amber-300 bg-amber-50" />
          Publicado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-emerald-300 bg-emerald-50" />
          Confirmado (se limpia al cerrar la semana)
        </span>
      </div>

      {loading && posts.length === 0 && (
        <div className="text-center text-sm text-gray-500 py-8">Cargando…</div>
      )}
      {!loading && posts.length === 0 && (
        <div className="text-center text-sm text-gray-500 py-8">
          No hay posts planificados. Usa «Generar ahora» o espera la próxima
          tanda automática.
        </div>
      )}

      {openPost && (
        <PostDialog
          post={openPost}
          open={openPost !== null}
          onOpenChange={(open) => {
            if (!open) setOpenPost(null);
          }}
        />
      )}
      {newPostAt && (
        <NewPostDialog
          open={newPostAt !== null}
          initialDate={newPostAt}
          onOpenChange={(open) => {
            if (!open) setNewPostAt(null);
          }}
        />
      )}
    </div>
  );
}
