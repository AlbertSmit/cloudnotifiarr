import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  CONTACT_EMAIL: string;
  DB: D1Database;
}

export interface PushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

// *arr webhook payloads
export interface ArrWebhookPayload {
  eventType: string;
  series?: {
    title: string;
    year?: number;
    tvdbId?: number;
  };
  episode?: {
    title: string;
    seasonNumber: number;
    episodeNumber: number;
    absoluteEpisodeNumber?: number;
  };
  episodes?: Array<{
    title: string;
    seasonNumber: number;
    episodeNumber: number;
    absoluteEpisodeNumber?: number;
  }>;
  movie?: {
    title: string;
    year: number;
    imdbId?: string;
    tmdbId?: number;
  };
  release?: {
    quality: string;
    qualityVersion: number;
    releaseGroup?: string;
    size?: number;
  };
  files?: Array<{
    path: string;
    size?: number;
  }>;
  downloadStatus?: Array<{
    status: string;
    message?: string;
  }>;
  package?: {
    packageAuthor?: string;
    packageVersion?: string;
  };
  messages?: Array<{
    message?: string;
    text?: string;
    type?: string;
  }>;
}

export interface FormattedMessage {
  title: string;
  body: string;
  eventType: string;
  data?: Record<string, unknown>;
}
