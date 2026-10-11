import { useEffect, useRef } from "react";

/**
 * Two pupils that follow the cursor, layered over the launcher's bot glyph.
 *
 * Entirely self-contained: it renders an absolutely-positioned SVG on the
 * same 24-unit grid lucide uses, so the pupils sit exactly on the bot icon's
 * own eyes (x=9 and x=15, y=14). Nothing about the button — size, colour,
 * gradient, shadow, position — is touched, and deleting this component's two
 * lines from AssistantWidget restores the previous button exactly.
 *
 * It stays still when it should: no pointer that hovers (touch), or a
 * reduced-motion preference from either the OS or Medly's own setting.
 *
 * The rAF loop is not permanent. It starts when the cursor moves and stops
 * once the pupils have settled, so an idle tab does no work.
 */

/** How far a pupil may travel from centre, in SVG units. Deliberately small. */
const RADIUS = 1.15;
/** Fraction of the remaining distance covered per frame — the easing. */
const EASING = 0.18;
/** Below this, the pupils have arrived and the loop can stop. */
const SETTLED = 0.01;

const EYES = [
  { x: 9, y: 14 },
  { x: 15, y: 14 },
];

function prefersStillness(): boolean {
  if (typeof window === "undefined") return true;
  // A device whose primary pointer cannot hover has no cursor to follow.
  const noHover = window.matchMedia("(hover: none)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Medly's own Appearance setting writes this class onto <html>.
  const appReduced = document.documentElement.classList.contains("reduce-motion");
  return noHover || reduced || appReduced;
}

export function AssistantEyes() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRefs = useRef<Array<SVGCircleElement | null>>([null, null]);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (prefersStillness()) return;

    const draw = () => {
      pupilRefs.current.forEach((pupil, i) => {
        if (!pupil) return;
        pupil.setAttribute("cx", String(EYES[i].x + current.current.x));
        pupil.setAttribute("cy", String(EYES[i].y + current.current.y));
      });
    };

    const step = () => {
      raf.current = null;
      const dx = target.current.x - current.current.x;
      const dy = target.current.y - current.current.y;
      current.current.x += dx * EASING;
      current.current.y += dy * EASING;
      draw();
      // Keep going only while there is still distance to cover.
      if (Math.abs(dx) > SETTLED || Math.abs(dy) > SETTLED) {
        raf.current = requestAnimationFrame(step);
      }
    };

    const onMove = (event: PointerEvent) => {
      const node = svgRef.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const distance = Math.hypot(dx, dy) || 1;

      // Normalise to a direction, then scale by RADIUS. Close to the button
      // the pupils ease toward centre rather than snapping to the rim.
      const reach = Math.min(1, distance / 240);
      target.current = {
        x: (dx / distance) * RADIUS * reach,
        y: (dy / distance) * RADIUS * reach,
      };
      if (raf.current === null) raf.current = requestAnimationFrame(step);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 24 24"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      {EYES.map((eye, i) => (
        <circle
          key={i}
          ref={(node) => {
            pupilRefs.current[i] = node;
          }}
          cx={eye.x}
          cy={eye.y}
          r={1.1}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
