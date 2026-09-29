import { describe, expect, it } from "vitest";
import * as prettier from "prettier/standalone";
import * as pluginHtml from "prettier/plugins/html";
import * as pluginPostcss from "prettier/plugins/postcss";
import * as pluginBabel from "prettier/plugins/babel";
import * as pluginEstree from "prettier/plugins/estree";
import * as pluginTypescript from "prettier/plugins/typescript";
import * as pluginMarkdown from "prettier/plugins/markdown";
import {
  CODE_FORMATTER_SAMPLE,
  DEFAULT_FORMAT_OPTIONS,
  detectLanguage,
  formatCode,
  FORMATTER_LANGUAGES,
  getFormatterLanguage,
  MAX_FORMAT_INPUT,
  minifyCode,
  type PrettierLike,
} from "@/lib/tools/code-formatter";

const ALL_PLUGINS = [pluginHtml, pluginPostcss, pluginBabel, pluginEstree, pluginTypescript, pluginMarkdown];
const engine: PrettierLike = { format: (src, opts) => prettier.format(src, opts), plugins: ALL_PLUGINS };

function minified(text: string, lang: Parameters<typeof minifyCode>[1]): string {
  const r = minifyCode(text, lang);
  if (!r.ok) throw new Error(r.error);
  return r.output;
}

describe("language registry", () => {
  it("lists every language with a parser, plugins and an extension", () => {
    expect(FORMATTER_LANGUAGES.map((l) => l.id)).toEqual(["html", "css", "scss", "less", "javascript", "typescript", "jsx", "tsx", "json", "markdown", "yaml", "graphql", "vue"]);
    for (const l of FORMATTER_LANGUAGES) {
      expect(l.plugins.length).toBeGreaterThan(0);
      expect(l.plugins.every((p) => p.startsWith("prettier/plugins/"))).toBe(true);
      expect(l.extension).toMatch(/^[a-z]+$/);
    }
    // estree is required alongside babel/typescript.
    for (const id of ["javascript", "typescript", "jsx", "tsx", "json"] as const) {
      expect(getFormatterLanguage(id).plugins).toContain("prettier/plugins/estree");
    }
  });
});

describe("detectLanguage", () => {
  it.each([
    ["<!DOCTYPE html><html><body><p>x</p></body></html>", "html"],
    ["<div class=\"a\">\n  <span>hi</span>\n</div>", "html"],
    [".card { color: red; padding: 4px; }\n.x > .y:hover { margin: 0 }", "css"],
    ["@media (min-width: 600px) { body { font-size: 14px; } }", "css"],
    ["$primary: #333;\n.a { &:hover { color: $primary; } }", "scss"],
    ["@primary: #333;\n.a { color: darken(@primary, 10%); }", "less"],
    ["import x from 'y';\nconst a = () => 1;", "javascript"],
    ["function f(a, b) {\n  return a + b;\n}", "javascript"],
    ["interface User { name: string }\nconst u: User = { name: 'a' };", "typescript"],
    ["export function App() {\n  return (\n    <div className=\"x\">hi</div>\n  );\n}", "jsx"],
    ["export function App(): JSX.Element {\n  const n: number = 1;\n  return (<Layout title=\"x\">{n}</Layout>);\n}", "tsx"],
    ['{"a": [1, 2, {"b": null}]}', "json"],
    ["[1, 2, 3]", "json"],
    ["---\nname: devbox\nitems:\n  - a\n  - b\n", "yaml"],
    ["name: devbox\nversion: 1\n", "yaml"],
    ["# Title\n\nSome **bold** text\n\n- item", "markdown"],
    ["query Users($id: ID!) {\n  user(id: $id) { name }\n}", "graphql"],
    ["type User {\n  id: ID!\n  name: String\n}", "graphql"],
    ["<template>\n  <div>{{ msg }}</div>\n</template>\n<script>\nexport default { data: () => ({ msg: 'hi' }) }\n</script>", "vue"],
    ["", null],
    ["   \n", null],
  ])("detects %j as %s", (text, expected) => {
    expect(detectLanguage(text)).toBe(expected);
  });

  it("detects the bundled sample as HTML", () => {
    expect(detectLanguage(CODE_FORMATTER_SAMPLE)).toBe("html");
  });
});

