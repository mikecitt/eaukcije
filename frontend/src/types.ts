export interface Auction {
  id: string;
  auction_number: string;
  short_description: string;
  place_name: string;
  place_municipality: string;
  status: string;
  status_translation: string;
  starting_price: number;
  start_date: string;
  end_date: string;
  property_type: string;
  is_first_sale: number;
  details_fetched: number;
  added_at: string;
}

export interface CurrentUser {
  username: string;
  role: 'admin' | 'user';
}

export interface UserAccount {
  id: number;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface SchedulePreset {
  id: string;
  label: string;
  cron: string | null;
}

export interface ScheduleCurrent {
  preset: string;
  cron: string;
  timezone: string;
  nextRun: string | null;
}

export interface ScheduleSettings {
  presets: SchedulePreset[];
  current: ScheduleCurrent;
}

export type RefreshEvent =
  | { type: 'status'; message: string }
  | { type: 'progress'; message: string; current: number; total: number }
  | { type: 'done'; newCount: number; updatedCount: number; failedCount?: number; lastRefresh: string }
  | { type: 'error'; message: string };
