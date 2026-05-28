export type SportCategory = 'Laufen' | 'Radrennen' | 'Triathlon' | 'Hyrox' | '';

export type DistancePreset = {
  label: string;
  value: number;
  tolerance?: number;
};

export type Listing = {
  id: string;
  category: SportCategory;
  event_name: string;
  event_date: string;
  location: string | null;
  plz?: string | null;
  price: number;
  price_type?: 'fixed' | 'vb' | null;
  distance: string | null;
  distance_km: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  listing_meta?: Record<string, unknown> | null;
  swim_dist: number | null;
  bike_dist: number | null;
  run_dist: number | null;
  description: string | null;
  status: string;
  approved: boolean;
  lat?: number | null;
  lng?: number | null;
  _distanceKm?: number;
};

export type Profile = {
  nickname: string | null;
  updated_at: string | null;
  avatar_url: string | null;
  registered_email?: string | null;
};

export type WatchlistEntry = {
  id: string;
  listing_id: string;
  listings: Listing | null;
};

export type Conversation = {
  id: string;
  updated_at: string;
  seller_id: string;
  buyer_id: string;
  listings: { event_name: string | null } | null;
  messages: { is_read: boolean | null; sender_id: string | null }[];
  seller: { nickname: string | null } | null;
  buyer: { nickname: string | null } | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean | null;
  created_at: string;
};

export type TabKey = 'search' | 'sell' | 'account';
export type DashboardSection = 'overview' | 'watchlist' | 'listings' | 'chats';