import { useMemo } from "react";
import { Markdown } from "@/components/ui/markdown";
import { traceStream } from "@/lib/api";

/**
 * An answer that is still arriving.
 *
 * Markdown is only safe to render once a block is closed — halfway through
 * `**bold` or a `| table |` row the source is not yet valid, and re-rendering
 * it every few tokens makes the text visibly flicker between styled and
 * unstyled. So the completed blocks (everything before the last blank line)
 * go through the normal `Markdown` renderer, and the block currently being
 * written is shown as plain text with the caret after it. When the stream
 * finishes, `streaming` goes false and the whole answer renders as Markdown.
 *
 * `Markdown` builds React nodes rather than injecting HTML, so malformed
 * input can never break the tree — this is about not making it flicker, not
 * about safety.
 */
export function StreamingAnswer({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  if (streaming) traceStream("StreamingAnswer render", `chars=${text.length}`);

  const [settled, pending] = useMemo(() => {
    if (!streaming) return [text, ""];
    const boundary = text.lastIndexOf("\n\n");
    if (boundary === -1) return ["", text];
    return [text.slice(0, boundary), text.slice(boundary + 2)];
  }, [text, streaming]);

  return (
    <>
      {settled && <Markdown>{settled}</Markdown>}
      {streaming && (
        <p
          className={
            settled
              ? "mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground"
              : "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground"
          }
        >
          {pending}
          <span className="stream-caret" aria-hidden="true" />
        </p>
      )}
    </>
  );
}
