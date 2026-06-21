import { supabase, PRODUCT_IMAGES_BUCKET } from "./supabase";

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.72;
const WEBP_QUALITY = 0.78;

// WebP at this quality is visually equivalent to the JPEG fallback but
// roughly 25-35% smaller, which directly cuts image download time.
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function compressToBlob(
  file: File,
): Promise<{ blob: Blob; ext: string; contentType: string }> {
  const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

  const webpBlob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
  if (webpBlob)
    return { blob: webpBlob, ext: "webp", contentType: "image/webp" };

  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (!jpegBlob) throw new Error("toBlob failed");
  return { blob: jpegBlob, ext: "jpg", contentType: "image/jpeg" };
}

// Compresses then uploads to the public `product-images` Supabase Storage
// bucket, returning public URLs — keeps DB rows small (text[] of URLs)
// instead of bloating Postgres with base64 image data.
export async function uploadImage(file: File): Promise<string> {
  const { blob, ext, contentType } = await compressToBlob(file);
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, blob, { contentType });
  if (error) throw error;
  const { data } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadImages(files: File[]): Promise<string[]> {
  return Promise.all(files.map(uploadImage));
}
