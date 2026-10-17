import { Fragment, type ReactNode } from "react";

/**
 * A deliberately small markdown renderer.
 *
 * It covers what our lesson bodies use and what Medly AI writes: headings,
 * bullet and numbered lists, tables, rules, bold, italic and inline code. It
 * builds React nodes rather than injecting HTML, so there is no
 * `dangerouslySetInnerHTML` anywhere in the app.
 */

/** Inline pass: `**bold**`, `*italic*`, `_italic_`, `` `code` ``. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  // `_italic_` needs a word boundary on both sides, so snake_case_names and
  // file_paths are left alone.
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\b_[^_\n]+_\b|`[^`]+`)/g;
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
    if (
      part.length > 2 &&
      ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))
    ) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

const TABLE_RULE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

/** `| a | b |` rows with a `|---|---|` rule under the header. */
function isTable(lines: string[]): boolean {
  return (
    lines.length >= 2 &&
    TABLE_RULE.test(lines[1].trim()) &&
    lines.every((line) => line.trim().startsWith("|") || line.includes("|"))
  );
}

function Table({ lines, id }: { lines: string[]; id: string }) {
  const header = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return (
    // Scrolls sideways on its own, so a wide comparison never widens the page.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={`${id}-h${i}`}
                className="border-b border-border px-3 py-2 font-semibold text-foreground"
              >
                {inline(cell, `${id}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={`${id}-r${r}`} className="border-b border-border/60 last:border-0">
              {row.map((cell, c) => (
                <td key={`${id}-r${r}c${c}`} className="px-3 py-2 align-top">
                  {inline(cell, `${id}-r${r}c${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  // A rule line is a block of its own even when it is not surrounded by blank
  // lines — the disclaimer the server appends arrives as "---\n_text_".
  const blocks = children
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "\n\n---\n\n")
    .split(/\n{2,}/)
    .filter((block) => block.trim());

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
        if (isTable(lines)) {
          return <Table key={key} lines={lines} id={key} />;
        }
        return <p key={key}>{inline(lines.join(" "), key)}</p>;
      })}
    </div>
  );
}
