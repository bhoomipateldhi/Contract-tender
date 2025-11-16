declare module "@/lib/filters.mjs" {
  interface ApplyFiltersOptions {
    keywords?: string[];
    types?: string[];
    statuses?: string[];
    procurementStages?: string[];
    dateFrom?: string;
    dateTo?: string;
    valueFrom?: number | string | null;
    valueTo?: number | string | null;
    sources?: string[];
  }

  export function applyFilters<T extends Record<string, unknown>>(
    notices: T[],
    options?: ApplyFiltersOptions
  ): T[];

  export function deriveProcurementStage<T extends Record<string, unknown>>(notice: T): string;
}
