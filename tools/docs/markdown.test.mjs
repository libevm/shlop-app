import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./markdown.mjs";

describe("renderMarkdown", () => {
  test("renders headings and paragraphs", () => {
    const html = renderMarkdown("# Title\n\nHello world");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Hello world</p>");
  });

  test("renders bullet lists and code blocks", () => {
    const markdown = "- one\n- two\n\n```\nconst a = 1;\n```";
    const html = renderMarkdown(markdown);

    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("const a = 1;");
  });

  test("escapes html in content", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
