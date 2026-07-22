// Deterministic post composer for the Redes Sociales module.
//
// Browser-canvas port of the approved "v3" template that marketing_posts/
// PROMPT.md documents (logo top-center, centered title stack, product as the
// protagonist, corner callout boxes, bottom statement + CTA). The AI provider
// only supplies TEXTS and enhanced PHOTOS; the layout is composed here, so
// the logo and the words never come out deformed and every post looks like
// the same brand.
//
// Fonts: Anton (display, sheared for the oblique lean) and Montserrat
// (labels), loaded globally by src/styles/fonts.css. composePost() awaits
// document.fonts so the first render doesn't fall back to Roboto.

import type { SocialPostDesign } from "../context/social-context";

export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1350;

const WHITE = "#ffffff";
const GREY = "#b9bec6";
const ACCENT = "#55a9ff";
const SCRIM = "rgba(0,0,0,";

interface ComposeOptions {
  photoUrl: string;
  logoUrl: string;
  design: SocialPostDesign;
  /** Cover slides carry the title stack + callouts; carousel slides only the
   *  logo, statement and CTA. */
  cover: boolean;
}

const CTA = "ESCRÍBENOS POR DM";

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  // Storage URLs are same-project but a different origin than the app;
  // without CORS opt-in the canvas would be tainted and toBlob would throw.
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return img;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Background: the photo itself, cover-cropped, blurred and darkened. */
function drawBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  ctx.save();
  ctx.filter = "blur(36px) brightness(0.5)";
  drawCover(ctx, img, POST_WIDTH, POST_HEIGHT);
  ctx.restore();
}

/** Where the sharp photo landed on the canvas, so callout targets given as
 *  photo fractions can be projected into canvas coordinates. */
