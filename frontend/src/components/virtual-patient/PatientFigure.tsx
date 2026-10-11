import { useEffect, useRef, useState } from "react";
import { PatientAvatar, type PatientExpression } from "@/components/virtual-patient/PatientAvatar";
import { readPreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * The patient, drawn however the scenario supplies them.
 *
 * A case may point `cover` at a Lottie file in `public/lottie`. When it does,
 * that animation is the patient. When it does not — or when the file is missing
 * or malformed — this falls back to the authored SVG avatar, so a scenario
 * never renders an empty box because an asset failed.
 *
 * lottie-web is imported dynamically: it is the heaviest dependency in the app
 * and only the Virtual Patient pages need it, so it stays out of the initial
 * bundle and off every other route.
 */
export function PatientFigure({
  cover,
  expression,
  age,
  sex,
  name,
  size = 200,
  className,
}: {
  /** Path under /lottie, or empty for the drawn avatar. */
  cover?: string;
  expression: PatientExpression;
  age?: number;
  /** Passed to the drawn avatar so the figure matches the case demographic. */
  sex?: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const isLottie = Boolean(cover && cover.endsWith(".json"));
  // Flips to true if the file or the player fails, which hands over to the SVG.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isLottie || failed) return;
    let animation: { destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const lottie = (await import("lottie-web")).default;
        if (cancelled || !host.current) return;
        animation = lottie.loadAnimation({
          container: host.current,
          renderer: "svg",
          // A still patient is the point under reduced motion, not a paused
          // one: the first frame is drawn and nothing moves after it.
          loop: !readPreferences().reduceMotion,
          autoplay: !readPreferences().reduceMotion,
          path: cover,
        });
        // A 404 or malformed file surfaces here rather than as an empty frame.
        (animation as unknown as { addEventListener: (e: string, f: () => void) => void })
          .addEventListener("data_failed", () => setFailed(true));
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [cover, isLottie, failed]);

  if (!isLottie || failed) {
    return (
      <PatientAvatar
        expression={expression}
        age={age}
        sex={sex}
        name={name}
        size={size}
        className={className}
      />
    );
  }

  return (
    <div
      ref={host}
      role="img"
      aria-label={name ? `Illustration of ${name}` : "Patient illustration"}
      style={{ width: size, height: size }}
      className={cn("shrink-0", className)}
    />
  );
}
