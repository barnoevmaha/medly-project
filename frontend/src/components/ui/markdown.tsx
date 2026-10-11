import { Fragment, type ReactNode } from "react";

/**
 * A deliberately small markdown renderer.
 *
 * Lesson bodies are authored by us in `backend/app/seed.py`, so this only needs
 * to cover the subset we actually write: headings, bullet and numbered lists,
 * bold, italic and inline code. It builds React nodes rather than injecting
 * HTML, so there is no `dangerouslySetInnerHTML` anywhere in the app.
 */

/** Inline pass: `**bold**`, `*italic*`, `` `code` ``. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  return text.split(pattern).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function Markdown({ children }: { children: string }) {
  const blocks = children.split(/\n{2,}/);

  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter((line) => line.trim());
        const key = `b${index}`;

        if (block.startsWith("### ")) {
          return (
            <h4 key={key} className="font-display text-base font-bold text-foreground">
              {inline(block.slice(4), key)}
            </h4>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h3 key={key} className="pt-2 font-display text-lg font-bold text-foreground">
              {inline(block.slice(3), key)}
            </h3>
          );
        }
        if (block.startsWith("# ")) {
          return (
            <h2 key={key} className="pt-2 font-display text-xl font-bold text-foreground">
              {inline(block.slice(2), key)}
            </h2>
          );
        }
        if (block.startsWith("> ")) {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-primary/40 pl-4 italic text-muted-foreground"
            >
              {inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "), key)}
            </blockquote>
          );
        }
        if (lines.every((line) => /^[-*]\s/.test(line.trim()))) {
          return (
            <ul key={key} className="ml-5 list-disc space-y-1.5">
              {lines.map((line, i) => (
                <li key={`${key}-${i}`}>{inline(line.trim().replace(/^[-*]\s/, ""), `${key}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((line) => /^\d+\.\s/.test(line.trim()))) {
          return (
            <ol key={key} className="ml-5 list-decimal space-y-1.5">
              {lines.map((line, i) => (
                <li key={`${key}-${i}`}>
                  {inline(line.trim().replace(/^\d+\.\s/, ""), `${key}-${i}`)}
                </li>
              ))}
            </ol>
          );
        }
        if (block.trim() === "---") {
          return <hr key={key} className="border-border" />;
        }
        return <p key={key}>{inline(lines.join(" "), key)}</p>;
      })}
    </div>
  );
}