describe("minifyCode", () => {
  it("minifies CSS while preserving strings and url() contents", () => {
    const css = `/* header */
.a , .b > .c {
  color : red ;
  background : url( images/a b.png ) no-repeat;
  content: "  a ; { } /* not a comment */  ";
  font-family: 'Helvetica Neue', sans-serif;
}
@media (min-width: 600px) { .a { margin: 0 auto } }`;
    expect(minified(css, "css")).toBe(
      `.a,.b>.c{color:red;background:url( images/a b.png ) no-repeat;content:"  a ; { } /* not a comment */  ";font-family:'Helvetica Neue',sans-serif}@media (min-width:600px){.a{margin:0 auto}}`,
    );
  });

  it("strips // comments only for SCSS/Less, never inside url()", () => {
    const scss = `// note\n.a {\n  background: url(http://x.test/a.png);\n  color: red; // trailing\n}`;
    expect(minified(scss, "scss")).toBe(".a{background:url(http://x.test/a.png);color:red}");
    const css = `.a { background: url(http://x.test/a.png) }`;
    expect(minified(css, "css")).toBe(".a{background:url(http://x.test/a.png)}");
  });

  it("minifies HTML but keeps <pre>, <textarea>, <script>, <style> and attribute values", () => {
    const html = `<!-- comment -->
<div   class="a   b"
     data-x = "1 &gt; 2">
  <p>Hello   <b>world</b> <i>now</i></p>
  <pre>
  keep   this
    exactly
</pre>
  <textarea>  raw  </textarea>
  <script>
    const a = 1;   // keep
  </script>
  <style>
    .a  {  color: red  }
  </style>
</div>`;
    expect(minified(html, "html")).toBe(
      `<div class="a   b" data-x="1 &gt; 2"><p>Hello <b>world</b> <i>now</i></p><pre>\n  keep   this\n    exactly\n</pre><textarea>  raw  </textarea><script>\n    const a = 1;   // keep\n  </script><style>\n    .a  {  color: red  }\n  </style></div>`,
    );
  });

  it("minifies JSON and reports invalid JSON", () => {
    expect(minified('{\n  "a": [1, 2],\n  "b": "x y"\n}', "json")).toBe('{"a":[1,2],"b":"x y"}');
    expect(minifyCode("{", "json").ok).toBe(false);
  });

  it("removes JS comments, blank lines and indentation but keeps strings, templates and regexes", () => {
    const js = `// leading comment
function f(a) {
  /* block
     comment */
  const url = "http://x.test/a"; // trailing

  const tpl = \`line 1
    indented \${a} // not a comment
  line 3\`;
  const re = /\\/\\/ not a comment/g;
  const ratio = a / 2 / 3; // division
  return url + tpl + re.source + ratio;
}`;
    expect(minified(js, "javascript")).toBe(
      `function f(a) {\nconst url = "http://x.test/a";\nconst tpl = \`line 1\n    indented \${a} // not a comment\n  line 3\`;\nconst re = /\\/\\/ not a comma/g;\nconst ratio = a / 2 / 3;\nreturn url + tpl + re.source + ratio;\n}`.replace("not a comma", "not a comment"),
    );
  });

  it("refuses unsupported languages and empty or oversized input", () => {
    expect(minifyCode("a: 1", "yaml")).toMatchObject({ ok: false, error: expect.stringMatching(/not available/) });
    expect(minifyCode("   ", "css").ok).toBe(false);
    expect(minifyCode("a".repeat(MAX_FORMAT_INPUT + 1), "css")).toMatchObject({ ok: false, error: expect.stringMatching(/limit/) });
  });
});

