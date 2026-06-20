import { supabase, PRODUCT_IMAGES_BUCKET } from "./supabase";

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.72;

function compressToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          JPEG_QUALITY,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Compresses then uploads to the public `product-images` Supabase Storage
// bucket, returning public URLs — keeps DB rows small (text[] of URLs)
// instead of bloating Postgres with base64 image data.
export async function uploadImage(file: File): Promise<string> {
  const blob = await compressToBlob(file);
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadImages(files: File[]): Promise<string[]> {
  return Promise.all(files.map(uploadImage));
}
