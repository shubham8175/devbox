export interface PaginationInput {
  page: number;
  pageSize: number;
  total: number;
  zeroBased: boolean;
}

export interface PaginationResult {
  pageNormalized: number; // 1-based
  offset: number;
  limit: number;
  totalPages: number;
  firstIndex: number | null; // 1-based item index on this page
  lastIndex: number | null;
  itemsOnPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  outOfRange: boolean;
  window: number[]; // 1-based page numbers to show
}

export function validatePagination(i: PaginationInput): string | null {
  if (!Number.isFinite(i.page) || !Number.isInteger(i.page)) return "Page must be a whole number.";
  if (!Number.isFinite(i.pageSize) || !Number.isInteger(i.pageSize) || i.pageSize < 1) return "Page size must be a whole number ≥ 1.";
  if (!Number.isFinite(i.total) || !Number.isInteger(i.total) || i.total < 0) return "Total items must be a whole number ≥ 0.";
  const min = i.zeroBased ? 0 : 1;
  if (i.page < min) return `Page must be ≥ ${min} (${i.zeroBased ? "0-based" : "1-based"}).`;
  if (i.page > Number.MAX_SAFE_INTEGER || i.pageSize > Number.MAX_SAFE_INTEGER || i.total > Number.MAX_SAFE_INTEGER) return "Values must be at most 9,007,199,254,740,991.";
  return null;
}

export function paginate(i: PaginationInput): PaginationResult {
  const page1 = i.zeroBased ? i.page + 1 : i.page;
  const totalPages = Math.max(1, Math.ceil(i.total / i.pageSize));
  const offset = (page1 - 1) * i.pageSize;
  const outOfRange = i.total > 0 ? page1 > totalPages : page1 > 1;
  const firstIndex = !outOfRange && i.total > 0 ? offset + 1 : null;
  const lastIndex = firstIndex !== null ? Math.min(offset + i.pageSize, i.total) : null;
  const itemsOnPage = firstIndex !== null && lastIndex !== null ? lastIndex - firstIndex + 1 : 0;
  const win: number[] = [];
  const start = Math.max(1, Math.min(page1 - 2, totalPages - 4));
  for (let k = 0; k < 5 && start + k <= totalPages; k++) win.push(start + k);
  return {
    pageNormalized: page1,
    offset,
    limit: i.pageSize,
    totalPages,
    firstIndex,
    lastIndex,
    itemsOnPage,
    hasNext: page1 < totalPages,
    hasPrev: page1 > 1,
    outOfRange,
    window: win,
  };
}
