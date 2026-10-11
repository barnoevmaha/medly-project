import type { Finding, Modality } from "@/lib/api";

/**
 * Stand-in for the film.
 *
 * There is no real imaging here and there never should be — this is a training
 * apparatus, not a device, and no patient data touches this project. The panel
 * is generated from the case reference so it is stable across reloads, and the
 * bounding boxes are the model's actual normalised output drawn over it.
 */
export function FilmViewer({
  caseRef,
  modality,
  findings,
  revealed,
}: {
  caseRef: string;
  modality: Modality;
  findings: Finding[];
  /** Boxes stay hidden until the student has committed their own reading. */
  revealed: boolean;
}) {
  // Deterministic per case reference, so the same case always looks the same.
  let hash = 0;
  for (let i = 0; i < caseRef.length; i++) hash = (hash * 31 + caseRef.charCodeAt(i)) >>> 0;
  const tilt = ((hash % 7) - 3) * 0.4;
  const brightness = 0.55 + ((hash >> 3) % 20) / 100;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-slate-950">
      <svg viewBox="0 0 400 400" className="h-auto w-full" role="img" aria-label={`Synthetic ${modality} panel for ${caseRef}`}>
        <defs>
          <radialGradient id={`lung-${hash}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor={`rgba(255,255,255,${brightness * 0.35})`} />
            <stop offset="70%" stopColor="rgba(120,140,170,0.16)" />
            <stop offset="100%" stopColor="rgba(10,14,25,1)" />
          </radialGradient>
        </defs>

        <rect width="400" height="400" fill="#070b14" />
        <g transform={`rotate(${tilt} 200 200)`}>
          <rect x="40" y="30" width="320" height="340" rx="16" fill={`url(#lung-${hash})`} />
          {/* suggestion of a thorax — decorative, not anatomical */}
          <ellipse cx="140" cy="200" rx="72" ry="118" fill="rgba(0,0,0,0.30)" />
          <ellipse cx="260" cy="200" rx="72" ry="118" fill="rgba(0,0,0,0.30)" />
          <rect x="192" y="82" width="16" height="240" rx="8" fill="rgba(255,255,255,0.10)" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path
              key={i}
              d={`M 60 ${110 + i * 40} Q 200 ${80 + i * 40} 340 ${110 + i * 40}`}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="7"
              fill="none"
            />
          ))}
        </g>

        {revealed &&
          findings.map((f, i) => {
            const [x, y, w, h] = f.bbox as number[];
            const low = f.confidence < 0.7;
            const colour = low ? "hsl(38 92% 50%)" : "hsl(158 64% 42%)";
            return (
              <g key={`${f.label}-${i}`}>
                <rect
                  x={x * 400}
                  y={y * 400}
                  width={w * 400}
                  height={h * 400}
                  fill="none"
                  stroke={colour}
                  strokeWidth="2"
                  strokeDasharray={low ? "6 4" : undefined}
                  rx="4"
                />
                <rect
                  x={x * 400}
                  y={Math.max(0, y * 400 - 19)}
                  width={Math.max(96, f.label.length * 6.4 + 34)}
                  height="18"
                  fill={colour}
                  rx="4"
                />
                <text
                  x={x * 400 + 5}
                  y={Math.max(12, y * 400 - 6)}
                  fontSize="11"
                  fontWeight="600"
                  fill="#04121a"
                >
                  {f.label} {(f.confidence * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}
      </svg>

      <div className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80">
        {modality} · {caseRef}
      </div>
      <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white/60">
        Synthetic panel — no patient data
      </div>
    </div>
  );
}
