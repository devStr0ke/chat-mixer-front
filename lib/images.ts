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

const AVATAR_SIZE = 256;

/**
 * Center-crops a picture to a 256px square for use as an avatar, stripping
 * metadata along the way. GIFs are kept as-is so animated avatars still move.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(AVATAR_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();

  const webp = await canvasToBlob(canvas, "image/webp", QUALITY);
  if (webp?.type === "image/webp") return webp;
  return (await canvasToBlob(canvas, "image/png", QUALITY)) ?? file;
}
