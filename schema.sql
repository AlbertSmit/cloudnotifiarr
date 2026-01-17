-- CloudNotifiarr D1 Database Schema
-- Run with: npx wrangler d1 execute cloudnotifiarr --file=schema.sql --remote

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  active INTEGER DEFAULT 1
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_active ON subscriptions(active);
CREATE INDEX IF NOT EXISTS idx_created ON subscriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_endpoint ON subscriptions(endpoint);

-- Notifications history table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  data TEXT,
  event_type TEXT,
  created_at INTEGER NOT NULL,
  sent INTEGER DEFAULT 0
);

-- Index for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
