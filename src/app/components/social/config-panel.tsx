// Configuration for the Redes Sociales module: who we are (name, logo), how
// posts should feel (style prompt), which AI does the writing/enhancing, and
// the generation cadence. Everything lands in the single social_config row;
// the API key never leaves the database except into the server-side
// generation function.

import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
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
import { uploadImage } from "../../services/image-utils";
import {
  useSocial,
  type SocialConfig,
  type SocialPlatform,
  type SocialProvider,
} from "../../context/social-context";

const PROVIDERS: { key: SocialProvider; label: string; hint: string }[] = [
  { key: "none", label: "Sin IA (plantillas)", hint: "Textos genéricos, fotos tal cual" },
  { key: "gemini", label: "Google Gemini", hint: "Textos + mejora de fotos" },
  { key: "openai", label: "OpenAI (ChatGPT)", hint: "Textos + mejora de fotos" },
  { key: "anthropic", label: "Anthropic (Claude)", hint: "Solo textos" },
];

const PLATFORMS: { key: SocialPlatform; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
];

export function ConfigPanel() {
  const { config, saveConfig } = useSocial();
  const [draft, setDraft] = useState<SocialConfig>(config);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // The provider row can arrive after first render; resync until edited.
  useEffect(() => {
    setDraft(config);
  }, [config]);

  const set = <K extends keyof SocialConfig>(key: K, value: SocialConfig[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleLogoUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      set("logoUrl", url);
      toast.success("Logo subido.");
    } catch {
      toast.error("No se pudo subir el logo.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await saveConfig(draft);
    setSaving(false);
    if (result.success) {
      toast.success("Configuración guardada.");
    } else {
      toast.error(result.error ?? "No se pudo guardar.");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-4">
        <h2 className="font-medium">Identidad</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="social-name">Nombre del negocio</Label>
            <Input
              id="social-name"
              value={draft.businessName}
              onChange={(e) => set("businessName", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Logo (PNG transparente)</Label>
            <div className="flex items-center gap-3">
              {draft.logoUrl && (
                <img
                  src={draft.logoUrl}
                  alt="Logo"
                  className="h-10 rounded bg-gray-900 p-1"
                />
              )}
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleLogoUpload(e.target.files?.[0])}
                />
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span>
                    {uploading ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-1.5" />
                    )}
                    Subir
                  </span>
                </Button>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">Estilo</h2>
        <div className="space-y-1.5">
          <Label htmlFor="social-prompt">Prompt de estilo</Label>
          <Textarea
            id="social-prompt"
            value={draft.stylePrompt}
            onChange={(e) => set("stylePrompt", e.target.value)}
            rows={6}
            placeholder="Dirección creativa para la IA: tono, qué resaltar, reglas (sin precios, claims honestos, español de Venezuela)…"
          />
          <p className="text-xs text-meta">
            Se envía junto a los datos del producto en cada generación de
            textos y mejora de fotos.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">Inteligencia artificial</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Proveedor</Label>
            <Select
              value={draft.provider}
              onValueChange={(v) => set("provider", v as SocialProvider)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(({ key, label, hint }) => (
                  <SelectItem key={key} value={key}>
                    {label} — {hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="social-key">API key</Label>
            <Input
              id="social-key"
              type="password"
              value={draft.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              placeholder={draft.provider === "none" ? "No requerida" : "sk-…"}
              disabled={draft.provider === "none"}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">Cadencia</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="social-cadence">Generar cada (días)</Label>
            <Input
              id="social-cadence"
              type="number"
              min={1}
              max={60}
              value={draft.cadenceDays}
              onChange={(e) =>
                set("cadenceDays", Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="social-batch">Posts por tanda</Label>
            <Input
              id="social-batch"
              type="number"
              min={1}
              max={30}
              value={draft.postsPerBatch}
              onChange={(e) =>
                set("postsPerBatch", Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="social-time">Hora de publicación</Label>
            <Input
              id="social-time"
              type="time"
              value={draft.postTime}
              onChange={(e) => set("postTime", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Redes por defecto</Label>
          <div className="flex gap-4">
            {PLATFORMS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.platforms.includes(key)}
                  onCheckedChange={(checked) =>
                    set(
                      "platforms",
                      checked
                        ? [...draft.platforms, key]
                        : draft.platforms.filter((p) => p !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-meta">
          La tanda corre sola cuando pasan los días configurados (revisión
          diaria a las 7:00 am). Un post por día a la hora indicada, empezando
          el día siguiente. Al cerrar cada semana se eliminan los posts
          confirmados.
        </p>
      </section>

      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Guardar configuración
      </Button>
    </div>
  );
}
