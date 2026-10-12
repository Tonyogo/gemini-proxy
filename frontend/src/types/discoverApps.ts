export type DiscoverAppType = 'builtin' | 'custom';
export type BuiltinToolId = 'systemLogs' | 'playground' | 'translate';

export interface DiscoverAppItem {
  id: string;
  type: DiscoverAppType;
  name: string;
  description?: string;
  icon: string;
  color: string;
  badge?: string;
  enabled: boolean;
  order: number;
  url?: string;
  useGateway?: boolean;
  createdAt?: number;
}
