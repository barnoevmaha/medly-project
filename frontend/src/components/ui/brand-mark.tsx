import { cn } from "@/lib/utils";

/**
 * The Medly logo mark.
 *
 * Replaces the gradient tile with a bold "M" that stood in for the logo before
 * the artwork existed. The supplied file is raster, not vector, so this is a
 * PNG with the white paper it was photographed on cut out — which is what lets
 * it sit on the card background in either theme without a plate behind it.
 *
 * Decorative in every current use: the word "Medly" is always rendered beside
 * it, so announcing the mark as well would just repeat the brand name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      className={cn("object-contain", className)}
    />
  );
}
