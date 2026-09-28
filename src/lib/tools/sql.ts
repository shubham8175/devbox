export const SQL_DIALECTS = [
  { id: "sql", label: "Standard SQL" },
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "sqlite", label: "SQLite" },
  { id: "transactsql", label: "T-SQL (SQL Server)" },
  { id: "bigquery", label: "BigQuery" },
] as const;
export type SqlDialect = (typeof SQL_DIALECTS)[number]["id"];

/** Minimal surface of sql-formatter used by the tool (loaded lazily). */
export interface SqlFormatterModule {
  format: (sql: string, opts?: { language?: string; keywordCase?: "upper" | "lower" | "preserve"; tabWidth?: number; linesBetweenQueries?: number }) => string;
}

export type SqlTokenType = "keyword" | "function" | "string" | "number" | "comment" | "operator" | "punct" | "ident" | "ws";
export interface SqlToken {
  type: SqlTokenType;
  text: string;
}

const KEYWORDS = new Set(
  `select from where and or not in is null as join inner left right full outer cross on group by order having limit offset insert into values update set delete distinct union all except intersect with recursive case when then else end exists between like ilike asc desc create table alter drop index view primary key foreign references default unique check constraint if begin commit rollback transaction returning over partition window rows range unbounded preceding following current row lateral using natural true false top fetch first next only explain analyze cast interval grant revoke truncate replace temp temporary materialized`.split(/\s+/),
);
const FUNCTIONS = new Set(
  `count sum avg min max coalesce nullif now date_trunc to_char to_date extract length lower upper trim ltrim rtrim substring substr concat round floor ceil abs row_number rank dense_rank lag lead first_value last_value array_agg string_agg json_agg jsonb_agg json_build_object date_part greatest least ifnull isnull getdate datediff dateadd`.split(/\s+/),
);

/** Tiny SQL tokenizer for syntax highlighting (not a parser). */
export function tokenizeSql(sql: string): SqlToken[] {
  const out: SqlToken[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(sql[j])) j++;
      out.push({ type: "ws", text: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      let j = i;
      while (j < n && sql[j] !== "\n") j++;
      out.push({ type: "comment", text: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const j = end < 0 ? n : end + 2;
      out.push({ type: "comment", text: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "\\" && close === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === close) {
          if (sql[j + 1] === close && close !== "]") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      j = Math.min(j + 1, n);
      out.push({ type: c === "'" ? "string" : "ident", text: sql.slice(i, j) });
      i = j;
      continue;
    }
    const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(sql.slice(i));
    if (num) {
      out.push({ type: "number", text: num[0] });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
    if (word) {
      const w = word[0];
      const lower = w.toLowerCase();
      const next = sql.slice(i + w.length).match(/^\s*\(/);
      out.push({ type: KEYWORDS.has(lower) ? "keyword" : FUNCTIONS.has(lower) || (next && !KEYWORDS.has(lower)) ? "function" : "ident", text: w });
      i += w.length;
      continue;
    }
    const op = /^(<>|!=|<=|>=|\|\||::|->>|->|[=<>+\-*/%|&^~])/.exec(sql.slice(i));
    if (op) {
      out.push({ type: "operator", text: op[0] });
      i += op[0].length;
      continue;
    }
    out.push({ type: "punct", text: c });
    i++;
  }
  return out;
}

/** Collapse whitespace outside strings/comments, drop comments. */
export function minifySql(sql: string): string {
  const parts: string[] = [];
  for (const t of tokenizeSql(sql)) {
    if (t.type === "comment") continue;
    if (t.type === "ws") {
      if (parts.length && !parts[parts.length - 1].endsWith(" ")) parts.push(" ");
      continue;
    }
    if (t.type === "punct" && (t.text === "," || t.text === ")" || t.text === ";") && parts.length && parts[parts.length - 1] === " ") parts.pop();
    parts.push(t.text);
    if (t.type === "punct" && t.text === "(" ) {
      // no space after opening paren
      parts.push("");
    }
  }
  return parts
    .join("")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

export const SQL_SAMPLE = `-- Monthly revenue per customer with a CTE
with paid as (
  select customer_id, amount, created_at from orders where status = 'paid' and created_at >= '2026-01-01'
)
select c.id, c.name, date_trunc('month', p.created_at) as month, sum(p.amount) as revenue, count(*) as orders
from customers c left join paid p on p.customer_id = c.id
where c.country in ('IN', 'SA') group by c.id, c.name, month having sum(p.amount) > 0 order by revenue desc limit 20;`;
