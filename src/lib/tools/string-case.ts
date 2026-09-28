/** Split any common identifier/sentence style into lowercase words. */
export function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/([A-Z])(?=[A-Z][a-z])/g, "$1 ") // HTTPServer → HTTP Server (lookahead keeps this linear)
    .replace(/[_\-./\\]+/g, " ") // separators
    .replace(/[^A-Za-z0-9 ]+/g, " ") // punctuation
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

export function toCamelCase(input: string): string {
  const [first = "", ...rest] = splitWords(input);
  return first + rest.map(cap).join("");
}

export function toPascalCase(input: string): string {
  return splitWords(input).map(cap).join("");
}

export function toSnakeCase(input: string): string {
  return splitWords(input).join("_");
}

export function toKebabCase(input: string): string {
  return splitWords(input).join("-");
}

export function toConstantCase(input: string): string {
  return splitWords(input).join("_").toUpperCase();
}

export function toTitleCase(input: string): string {
  return splitWords(input).map(cap).join(" ");
}

export function toSentenceCase(input: string): string {
  const words = splitWords(input);
  return words.length ? cap(words[0]) + (words.length > 1 ? " " + words.slice(1).join(" ") : "") : "";
}

export function toDotCase(input: string): string {
  return splitWords(input).join(".");
}

export const CASE_CONVERSIONS: Array<{ id: string; label: string; convert: (s: string) => string }> = [
  { id: "camel", label: "camelCase", convert: toCamelCase },
  { id: "pascal", label: "PascalCase", convert: toPascalCase },
  { id: "snake", label: "snake_case", convert: toSnakeCase },
  { id: "kebab", label: "kebab-case", convert: toKebabCase },
  { id: "constant", label: "CONSTANT_CASE", convert: toConstantCase },
  { id: "title", label: "Title Case", convert: toTitleCase },
  { id: "sentence", label: "Sentence case", convert: toSentenceCase },
  { id: "dot", label: "dot.case", convert: toDotCase },
  { id: "lower", label: "lowercase", convert: (s) => s.toLowerCase() },
  { id: "upper", label: "UPPERCASE", convert: (s) => s.toUpperCase() },
];
