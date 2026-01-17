import {
  createVapidJwt,
  encryptPayload,
  getAudience,
  importVapidPrivateKey,
} from './encryption';
import {
  recordToSubscription,
  getActiveSubscriptions,
  deactivateSubscription,
  getSubscriptionByEndpoint
} from './db';
import type { Env, NotificationPayload, PushSubscription } from './types';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Send push notification to all active subscriptions
 */
export async function sendPushToAll(
  db: D1Database,
  payload: NotificationPayload,
  env: Env
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getActiveSubscriptions(db);
  const payloadString = JSON.stringify(payload);
  
  let sent = 0;
  let failed = 0;

  for (const record of subscriptions) {
    try {
      const subscription = recordToSubscription(record);
      const result = await sendPush(subscription, payloadString, env);
      
      if (result.status === 200 || result.status === 201) {
        sent++;
      } else if (result.status === 410) {
        // Subscription expired, deactivate it
        await deactivateSubscription(db, subscription.endpoint);
        failed++;
      } else {
        const errorText = await result.text();
        console.error(`Push failed with status ${result.status}: ${errorText}`);
        failed++;
      }
    } catch (error) {
      console.error('Push error:', error);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Send push notification to a single subscription
 */
export async function sendPush(
  subscription: PushSubscription,
  payloadString: string,
  env: Env
): Promise<Response> {
  const audience = getAudience(subscription.endpoint);
  
  // Import VAPID private key
  const vapidPrivateKey = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY);
  
  // Create VAPID JWT
  const vapidJwt = await createVapidJwt(
    audience,
    env.CONTACT_EMAIL,
    env.VAPID_PUBLIC_KEY,
    vapidPrivateKey
  );
  
  // Encrypt payload
  const encryptedPayload = await encryptPayload(payloadString, subscription);
  
  // Send to push service
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Urgency: 'normal',
      Authorization: `vapid t=${vapidJwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body: encryptedPayload,
  });

  return response;
}

/**
 * Send notification to specific subscription
 */
export async function sendNotificationToSubscription(
  db: D1Database,
  endpoint: string,
  payload: NotificationPayload,
  env: Env
): Promise<{ success: boolean; status: number; statusText: string }> {
  const subscription = await getSubscriptionByEndpoint(db, endpoint);
  
  if (!subscription) {
    console.error('Subscription not found:', endpoint);
    return { success: false, status: 404, statusText: 'Subscription not found in DB' };
  }

  const record = subscription as {
    endpoint: string;
    p256dh: string;
    auth: string;
    expiration_time: number | null;
    user_agent: string | null;
    created_at: number;
    updated_at: number;
    active: number;
  };

  const pushSub: PushSubscription = {
    endpoint: record.endpoint,
    expirationTime: record.expiration_time,
    keys: {
      p256dh: record.p256dh,
      auth: record.auth,
    },
  };

  try {
    const result = await sendPush(pushSub, JSON.stringify(payload), env);
    const text = await result.text(); // Read body to include in debug if needed
    
    // Log success/failure
    if (!result.ok) {
       console.error(`Push failed: ${result.status} ${result.statusText} - ${text}`);
    }

    return { 
      success: result.status === 200 || result.status === 201, 
      status: result.status, 
      statusText: result.statusText + (text ? ` - ${text}` : '')
    };
  } catch (error: any) {
    console.error('Failed to send notification:', error);
    return { success: false, status: 500, statusText: error.message || String(error) };
  }
}
