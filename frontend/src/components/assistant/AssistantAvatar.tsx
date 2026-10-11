import { useEffect, useRef } from "react";

/**
 * EVE — the Medly AI character.
 *
 * Translated from the After Effects export in `E V E.json`. The silhouette,
 * proportions and palette are the Lottie's own — its bezier paths, converted
 * to SVG and framed by the head layer's local coordinate space — but none of
 * the animation runtime came with them. A static SVG is what lets the eyes
 * follow the cursor, and it keeps lottie-web out of the bundle entirely.
 *
 * The launcher is 56px, so the character is drawn from the head up: at that
 * size the full body, hands and floor shadow in the source file resolve to a
 * few grey pixels, while the head fills the button and the eyes stay large
 * enough to read. Everything visible here is traced from the JSON.
 *
 * Two expressions ship, both lifted from the source keyframes: the open eye
 * (frame 0) and the happy squint (frame 30). The squint shows on hover of the
 * launcher through `group-hover`, so it costs no React state.
 *
 * Motion opts out three ways — a pointer that cannot hover, the OS
 * reduced-motion setting, and Medly's own Appearance setting. The blink is
 * CSS, so the existing `.reduce-motion` rules in index.css already silence it.
 */

/* ---------- palette, straight from the file's fill values ---------- */
const SHELL = "#A2C0DC"; // [0.635, 0.753, 0.863] — head, ear cups, antenna
const VISOR = "#000072"; // [0, 0, 0.447]         — face screen
const EYE = "#00CFFF"; // [0, 0.812, 1]         — eyes
const FIN = "#2FE4F7"; // [0.184, 0.894, 0.969] — side fins

/* ---------- geometry, in the head layer's own units ----------
   Listed in paint order. The viewBox below frames x 7.5–502.8, y 5.5–377.1,
   which is the union of every path's bounding box. */
const FIN_LEFT =
  "M22.6,169.8C22.6,169.8 31.0,89.8 31.0,89.8C32.1,79.6 36.9,70.1 44.6,63.2C48.4,59.7 54.5,62.2 54.8,67.4C54.8,67.4 60.4,169.8 60.4,169.8C60.4,169.8 22.6,169.8 22.6,169.8Z";
const FIN_RIGHT =
  "M487.7,169.8C487.7,169.8 479.3,89.8 479.3,89.8C478.2,79.6 473.4,70.1 465.7,63.2C461.9,59.7 455.8,62.2 455.5,67.4C455.5,67.4 449.9,169.8 449.9,169.8C449.9,169.8 487.7,169.8 487.7,169.8Z";
const EAR_LEFT =
  "M67.8,297.3C60.8,298.4 53.9,298.8 47.4,298.8C26.4,298.8 9.2,282.4 7.5,261.5C5.1,232.2 6.0,207.3 7.5,189.5C9.1,170.6 23.7,155.4 42.5,152.9C48.0,152.2 53.1,151.7 57.3,151.4C64.3,150.9 70.3,156.1 70.8,163.1C70.8,163.1 79.5,282.7 79.5,282.7C80.0,289.9 74.9,296.2 67.8,297.3Z";
const EAR_RIGHT =
  "M442.4,297.3C449.4,298.4 456.4,298.8 462.9,298.8C483.9,298.8 501.1,282.4 502.8,261.5C505.2,232.2 504.3,207.3 502.8,189.5C501.2,170.6 486.6,155.4 467.8,152.9C462.3,152.2 457.2,151.7 453.0,151.4C446.0,150.9 440.0,156.1 439.5,163.1C439.5,163.1 430.8,282.7 430.8,282.7C430.3,289.9 435.3,296.2 442.4,297.3Z";
const ANTENNA =
  "M255.1,40.6C295.4,40.6 327.1,47.3 327.1,47.3C327.1,47.3 317.7,24.3 317.7,24.3C315.1,17.9 309.7,13.0 303.0,11.1C293.6,8.5 277.9,5.5 255.1,5.5C232.3,5.5 216.7,8.5 207.3,11.1C200.6,13.0 195.2,17.9 192.6,24.3C192.6,24.3 183.2,47.3 183.2,47.3C183.2,47.3 214.8,40.6 255.1,40.6Z";