describe("formatCode (real Prettier standalone)", () => {
  it("formats CSS, JavaScript, TypeScript, JSON, HTML and Markdown", async () => {
    const css = await formatCode(engine, ".a{color:red;margin:0}", "css");
    expect(css).toEqual({ ok: true, output: ".a {\n  color: red;\n  margin: 0;\n}\n" });

    const js = await formatCode(engine, "const a = {b:1,\nc:[1,2]}\nfunction f(){return a}", "javascript");
    expect(js).toEqual({ ok: true, output: "const a = { b: 1, c: [1, 2] };\nfunction f() {\n  return a;\n}\n" });

    const ts = await formatCode(engine, "interface A{b:string}\nconst x:A={b:'y'}", "typescript", { ...DEFAULT_FORMAT_OPTIONS, singleQuote: true, semi: false });
    expect(ts).toEqual({ ok: true, output: "interface A {\n  b: string\n}\nconst x: A = { b: 'y' }\n" });

    const json = await formatCode(engine, '{"a":[1,2],"b":{"c":null}}', "json");
    expect(json).toEqual({ ok: true, output: '{ "a": [1, 2], "b": { "c": null } }\n' });

    const html = await formatCode(engine, "<div><p>hi</p><ul><li>a</li></ul></div>", "html");
    expect(html.ok && html.output).toBe("<div>\n  <p>hi</p>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>\n");

    const md = await formatCode(engine, "#  Title\n\n*  a\n*  b", "markdown");
    expect(md).toEqual({ ok: true, output: "# Title\n\n- a\n- b\n" });
  });

  it("honours printWidth, tabWidth, useTabs and trailingComma", async () => {
    const src = "const list = [aaaaaaaaaaaa, bbbbbbbbbbbb, cccccccccccc, dddddddddddd];";
    const wide = await formatCode(engine, src, "javascript", { ...DEFAULT_FORMAT_OPTIONS, printWidth: 120 });
    expect(wide.ok && wide.output).toBe(`${src}\n`);
    const narrow = await formatCode(engine, src, "javascript", { ...DEFAULT_FORMAT_OPTIONS, printWidth: 40, tabWidth: 4, trailingComma: "none" });
    expect(narrow.ok && narrow.output).toBe("const list = [\n    aaaaaaaaaaaa,\n    bbbbbbbbbbbb,\n    cccccccccccc,\n    dddddddddddd\n];\n");
    const tabs = await formatCode(engine, "function f(){return 1}", "javascript", { ...DEFAULT_FORMAT_OPTIONS, useTabs: true });
    expect(tabs.ok && tabs.output).toBe("function f() {\n\treturn 1;\n}\n");
  });

  it("formats the bundled sample including embedded style and script", async () => {
    const r = await formatCode(engine, CODE_FORMATTER_SAMPLE, "html");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain("<!doctype html>");
    expect(r.output).toContain("  padding: 12px;");
    expect(r.output).toContain('const items = document.querySelectorAll("li");');
  });

  it("returns a single-line error with a location for syntax errors", async () => {
    const r = await formatCode(engine, "const a = {\n  b: 1,\n  c: \n", "javascript");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.split("\n")).toHaveLength(1);
    expect(r.error).toMatch(/\(\d+:\d+\)|line \d+/);
    const css = await formatCode(engine, ".a { color: red", "css");
    expect(css.ok).toBe(false);
  });

  it("rejects empty and oversized input without calling Prettier", async () => {
    let called = false;
    const spy: PrettierLike = { format: async () => ((called = true), ""), plugins: [] };
    expect(await formatCode(spy, "  ", "css")).toMatchObject({ ok: false });
    expect(await formatCode(spy, "a".repeat(MAX_FORMAT_INPUT + 1), "css")).toMatchObject({ ok: false, error: expect.stringMatching(/limit/) });
    expect(called).toBe(false);
  });
});
