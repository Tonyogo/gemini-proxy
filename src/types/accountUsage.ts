export interface ModelUsageStats {
  success: number;
  error: number;
  total: number;
}

export interface AccountUsageStats {
  accountName: string;
  totalSuccess: number;
  totalError: number;
  totalRequests: number;
  byModel: Record<string, ModelUsageStats>;
}

export interface PeriodUsageStore {
  periodKey: string;      // 例如 "2026-09-21_15"
  periodStart: string;    // 例如 "2026-09-21 15:00:00"
  periodEnd: string;      // 例如 "2026-09-22 15:00:00"
  updatedAt: string;      // ISO 8601
  accounts: Record<string, AccountUsageStats>;
}