const SHELL_PATH =
  "M255.1,377.1C474.1,377.1 465.8,223.2 465.8,223.2C465.8,21.4 255.1,32.3 255.1,32.3C255.1,32.3 44.4,21.4 44.4,223.2C44.4,223.2 36.8,377.1 255.1,377.1Z";
const VISOR_PATH =
  "M224.7,305.7C244.8,301.7 265.5,301.7 285.6,305.7C438.1,335.7 435.5,234.4 435.5,234.4C435.5,94.1 255.1,102.4 255.1,102.4C255.1,102.4 74.8,94.1 74.8,234.4C74.8,234.4 72.2,335.7 224.7,305.7Z";
const VISOR_BAND =
  "M434.4,216.6C429.9,241.9 406.6,300.7 285.6,276.9C265.5,272.9 244.8,272.9 224.7,276.9C103.7,300.7 80.4,241.9 75.9,216.6C75.2,222.3 74.8,228.2 74.8,234.4C74.8,234.4 72.2,335.7 224.7,305.7C244.8,301.7 265.5,301.7 285.6,305.7C438.1,335.7 435.5,234.4 435.5,234.4C435.5,228.2 435.1,222.3 434.4,216.6Z";
const VISOR_RIM =
  "M79.5,244.8C79.5,108.2 255.1,116.2 255.1,116.2C255.1,116.2 430.8,108.2 430.8,244.8C430.8,244.8 431.0,256.1 425.6,270.0C435.9,251.8 435.5,234.4 435.5,234.4C435.5,94.1 255.1,102.4 255.1,102.4C255.1,102.4 74.8,94.1 74.8,234.4C74.8,234.4 74.4,251.8 84.7,270.0C79.3,256.1 79.5,244.8 79.5,244.8Z";

/* Frame 0 of the eye layers — the resting, open eye. */
const EYE_L_OPEN =
  "M151.6,235.3C151.2,234.5 150.5,230.8 150.5,229.0C150.7,228.3 150.7,224.7 152.2,220.3C155.4,211.1 160.6,203.7 174.2,202.5C191.9,201.0 199.6,213.6 201.5,219.3C203.0,223.7 203.5,227.3 202.7,233.3C202.4,235.4 200.0,241.7 198.2,243.7C191.7,250.8 186.7,254.0 177.6,254.0C166.8,254.0 161.2,249.1 158.0,246.2C154.5,243.1 153.1,238.1 151.6,235.3Z";
const EYE_R_OPEN =
  "M308.6,235.3C308.2,234.5 307.5,230.8 307.5,229.0C307.7,228.3 307.7,224.7 309.2,220.3C312.4,211.1 317.6,203.7 331.2,202.5C348.9,201.0 356.6,213.6 358.5,219.3C360.0,223.7 360.5,227.3 359.7,233.3C359.4,235.4 357.0,241.7 355.2,243.7C348.7,250.8 343.7,254.0 334.6,254.0C323.8,254.0 318.2,249.1 315.0,246.2C311.5,243.1 310.1,238.1 308.6,235.3Z";

/* Frame 30 — the happy squint the character holds while it waves. */
const EYE_L_HAPPY =
  "M146.1,237.8C145.1,237.8 144.2,237.6 143.2,237.3C138.8,235.7 136.5,230.8 138.1,226.4C142.7,213.6 157.6,203.9 174.2,202.5C191.2,201.1 205.7,208.9 214.1,223.8C216.4,227.9 215.0,233.0 210.9,235.3C206.8,237.6 201.6,236.2 199.3,232.1C192.5,219.9 181.5,218.8 175.6,219.3C164.9,220.2 156.0,226.7 154.0,232.2C152.8,235.6 149.6,237.8 146.1,237.8Z";
const EYE_R_HAPPY =
  "M303.1,237.8C302.1,237.8 301.2,237.6 300.2,237.3C295.8,235.7 293.5,230.8 295.1,226.4C299.7,213.6 314.6,203.9 331.2,202.5C348.2,201.1 362.7,208.9 371.1,223.8C373.4,227.9 371.9,233.0 367.8,235.3C363.7,237.6 358.6,236.2 356.3,232.1C349.5,219.9 338.5,218.8 332.6,219.3C321.9,220.2 313.0,226.7 311.0,232.2C309.8,235.6 306.6,237.8 303.1,237.8Z";

