const MAX_DIMENSION = 2048;
const QUALITY = 0.85;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscales a photo to at most 2048px and re-encodes it, which also strips
 * EXIF metadata such as GPS location. GIFs are returned untouched so they
 * stay animated.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = await canvasToBlob(canvas, "image/webp", QUALITY);
  if (webp?.type === "image/webp") return webp;
  // browsers without WebP encoding: keep PNG transparency, JPEG otherwise
  const fallback = await canvasToBlob(canvas, file.type === "image/png" ? "image/png" : "image/jpeg", QUALITY);
  return fallback ?? file;
}