interface PhotoPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The product, fully visible and centered — never cropped by the canvas. */
function drawProduct(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  top: number,
  bottom: number,
): PhotoPlacement {
  const sidePad = 40;
  const availW = POST_WIDTH - sidePad * 2;
  const availH = bottom - top;
  const scale = Math.min(availW / img.width, availH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (POST_WIDTH - dw) / 2;
  const dy = top + (availH - dh) / 2;
  // Feathered edges: draw into an offscreen canvas and erase a soft border
  // with destination-out gradients so the photo melts into the background.
  const placement: PhotoPlacement = { x: dx, y: dy, w: dw, h: dh };
  const off = document.createElement("canvas");
  off.width = Math.ceil(dw);
  off.height = Math.ceil(dh);
  const octx = off.getContext("2d");
  if (!octx) return placement;
  octx.drawImage(img, 0, 0, dw, dh);
  octx.globalCompositeOperation = "destination-out";
  const f = 34;
  const fade = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CanvasGradient => {
    const g = octx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    return g;
  };
  octx.fillStyle = fade(0, 0, f, 0);
  octx.fillRect(0, 0, f, off.height);
  octx.fillStyle = fade(off.width, 0, off.width - f, 0);
  octx.fillRect(off.width - f, 0, f, off.height);
  octx.fillStyle = fade(0, 0, 0, f);
  octx.fillRect(0, 0, off.width, f);
  octx.fillStyle = fade(0, off.height, 0, off.height - f);
  octx.fillRect(0, off.height - f, off.width, f);
  ctx.drawImage(off, dx, dy);
  return placement;
}

function scrim(
  ctx: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  alphaTop: number,
  alphaBottom: number,
) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `${SCRIM}${alphaTop})`);
  g.addColorStop(1, `${SCRIM}${alphaBottom})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, POST_WIDTH, y1 - y0);
}

/** Uppercase tracked text, centered. Returns the width actually drawn. */
function trackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  font: string,
  fill: string,
  tracking: number,
): number {
  ctx.font = font;
  const chars = [...text];
  const width =
    chars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) +
    tracking * Math.max(0, chars.length - 1);
  let x = cx - width / 2;
  ctx.fillStyle = fill;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
  return width;
}

/** Anton line, sheared right for the oblique lean the brand style uses. */
function obliqueText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.font = `${size}px Anton, sans-serif`;
  const tracking = size * 0.05;
  const chars = [...text];
  const width =
    chars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) +
    tracking * Math.max(0, chars.length - 1);
  ctx.transform(1, 0, -0.22, 1, cx - width / 2 + 0.22 * y, 0);
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = WHITE;
  let x = 0;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
  ctx.restore();
}

function fitObliqueSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
): number {
  let size = startSize;
  while (size > 40) {
    ctx.font = `${size}px Anton, sans-serif`;
    const tracking = size * 0.05;
    const width =
      [...text].reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) +
      tracking * Math.max(0, text.length - 1);
    if (width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

function drawCta(ctx: CanvasRenderingContext2D, cy: number) {
  ctx.font = "700 25px Montserrat, sans-serif";
  const tracking = 4;
  const chars = [...CTA];
  const textW =
    chars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) +
    tracking * (chars.length - 1);
  const arrow = 14;
  let x = POST_WIDTH / 2 - (textW + 16 + arrow) / 2;
  ctx.fillStyle = ACCENT;
  for (const ch of chars) {
    ctx.fillText(ch, x, cy);
    x += ctx.measureText(ch).width + tracking;
  }
  ctx.beginPath();
  ctx.moveTo(x + 16, cy - 18);
  ctx.lineTo(x + 16 + arrow, cy - 9);
  ctx.lineTo(x + 16, cy);
  ctx.closePath();
  ctx.fill();
}

/** Corner callout: outlined box + a connector ending in a ring+dot. When the
 *  generator localized the feature the label mentions, `target` carries its
 *  canvas position and the line bends once to land exactly there — the same
 *  "intentional lines" rule the manual workflow follows. Without a target it
 *  falls back to a short line reaching toward the product. */
function drawCallout(
  ctx: CanvasRenderingContext2D,
  label: string,
  corner: "tl" | "tr" | "bl" | "br",
  y: number,
  target: { x: number; y: number } | null,
) {
  const lines = label.split("\n");
  ctx.font = "700 23px Montserrat, sans-serif";
  const lineH = 31;
  const pad = 14;
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width + 2 * l.length));
  const bw = textW + pad * 2;
  const bh = lines.length * lineH + pad * 2 - 6;
  const x = corner.endsWith("l") ? 44 : POST_WIDTH - 44 - bw;

  ctx.fillStyle = "rgba(10,10,14,0.43)";
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, bw, bh);
  ctx.fillStyle = WHITE;
  lines.forEach((line, i) => {
    let cx2 = x + pad;
    for (const ch of [...line]) {
      ctx.fillText(ch, cx2, y + pad + 18 + i * lineH);
      cx2 += ctx.measureText(ch).width + 2;
    }
  });

  // connector: vertical run out of the box, then one bend to the target
  const cx = x + bw / 2;
  const down = corner.startsWith("t");
  const y0 = down ? y + bh + 2 : y - 2;
  let y1: number;
  let tx: number;
  let ty: number;
  if (target) {
    const run = Math.max(
      30,
      Math.min(70, Math.abs(target.y - y0) * 0.45),
    );
    y1 = down ? y0 + run : y0 - run;
    tx = target.x;
    ty = target.y;
  } else {
    y1 = down ? y0 + 46 : y0 - 46;
    tx = corner.endsWith("l") ? cx + 120 : cx - 120;
    ty = down ? y1 + 70 : y1 - 70;
  }
  ctx.strokeStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(cx, y1);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx, ty, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx, ty, 4, 0, Math.PI * 2);
  ctx.fillStyle = WHITE;
  ctx.fill();
}

/** Compose one slide. Returns a JPEG blob ready to download or preview. */
export async function composePost(options: ComposeOptions): Promise<Blob> {
  const { photoUrl, logoUrl, design, cover } = options;
  await document.fonts.load("96px Anton");
  await document.fonts.load("700 25px Montserrat");

  const canvas = document.createElement("canvas");
  canvas.width = POST_WIDTH;
  canvas.height = POST_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  const photo = await loadImage(photoUrl);
  const logo = logoUrl ? await loadImage(logoUrl).catch(() => null) : null;

  drawBackground(ctx, photo);

  // ---- vertical layout ----
  const logoH = 92;
  const logoEnd = 44 + (logo ? logoH : 0);
  let titleEnd = logoEnd + 20;
  const t2Size = cover
    ? fitObliqueSize(ctx, design.t2 || " ", POST_WIDTH - 320, 96)
    : 0;
  if (cover) {
    titleEnd = logoEnd + 26 + 58 + t2Size * 1.25 + 44;
  }

  const stSize = fitObliqueSize(
    ctx,
    design.statement || " ",
    POST_WIDTH - 140,
    58,
  );
  const stY = POST_HEIGHT - 60 - 40 - 14;
  const productBottom = stY - stSize - 40 + (cover ? 150 : 110);
  const productTop = cover ? titleEnd - 30 : logoEnd + 40;

  const placement = drawProduct(ctx, photo, productTop, productBottom);

  scrim(ctx, 0, titleEnd + 60, cover ? 0.69 : 0.63, 0);
  scrim(ctx, stY - stSize - 90, POST_HEIGHT, 0, 0.88);

  // ---- logo ----
  if (logo) {
    const lw = Math.min(340, logo.width);
    const lh = (logo.height / logo.width) * lw;
    const scale = Math.min(1, logoH / lh);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(
      logo,
      (POST_WIDTH - lw * scale) / 2,
      44,
      lw * scale,
      lh * scale,
    );
    ctx.restore();
  }

  // ---- title stack (cover only) ----
  if (cover) {
    const y1 = logoEnd + 26 + 44;
    trackedText(
      ctx,
      design.t1.toUpperCase(),
      POST_WIDTH / 2,
      y1,
      "700 44px Montserrat, sans-serif",
      WHITE,
      10,
    );
    obliqueText(
      ctx,
      design.t2.toUpperCase(),
      POST_WIDTH / 2,
      y1 + 14 + t2Size,
      t2Size,
    );
    trackedText(
      ctx,
      design.t3.toUpperCase(),
      POST_WIDTH / 2,
      y1 + 14 + t2Size + 44,
      "600 30px Montserrat, sans-serif",
      GREY,
      6,
    );
  }

  // ---- callouts (cover only) ----
  if (cover) {
    const corners: ("tl" | "tr" | "bl" | "br")[] = ["tl", "tr", "bl", "br"];
    const topY = titleEnd + 26;
    const botY = stY - stSize - 200;
    design.callouts.slice(0, 4).forEach((callout, i) => {
      const corner = corners[i];
      // Targets come as fractions of the FIRST photo; only the cover shows
      // that photo, so projecting through its placement is exact.
      const target =
        callout.x !== null && callout.y !== null
          ? {
              x: placement.x + callout.x * placement.w,
              y: placement.y + callout.y * placement.h,
            }
          : null;
      drawCallout(
        ctx,
        callout.label,
        corner,
        corner.startsWith("t") ? topY : botY,
        target,
      );
    });
  }

  // ---- statement + CTA ----
  obliqueText(ctx, design.statement.toUpperCase(), POST_WIDTH / 2, stY, stSize);
  drawCta(ctx, stY + 44);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob falló"))),
      "image/jpeg",
      0.93,
    );
  });
}
