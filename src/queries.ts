export const SAVE_SUBSCRIPTION = /*SQL*/ `
  INSERT INTO subscriptions (endpoint, p256dh, auth, expiration_time, user_agent, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(endpoint) DO UPDATE SET
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    expiration_time = excluded.expiration_time,
    user_agent = excluded.user_agent,
    updated_at = excluded.updated_at,
    active = 1
`;

export const DEACTIVATE_SUBSCRIPTION = /*SQL*/ `
  UPDATE subscriptions
  SET active = 0, updated_at = ?
  WHERE endpoint = ?
`;

export const GET_ACTIVE_SUBSCRIPTIONS = /*SQL*/ `
  SELECT endpoint, p256dh, auth, expiration_time, user_agent, created_at, updated_at, active
  FROM subscriptions
  WHERE active = 1
`;

export const GET_SUBSCRIPTION_BY_ENDPOINT = /*SQL*/ `
  SELECT endpoint, p256dh, auth, expiration_time, user_agent, created_at, updated_at, active
  FROM subscriptions
  WHERE endpoint = ? AND active = 1
`;

export const CLEANUP_EXPIRED_SUBSCRIPTIONS = /*SQL*/ `
  UPDATE subscriptions
  SET active = 0, updated_at = ?
  WHERE active = 1 AND expiration_time IS NOT NULL AND expiration_time < ?
`;

export const GET_SUBSCRIPTION_COUNT = /*SQL*/ `
  SELECT COUNT(*) as count
  FROM subscriptions
  WHERE active = 1
`;

export const SAVE_NOTIFICATION = /*SQL*/ `
  INSERT INTO notifications (title, body, data, event_type, created_at)
  VALUES (?, ?, ?, ?, ?)
`;

export const GET_RECENT_NOTIFICATIONS = /*SQL*/ `
  SELECT id, title, body, event_type, created_at
  FROM notifications
  ORDER BY created_at DESC
  LIMIT ?
`;

export const MARK_NOTIFICATION_SENT = /*SQL*/ `
  UPDATE notifications
  SET sent = 1
  WHERE id = ?
`;
