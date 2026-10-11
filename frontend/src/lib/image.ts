/**
 * Client-side image preparation for avatar upload.
 *
 * A phone photo is 3–8 MB and 4000px wide. The avatar is rendered at 36px in
 * the sidebar. Sending the original would blow the backend's 400,000-character
 * cap on the first try, and shipping a 4000px JPEG to every leaderboard row is
 * a slow page for no visible gain — so the browser resizes before uploading,
 * and the network never carries the original at all.
 */

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const AVATAR_MAX_DIM = 512;
export const AVATAR_QUALITY = 0.85;

/** The three the backend accepts. Anything else is refused before reading. */
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Matches the cap in app/routers/auth.py. Kept here so the browser can refuse
 * a payload the server would refuse, instead of learning about it from a 422.
 */
export const AVATAR_MAX_DATA_URL_CHARS = 400_000;

export type ImageProblem = "type" | "size" | "decode" | "encode";

export class ImageError extends Error {
  constructor(public problem: ImageProblem) {
    super(`image ${problem}`);
    this.name = "ImageError";
  }
}

/** Type and size, checked before a single byte is read. */
export function validateImageFile(file: File): void {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageError("type");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new ImageError("size");
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap with imageOrientation applies the EXIF rotation a phone
  // camera writes instead of rotating the pixels. Skip it and a portrait
  // selfie arrives sideways — the single most common bug in avatar uploads.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* Safari < 15 and friends: fall through to the <img> path. */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ImageError("decode"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decode, downscale so the longest edge is at most `maxDim`, re-encode as
 * JPEG, and return a data URL.
 *
 * Never upscales: a 96px avatar stays 96px rather than being stretched to 512
 * and re-compressed for nothing.
 */
export async function resizeImageToDataUrl(
  file: File,
  maxDim = AVATAR_MAX_DIM,
  quality = AVATAR_QUALITY
): Promise<string> {
  validateImageFile(file);

  const source = await decode(file);
  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  if (!width || !height) throw new ImageError("decode");

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("encode");

  // JPEG has no alpha channel. Without this, a transparent PNG composites
  // onto the canvas's default transparent black and the avatar arrives with a
  // black background instead of a white one.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  if ("close" in source) source.close();

  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  // The 512px/0.85 defaults land far under the cap for ordinary photographs,
  // but "ordinary" is doing work in that sentence — a dense, noisy image
  // compresses badly. Rather than trust the estimate, step the quality down
  // until it actually fits. The alternative is a 422 the user cannot act on.
  let attempt = quality;
  while (dataUrl.length > AVATAR_MAX_DATA_URL_CHARS && attempt > 0.4) {
    attempt -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", Math.max(0.4, attempt));
  }
  if (dataUrl.length > AVATAR_MAX_DATA_URL_CHARS) throw new ImageError("size");

  return dataUrl;
}
