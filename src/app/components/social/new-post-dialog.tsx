// Manual post creation: pick a product, pick a slot, done.
//
// Everything else is prefilled from the item the moment it's selected — the
// same derivations the server-side fallback uses — so the quick path is two
// clicks, but every text (title stack, callouts, statement, caption) stays
// editable for the times the admin wants to say something specific.

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useApp, type InventoryItem } from "../../context/app-context";
import {
  useSocial,
  type SocialPlatform,
  type SocialPostDesign,
} from "../../context/social-context";

const PLATFORMS: { key: SocialPlatform; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
];

/** Same spirit as the server-side fallback: honest, generic, editable. */
function designFor(item: InventoryItem): SocialPostDesign {
  const rest = item.name
    .replace(new RegExp(item.brand, "i"), "")
    .replace(new RegExp(item.type, "i"), "")
    .trim();
  return {
    t1: item.type === "N/A" || item.type === "UNASSIGNED" ? "DISPONIBLE" : item.type,
    t2: item.brand,
    t3: rest || item.name,
    callouts: [
      { label: "STOCK\nDISPONIBLE", x: null, y: null },
      { label: "CALIDAD\nGARANTIZADA", x: null, y: null },
      { label: "ATENCIÓN\nPOR DM", x: null, y: null },
    ],
    statement: "PREGUNTA POR EL TUYO.",
  };
}

function captionFor(item: InventoryItem, businessName: string): string {
  return [
    `${item.name} disponible en ${businessName}. 🏍️`,
    "",
    item.notes ? item.notes.trim() : "Calidad y atención de confianza.",
    "",
    item.quantity === 1 ? "🚨 Última unidad disponible." : "Unidades limitadas.",
    "",
    "👉 Escríbenos por DM y aparta el tuyo.",
    "",
    "#MotosVenezuela #Motero #AccesoriosMoto",
  ].join("\n");
}

interface NewPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefilled slot; comes from the day the admin clicked, or a default. */
  initialDate: Date;
}

export function NewPostDialog({
  open,
  onOpenChange,
  initialDate,
}: NewPostDialogProps) {
  const { items } = useApp();
  const { config, addPost } = useSocial();

  const [itemId, setItemId] = useState("");
  const [when, setWhen] = useState(() =>
    format(initialDate, "yyyy-MM-dd'T'HH:mm"),
  );
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(
    config.platforms.length > 0 ? config.platforms : ["instagram", "facebook"],
  );
  const [caption, setCaption] = useState("");
  const [statement, setStatement] = useState("");
  const [calloutsText, setCalloutsText] = useState("");
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(
    () =>
      items
        .filter((i) => i.quantity > 0 && i.images.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );
  const selected = candidates.find((i) => i.id === itemId);

  const handleSelect = (id: string) => {
    setItemId(id);
    const item = candidates.find((i) => i.id === id);
    if (!item) return;
    const design = designFor(item);
    setCaption(captionFor(item, config.businessName));
    setStatement(design.statement);
    setCalloutsText(
      design.callouts.map((c) => c.label.replace("\n", " ")).join("\n"),
    );
  };

  const handleSave = async () => {
    if (!selected) {
      toast.error("Elige un producto.");
      return;
    }
    const design = designFor(selected);
    design.statement = statement.trim() || design.statement;
    const callouts = calloutsText
      .split("\n")
      .map((l) => l.trim().toUpperCase())
      .filter((l) => l !== "")
      .slice(0, 4)
      // Two-word labels break onto two lines inside the box, like the
      // generated ones ("DOBLE VISOR" -> "DOBLE\nVISOR").
      .map((l) => ({ label: l.replace(" ", "\n"), x: null, y: null }));
    if (callouts.length >= 3) design.callouts = callouts;

    setSaving(true);
    const result = await addPost({
      itemId: selected.id,
      itemName: selected.name,
      images: selected.images.slice(0, 4),
      caption,
      design,
      scheduledAt: new Date(when),
      platforms,
    });
    setSaving(false);
    if (result.success) {
      toast.success("Post agregado al calendario.");
      onOpenChange(false);
    } else {
      toast.error(result.error ?? "No se pudo agregar el post.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar post</DialogTitle>
          <DialogDescription>
            Elige el producto y el momento; los textos se rellenan solos y
            puedes ajustarlos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Producto</Label>
            <Select value={itemId} onValueChange={handleSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un producto con stock" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="flex gap-2 overflow-x-auto">
              {selected.images.slice(0, 4).map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-20 rounded-md border border-gray-200 object-cover"
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-when">Fecha y hora</Label>
              <Input
                id="new-when"
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

          {selected && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="new-caption">Descripción</Label>
                <Textarea
                  id="new-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-statement">Eslogan (imagen)</Label>
                  <Input
                    id="new-statement"
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                    placeholder="DOMINA EL ASFALTO."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-callouts">
                    Características (una por línea, 3–4)
                  </Label>
                  <Textarea
                    id="new-callouts"
                    value={calloutsText}
                    onChange={(e) => setCalloutsText(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !selected}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Agregar al calendario
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
