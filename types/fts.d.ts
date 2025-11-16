declare module "@/lib/fts.mjs" {
  export interface FtsSearchOptions {
    receivedFrom?: string;
    receivedTo?: string;
    keyword?: string;
    noticeTypes?: string[];
    page?: number;
    pageSize?: number;
    stage?: string;
    cursor?: string;
    nhsOnly?: boolean;
  }

  export interface FtsSearchResult {
    hits: any[];
    hitCount: number;
    nextCursor?: string | null;
  }

  export function searchFindATender(options?: FtsSearchOptions): Promise<FtsSearchResult>;
  export const FTS_AUTHORITY_KEYWORDS: string[];
  export function containsAuthorityKeyword(value?: string | null): boolean;
}
