export interface CustomWebAppItem {
  id: string;
  name: string;
  url: string;
  description?: string;
  icon?: string;
  color?: string;
  useGateway?: boolean;
  createdAt: number;
}
