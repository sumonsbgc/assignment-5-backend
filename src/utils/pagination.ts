export interface CursorPaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface CursorPaginationResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export function buildCursorPaginationArgs(options: CursorPaginationOptions) {
  const limit = Math.min(options.limit ?? 20, 100);
  const cursor = options.cursor ? { id: parseInt(options.cursor) } : undefined;
  return {
    take: limit + 1, // take one extra to determine if there's more
    skip: cursor ? 1 : 0,
    cursor,
  };
}

export function buildCursorPaginationResponse<T extends { id: number }>(
  items: T[],
  limit: number,
  total: number
): CursorPaginationResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? String(data[data.length - 1].id) : null;
  return { data, pagination: { nextCursor, hasMore, total } };
}
