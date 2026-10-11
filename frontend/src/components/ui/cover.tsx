import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cover art.
 *
 * Served from `public/covers` — generated SVGs for most items, supplied
 * photographs for the communities and challenges that have curated art — so
 * there is no external request either way.
 *
 * By default the image keeps its own shape and `width`/`height` only reserve
 * space, which is what the article feed needs — it passes the photo's true
 * pixel dimensions so nothing is ever cropped or padded.
 *
 * `fit="crop"` instead treats `width`/`height` as the box the card *wants* and
 * crops into it. That is for grids of mixed-shape art: the supplied community
 * and challenge photographs run from 1.50 to 4.10, and letting each set its own
 * height leaves the cards in a row ending at different points.
 *
 * The art is decorative in a card that already names the item, so `alt` is
 * empty there by design — a screen reader announcing "cover art for X" straight
 * after the title X is noise. Where the image carries information the caller
 * passes real alt text.
 */
export function Cover({
  src,
  alt = "",
  width,
  height,
  fit = "natural",
  className,
}: {
  src?: string | null;
  alt?: string;
  width: number;
  height: number;
  /** "natural" keeps the file's own shape; "crop" fills the width/height box. */
  fit?: "natural" | "crop";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn("bg-muted", className)}
        style={{ aspectRatio: `${width} / ${height}` }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={fit === "crop" ? { aspectRatio: `${width} / ${height}` } : undefined}
      className={cn(
        "w-full object-cover",
        fit === "crop" ? "h-full" : "h-auto",
        className
      )}
    />
  );
}
