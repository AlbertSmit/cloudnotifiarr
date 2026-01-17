import type { D1Database } from '@cloudflare/workers-types';
import type { PushSubscription } from './types';

export interface SubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  user_agent: string | null;
  created_at: number;
  updated_at: number;
  active: number;
}

/**
 * Save or update a push subscription
 */
export async function saveSubscription(
  db: D1Database,
  subscription: PushSubscription,
  userAgent?: string
): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO subscriptions (endpoint, p256dh, auth, expiration_time, user_agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        user_agent = excluded.user_agent,
        updated_at = excluded.updated_at,
        active = 1
    `
    )
    .bind(
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      subscription.expirationTime || null,
      userAgent || null,
      Date.now(),
      Date.now()
    )
    .run();
}

/**
 * Mark a subscription as inactive (unsubscribed)
 */
export async function deactivateSubscription(
  db: D1Database,
  endpoint: string
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE subscriptions
      SET active = 0, updated_at = ?
      WHERE endpoint = ?
    `
    )
    .bind(Date.now(), endpoint)
    .run();
}

/**
 * Get all active subscriptions
 */
export async function getActiveSubscriptions(
  db: D1Database
): Promise<SubscriptionRecord[]> {
  const result = await db
    .prepare(
      `
      SELECT endpoint, p256dh, auth, expiration_time, user_agent, created_at, updated_at, active
      FROM subscriptions
      WHERE active = 1
      `
    )
    .all();

  return (result.results as SubscriptionRecord[]) || [];
}

/**
 * Get subscription by endpoint
 */
export async function getSubscriptionByEndpoint(
  db: D1Database,
  endpoint: string
): Promise<SubscriptionRecord | null> {
  const result = await db
    .prepare(
      `
      SELECT endpoint, p256dh, auth, expiration_time, user_agent, created_at, updated_at, active
      FROM subscriptions
      WHERE endpoint = ? AND active = 1
    `
    )
    .bind(endpoint)
    .first();

  return result as SubscriptionRecord | null;
}

/**
 * Clean up expired subscriptions
 */
export async function cleanupExpiredSubscriptions(
  db: D1Database
): Promise<number> {
  const now = Date.now();
  
  const result = await db
    .prepare(
      `
      UPDATE subscriptions
      SET active = 0, updated_at = ?
      WHERE active = 1 AND expiration_time IS NOT NULL AND expiration_time < ?
    `
    )
    .bind(now, now)
    .run();

  return result.meta?.changes || 0;
}

/**
 * Get subscription count
 */
export async function getSubscriptionCount(
  db: D1Database
): Promise<number> {
  const result = await db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM subscriptions
      WHERE active = 1
    `
    )
    .first();

  return (result as { count: number }).count;
}

/**
 * Convert D1 record to PushSubscription format
 */
export function recordToSubscription(record: SubscriptionRecord): PushSubscription {
  return {
    endpoint: record.endpoint,
    expirationTime: record.expiration_time,
    keys: {
      p256dh: record.p256dh,
      auth: record.auth,
    },
  };
}

/**
 * Save notification to history
 */
export async function saveNotification(
  db: D1Database,
  title: string,
  body: string,
  data: string,
  eventType: string
): Promise<number> {
  const result = await db
    .prepare(
      `
      INSERT INTO notifications (title, body, data, event_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .bind(title, body, data, eventType, Date.now())
    .run();

  return result.meta?.last_row_id || 0;
}

/**
 * Get recent notifications
 */
export async function getRecentNotifications(
  db: D1Database,
  limit: number = 20
): Promise<Array<{ id: number; title: string; body: string; event_type: string; created_at: number }>> {
  const result = await db
    .prepare(
      `
      SELECT id, title, body, event_type, created_at
      FROM notifications
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .bind(limit)
    .all();

  return (result.results as Array<{ id: number; title: string; body: string; event_type: string; created_at: number }>) || [];
}

/**
 * Mark notification as sent
 */
export async function markNotificationSent(
  db: D1Database,
  id: number
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE notifications
      SET sent = 1
      WHERE id = ?
    `
    )
    .bind(id)
    .run();
}
