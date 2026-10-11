import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared demo portrait, used wherever a person has not uploaded their own.
 *
 * A local file rather than an external URL: no network dependency, and the
 * demo looks the same offline. Replace `public/avatar.jpg` to change it.
 */
const DEMO_AVATAR = "/avatar.jpg";

export function Avatar({
  src,
  name,
  className,
}: {
  /** Uploaded picture (data URL) or a path. Falls back to the demo portrait. */
  src?: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const source = src || DEMO_AVATAR;

  // Initials are the last resort, not the default — if the image 404s we still
  // render something legible rather than a broken-image icon.
  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-primary/10 font-display font-bold text-primary",
          className
        )}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("rounded-2xl bg-muted object-cover", className)}
    />
  );
}
