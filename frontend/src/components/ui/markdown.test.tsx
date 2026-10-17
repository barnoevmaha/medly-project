/* The renderer behind every lesson body and every Medly AI answer. */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown";

const html = (source: string) =>
  renderToStaticMarkup(<Markdown>{source}</Markdown>).replace(/ class="[^"]*"/g, "");

describe("Markdown", () => {
  it("renders a table, which Medly AI uses for comparisons", () => {
    const out = html(
      "| Feature | Type 1 | Type 2 |\n|---|:---:|---|\n| Insulin | absent | **resistant** |"
    );
    expect(out).toContain("<table>");
    expect(out).toContain("<th>Feature</th><th>Type 1</th><th>Type 2</th>");
    expect(out).toContain("<td>Insulin</td><td>absent</td><td><strong>resistant</strong></td>");
    expect(out).not.toContain("|");
  });

  it("renders the disclaimer the server appends as a rule and italics", () => {
    const out = html("Sepsis is X.\n\n---\n_Educational use only. Verify._");
    expect(out).toBe(
      "<div><p>Sepsis is X.</p><hr/><p><em>Educational use only. Verify.</em></p></div>"
    );
  });

  it("renders the louder disclaimer as a rule and bold", () => {
    const out = html("Answer.\n\n---\n**Verify before you rely on this.** Educational only.");
    expect(out).toContain("<hr/><p><strong>Verify before you rely on this.</strong> Educational only.</p>");
  });

  it("leaves snake_case and file_names alone", () => {
    const out = html("Set max_output_tokens in app_config_file.");
    expect(out).toBe("<div><p>Set max_output_tokens in app_config_file.</p></div>");
  });

  it("still renders what lessons use", () => {
    const out = html("## Heading\n\n- one\n- *two*\n\n1. first\n2. `code`\n\n> quoted");
    expect(out).toContain("<h3>Heading</h3>");
    expect(out).toContain("<ul><li>one</li><li><em>two</em></li></ul>");
    expect(out).toContain("<ol><li>first</li><li><code>code</code></li></ol>");
    expect(out).toContain("<blockquote>quoted</blockquote>");
  });

  it("does not mistake a table rule for a horizontal rule", () => {
    const out = html("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).not.toContain("<hr/>");
  });
});
