export interface PushSubscriptionKeys {
	p256dh: string;
	auth: string;
}

export interface PushSubscription {
	endpoint: string;
	expirationTime: number | null;
	keys: PushSubscriptionKeys;
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
