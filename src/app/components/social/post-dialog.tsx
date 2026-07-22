// One post of the calendar: the composed images, the caption, and the plan.
//
// The images shown (and downloaded) are composed on the fly by the canvas
// template from the stored photos + design texts. Posting stays manual:
// download, publish on the network, «Marcar publicado», and once verified,
// «Confirmar» — confirmed posts get deleted when their week closes.

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Copy, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { composePost } from "../../services/social-composer";
import {
  useSocial,
  type SocialPlatform,
  type SocialPost,
} from "../../context/social-context";

const PLATFORMS: { key: SocialPlatform; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
];

interface PostDialogProps {
  post: SocialPost;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostDialog({ post, open, onOpenChange }: PostDialogProps) {
  const { config, updatePost, setPostStatus, deletePost } = useSocial();

  const [caption, setCaption] = useState(post.caption);
  const [when, setWhen] = useState(() =>
    format(post.scheduledAt, "yyyy-MM-dd'T'HH:mm"),
  );
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(post.platforms);
  const [slides, setSlides] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Compose every slide once per open. Object URLs are revoked on cleanup so
  // reopening the dialog doesn't leak blobs.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const urls: string[] = [];
    setComposing(true);
    (async () => {
      for (let i = 0; i < post.images.length; i++) {
        try {
          const blob = await composePost({
            photoUrl: post.images[i],
            logoUrl: config.logoUrl,
            design: post.design,
            cover: i === 0,
          });
          if (cancelled) return;
          urls.push(URL.createObjectURL(blob));
          setSlides([...urls]);
        } catch {
          // A missing/tainted photo should not hide the rest of the carousel.
        }
      }
    })().finally(() => {
      if (!cancelled) setComposing(false);
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [open, post, config.logoUrl]);

  const dirty = useMemo(() => {
    return (
      caption !== post.caption ||
      when !== format(post.scheduledAt, "yyyy-MM-dd'T'HH:mm") ||
      platforms.join(",") !== post.platforms.join(",")
    );
  }, [caption, when, platforms, post]);

  const act = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo guardar.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    const ok = await act(() =>
      updatePost(post.id, {
        caption,
        scheduledAt: new Date(when),
        platforms,
      }),
    );
    if (ok) toast.success("Post actualizado.");
  };

  const handleDownload = (url: string, index: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${post.itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${index + 1}.jpg`;
    a.click();
  };

  const handleCopyCaption = async () => {
    await navigator.clipboard.writeText(caption);
    toast.success("Descripción copiada.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{post.itemName}</DialogTitle>
          <DialogDescription>
            {format(post.scheduledAt, "dd/MM/yyyy HH:mm")} ·{" "}
            {post.platforms.join(" + ")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {slides.map((url, i) => (
              <div key={url} className="relative shrink-0">
                <img
                  src={url}
                  alt={`Imagen ${i + 1}`}
                  className="h-56 rounded-lg border border-gray-200"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-2 right-2"
                  onClick={() => handleDownload(url, i)}
                  aria-label="Descargar imagen"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {composing && (
              <div className="h-56 w-40 shrink-0 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="social-caption">Descripción</Label>
              <Button variant="ghost" size="sm" onClick={handleCopyCaption}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copiar
              </Button>
            </div>
            <Textarea
              id="social-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={8}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="social-when">Fecha y hora</Label>
              <Input
                id="social-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Redes</Label>
              <div className="flex gap-4 pt-2">
                {PLATFORMS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={platforms.includes(key)}
                      onCheckedChange={(checked) =>
                        setPlatforms((prev) =>
                          checked
                            ? [...prev, key]
                            : prev.filter((p) => p !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            {dirty && (
              <Button onClick={handleSave} disabled={busy}>
                Guardar cambios
              </Button>
            )}
            {post.status === "planned" && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  if (await act(() => setPostStatus(post.id, "posted"))) {
                    toast.success("Marcado como publicado.");
                    onOpenChange(false);
                  }
                }}
              >
                Marcar publicado
              </Button>
            )}
            {post.status === "posted" && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  if (await act(() => setPostStatus(post.id, "confirmed"))) {
                    toast.success(
                      "Confirmado. Se limpiará al cerrar la semana.",
                    );
                    onOpenChange(false);
                  }
                }}
              >
                Confirmar publicación
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-red-600 ml-auto"
              disabled={busy}
              onClick={async () => {
                if (await act(() => deletePost(post.id))) {
                  toast.success("Post eliminado.");
                  onOpenChange(false);
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Eliminar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