/* ---------- cursor tracking ---------- */
/** How far the eyes may drift from rest, in viewBox units. Deliberately small:
 *  at the launcher's rendered size this is under two device pixels. */
const TRAVEL = 22;
/** Fraction of the remaining distance covered per frame — the easing. */
const EASING = 0.18;
/** Below this the eyes have arrived and the loop can stop. */
const SETTLED = 0.05;
/** Cursor distance, in px, at which the drift reaches its full extent. */
const REACH_PX = 260;

function stillnessQueries() {
  return [
    window.matchMedia("(hover: none)"),
    window.matchMedia("(prefers-reduced-motion: reduce)"),
  ];
}

/** True when the eyes should not track: no hoverable pointer, the OS asked for
 *  less motion, or Medly's own Appearance setting did. */
function prefersStillness(): boolean {
  if (typeof window === "undefined") return true;
  const [noHover, reduced] = stillnessQueries();
  return (
    noHover.matches ||
    reduced.matches ||
    document.documentElement.classList.contains("reduce-motion")
  );
}

export function AssistantAvatar({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let detach: (() => void) | null = null;

    const draw = () => {
      const node = eyesRef.current;
      if (!node) return;
      const { x, y } = current.current;
      node.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    };

    const step = () => {
      raf.current = null;
      const dx = target.current.x - current.current.x;
      const dy = target.current.y - current.current.y;
      current.current.x += dx * EASING;
      current.current.y += dy * EASING;
      draw();
      // Keep going only while there is still distance to cover, so an idle
      // tab does no work.
      if (Math.abs(dx) > SETTLED || Math.abs(dy) > SETTLED) {
        raf.current = requestAnimationFrame(step);
      }
    };

    const onMove = (event: PointerEvent) => {
      const node = svgRef.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy) || 1;

      // Normalise to a direction, then scale by TRAVEL. Close to the button the
      // eyes ease back toward centre rather than snapping to the rim, which is
      // what keeps the movement from reading as twitchy.
      const reach = Math.min(1, distance / REACH_PX);
      target.current = {
        x: (dx / distance) * TRAVEL * reach,
        y: (dy / distance) * TRAVEL * reach,
      };
      if (raf.current === null) raf.current = requestAnimationFrame(step);
    };

    const start = () => {
      if (detach) return;
      window.addEventListener("pointermove", onMove, { passive: true });
      detach = () => window.removeEventListener("pointermove", onMove);
    };

    const stop = () => {
      detach?.();
      detach = null;
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      // Return to rest rather than freezing mid-glance.
      current.current = { x: 0, y: 0 };
      target.current = { x: 0, y: 0 };
      draw();
    };

    const sync = () => (prefersStillness() ? stop() : start());

    sync();
    // Toggling reduced motion at the OS level takes effect without a reload.
    const queries = stillnessQueries();
    queries.forEach((q) => q.addEventListener("change", sync));

    return () => {
      queries.forEach((q) => q.removeEventListener("change", sync));
      stop();
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 510 384"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* behind the shell: side fins and ear cups */}
      <path d={FIN_LEFT} fill={FIN} />
      <path d={FIN_RIGHT} fill={FIN} />
      <path d={EAR_LEFT} fill={SHELL} />
      <path d={EAR_RIGHT} fill={SHELL} />
      <path d={ANTENNA} fill={SHELL} />

      {/* the head itself */}
      <path d={SHELL_PATH} fill={SHELL} />
      <path d={VISOR_PATH} fill={VISOR} />
      <path d={VISOR_BAND} fill={VISOR} />
      <path d={VISOR_RIM} fill="#FFFFFF" opacity={0.9} />

      {/* The eyes ride on this group; only its transform changes. The two
          expressions cross-fade on hover of the launcher — with no `group`
          ancestor, as in the panel header, the open eyes simply stay. */}
      <g ref={eyesRef}>
        <g className="transition-opacity duration-150 group-hover:opacity-0">
          <path className="eve-eye" d={EYE_L_OPEN} fill={EYE} />
          <path className="eve-eye" d={EYE_R_OPEN} fill={EYE} />
        </g>
        <g className="opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <path d={EYE_L_HAPPY} fill={EYE} />
          <path d={EYE_R_HAPPY} fill={EYE} />
        </g>
      </g>
    </svg>
  );
}
