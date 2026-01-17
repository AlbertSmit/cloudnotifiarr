import type { D1Database } from "@cloudflare/workers-types";
import {
	CLEANUP_EXPIRED_SUBSCRIPTIONS,
	DEACTIVATE_SUBSCRIPTION,
	GET_ACTIVE_SUBSCRIPTIONS,
	GET_RECENT_NOTIFICATIONS,
	GET_SUBSCRIPTION_BY_ENDPOINT,
	GET_SUBSCRIPTION_COUNT,
	MARK_NOTIFICATION_SENT,
	SAVE_NOTIFICATION,
	SAVE_SUBSCRIPTION,
} from "./queries";
import type { PushSubscription } from "./types";

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
	userAgent?: string,
): Promise<void> {
	await db
		.prepare(SAVE_SUBSCRIPTION)
		.bind(
			subscription.endpoint,
			subscription.keys.p256dh,
			subscription.keys.auth,
			subscription.expirationTime || null,
			userAgent || null,
			Date.now(),
			Date.now(),
		)
		.run();
}

/**
 * Mark a subscription as inactive (unsubscribed)
 */
export async function deactivateSubscription(
	db: D1Database,
	endpoint: string,
): Promise<void> {
	await db.prepare(DEACTIVATE_SUBSCRIPTION).bind(Date.now(), endpoint).run();
}

/**
 * Get all active subscriptions
 */
export async function getActiveSubscriptions(
	db: D1Database,
): Promise<SubscriptionRecord[]> {
	const result = await db.prepare(GET_ACTIVE_SUBSCRIPTIONS).all();

	return (result.results as unknown as SubscriptionRecord[]) || [];
}

/**
 * Get subscription by endpoint
 */
export async function getSubscriptionByEndpoint(
	db: D1Database,
	endpoint: string,
): Promise<SubscriptionRecord | null> {
	const result = await db
		.prepare(GET_SUBSCRIPTION_BY_ENDPOINT)
		.bind(endpoint)
		.first();

	return result as unknown as SubscriptionRecord | null;
}

/**
 * Clean up expired subscriptions
 */
export async function cleanupExpiredSubscriptions(
	db: D1Database,
): Promise<number> {
	const now = Date.now();

	const result = await db
		.prepare(CLEANUP_EXPIRED_SUBSCRIPTIONS)
		.bind(now, now)
		.run();

	return result.meta?.changes || 0;
}

/**
 * Get subscription count
 */
export async function getSubscriptionCount(db: D1Database): Promise<number> {
	const result = await db.prepare(GET_SUBSCRIPTION_COUNT).first();

	return (result as unknown as { count: number }).count;
}

/**
 * Convert D1 record to PushSubscription format
 */
export function recordToSubscription(
	record: SubscriptionRecord,
): PushSubscription {
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
	eventType: string,
): Promise<number> {
	const result = await db
		.prepare(SAVE_NOTIFICATION)
		.bind(title, body, data, eventType, Date.now())
		.run();

	return result.meta?.last_row_id || 0;
}

/**
 * Get recent notifications
 */
export async function getRecentNotifications(
	db: D1Database,
	limit: number = 20,
): Promise<
	Array<{
		id: number;
		title: string;
		body: string;
		event_type: string;
		created_at: number;
	}>
> {
	const result = await db.prepare(GET_RECENT_NOTIFICATIONS).bind(limit).all();

	return (
		(result.results as unknown as Array<{
			id: number;
			title: string;
			body: string;
			event_type: string;
			created_at: number;
		}>) || []
	);
}

/**
 * Mark notification as sent
 */
export async function markNotificationSent(
	db: D1Database,
	id: number,
): Promise<void> {
	await db.prepare(MARK_NOTIFICATION_SENT).bind(id).run();
}
