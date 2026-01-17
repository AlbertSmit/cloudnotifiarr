// Frontend assets and HTML generation

export function getFrontendHtml(vapidPublicKey: string): string {
	// Ensure key is proper length for P-256 (65 bytes = 130 hex chars)
	let keyBytes: Uint8Array;

	// Detect if key is Hex or Base64URL
	if (/^[0-9a-fA-F]+$/.test(vapidPublicKey) && vapidPublicKey.length >= 128) {
		// Hex format (legacy)
		let keyHex = vapidPublicKey;
		if (keyHex.length === 128) {
			keyHex = "04" + keyHex; // Add uncompressed prefix if missing
		}
		keyBytes = hexToUint8Array(keyHex);
	} else {
		// Base64URL format (standard)
		const base64 = vapidPublicKey
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(
				vapidPublicKey.length + ((4 - (vapidPublicKey.length % 4)) % 4),
				"=",
			);

		const binary = atob(base64);
		keyBytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			keyBytes[i] = binary.charCodeAt(i);
		}
	}
	const keyArrayStr = "[" + Array.from(keyBytes).join(",") + "]";

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#007AFF">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Notifiarr">
  <title>CloudNotifiarr</title>
  <link rel="manifest" href="/manifest.json">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f7;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 400px; margin: 0 auto; }
    .card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: #1d1d1f; }
    .subtitle { color: #86868b; font-size: 14px; margin-bottom: 24px; }
    .btn {
      background: #007AFF;
      color: white;
      border: none;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 17px;
      font-weight: 600;
      width: 100%;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.subscribed { background: #34c759; }
    .instructions {
      background: #fff9c4;
      border-radius: 12px;
      padding: 16px;
      margin-top: 20px;
      font-size: 14px;
      line-height: 1.6;
    }
    .instructions strong { color: #1d1d1f; }
    .status {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
      display: none;
    }
    .status.show { display: block; }
    .status.success { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    .status.info { background: #e7f3ff; color: #004085; }
    .icon { font-size: 48px; margin-bottom: 16px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="icon">🔔</div>
      <h1>CloudNotifiarr</h1>
      <p class="subtitle">*arr notifications on iOS</p>
      
      <button id="subscribeBtn" class="btn" onclick="subscribe()">
        Enable Notifications
      </button>

      <button id="testBtn" class="btn" style="margin-top: 10px; background: #8e8e93; display: none;" onclick="sendTestNotification()">
        Send Test Notification
      </button>
      
      <div id="status" class="status"></div>
      
      <p style="margin-top: 20px; text-align: center;">
        <a href="#" onclick="resetSubscription(); return false;" style="color: #86868b; text-decoration: none; font-size: 12px;">
          Reset / Unsubscribe
        </a>
      </p>
    </div>
    
    <div class="instructions">
      <strong>Setup Instructions:</strong><br><br>
      1. Tap "Enable Notifications" above<br>
      2. Allow permission when prompted<br>
      3. <strong>Add to Home Screen:</strong><br>
      &nbsp;&nbsp;• Safari → Share button → Add to Home Screen<br>
      4. Open from Home Screen for notifications<br><br>
      <em>Notifications work from the Home Screen app, not Safari tabs.</em>
    </div>
  </div>

  <script>
    // VAPID key as Uint8Array (converted from hex)
    const VAPID_PUBLIC_KEY = new Uint8Array(${keyArrayStr});
    
    let isSubscribed = false;
    
    async function init() {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          showStatus('Your browser does not support push notifications', 'error');
          document.getElementById('subscribeBtn').disabled = true;
          return;
        }
        
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          isSubscribed = true;
          setSubscribedState();
        }
        
        // Check if running as PWA
        const isPWA = window.matchMedia('(display-mode: standalone)').matches;
        if (!isPWA && !isSubscribed) {
          showStatus('After subscribing, add to Home Screen for notifications to work', 'info');
        }
      } catch (error) {
        showStatus('Error: ' + error.message, 'error');
      }
    }
    
    async function subscribe() {
      try {
        const registration = await navigator.serviceWorker.ready;
        
        // Check current permission state
        const permission = Notification.permission;
        if (permission === 'denied') {
          const isPWA = window.matchMedia('(display-mode: standalone)').matches;
          const msg = isPWA 
            ? 'Notifications blocked. Go to iPhone Settings → Scroll down to this App → Notifications → Allow'
            : 'Notifications blocked. Enable in Settings → Safari → Push';
          showStatus(msg, 'error');
          return;
        }
        if (permission === 'default') {
          const permissionResult = await Notification.requestPermission();
          if (permissionResult !== 'granted') {
            showStatus('Permission denied', 'error');
            return;
          }
        }
        
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_PUBLIC_KEY
        });
        
        const response = await fetch('/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription)
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Subscription failed with status ' + response.status);
        }
        
        isSubscribed = true;
        setSubscribedState();
        showStatus('Subscribed! Now add to Home Screen for notifications', 'success');
      } catch (error) {
        showStatus('Error: ' + error.message, 'error');
      }
    }
    
    function setSubscribedState() {
      const btn = document.getElementById('subscribeBtn');
      btn.textContent = '✓ Subscribed';
      btn.classList.add('subscribed');
      btn.disabled = true;
      
      document.getElementById('testBtn').style.display = 'block';
    }

    async function sendTestNotification() {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) throw new Error('Not subscribed');

        showStatus('Sending...', 'info');
        const response = await fetch('/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });

        const data = await response.json();
        if (data.sent > 0) {
          showStatus('Test sent! Check notification center.', 'success');
        } else {
          let msg = 'Sent but delivery failed.';
          if (data.debug) {
            msg += ' Status: ' + data.debug.status + ' ' + data.debug.message;
          }
          showStatus(msg, 'error');
        }
      } catch (error) {
        showStatus('Error: ' + error.message, 'error');
      }
    }
    
    function showStatus(message, type) {
      const el = document.getElementById('status');
      el.className = 'status show ' + type;
      el.textContent = message;
    }

    async function resetSubscription() {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          // Also try to remove from backend
          await fetch('/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
          }).catch(() => {});
        }
        isSubscribed = false;
        document.getElementById('subscribeBtn').disabled = false;
        document.getElementById('subscribeBtn').textContent = 'Enable Notifications';
        document.getElementById('subscribeBtn').classList.remove('subscribed');
        document.getElementById('status').style.display = 'none';
        alert('Subscription reset. You can now subscribe again.');
      } catch (e) {
        alert('Error resetting: ' + e.message);
      }
    }
    
    init();
  </script>
</body>
</html>`;
}

export const SERVICE_WORKER_CODE = `
// Service Worker for CloudNotifiarr
// Handles push notifications and passes through all other requests

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Pass through all fetch requests to the network
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// Helper to log to server
function logToServer(msg) {
  fetch('/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, timestamp: Date.now() })
  }).catch(() => {});
}

self.addEventListener('push', (event) => {
  logToServer('SW: Push event received');
  
  let data = {};
  try {
    if (event.data) {
      // Try to parse as JSON
      try {
        data = event.data.json();
        logToServer('SW: Parsed JSON data: ' + JSON.stringify(data));
      } catch (jsonErr) {
        logToServer('SW: Not JSON, using text: ' + event.data.text());
        data = { body: event.data.text() };
      }
    } else {
      logToServer('SW: No event data');
      data = { body: 'No content' };
    }
  } catch (e) {
    logToServer('SW: Error processing data: ' + e.message);
    data = { body: 'Processing error' };
  }
  
  const origin = self.location.origin;
  const options = {
    body: data.body || 'New notification',
    icon: origin + '/icon-192.png', // Simplify for debugging
    badge: origin + '/badge-72.png',
    tag: data.tag || 'default',
    data: { url: data.data?.url || '/' },
    requireInteraction: true
  };
  
  const promise = self.registration.showNotification(data.title || 'CloudNotifiarr', options)
    .then(() => logToServer('SW: Notification shown'))
    .catch(err => logToServer('SW: Show notification failed: ' + err.message));
    
  event.waitUntil(promise);
});

self.addEventListener('notificationclick', (event) => {
  logToServer('SW: Notification clicked');
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  logToServer('SW: Push subscription change');
  event.waitUntil(
    fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event.newSubscription)
    })
  );
});
`;

export const MANIFEST = {
	name: "CloudNotifiarr",
	short_name: "Notifiarr",
	description: "*arr notifications for iOS",
	start_url: "/",
	display: "standalone",
	background_color: "#ffffff",
	theme_color: "#007AFF",
	orientation: "portrait",
	icons: [
		{
			src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23007AFF" width="192" height="192" rx="40"/><text x="96" y="130" font-size="100" text-anchor="middle" fill="white">🔔</text></svg>',
			sizes: "192x192",
			type: "image/svg+xml",
			purpose: "any maskable",
		},
		{
			src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect fill="%23007AFF" width="512" height="512" rx="100"/><text x="256" y="350" font-size="280" text-anchor="middle" fill="white">🔔</text></svg>',
			sizes: "512x512",
			type: "image/svg+xml",
			purpose: "any maskable",
		},
	],
};

function hexToUint8Array(hex: string): Uint8Array {
	// P-256 uncompressed public key is 65 bytes (130 hex chars, starts with 04)
	// If it starts with 04, it's uncompressed format (04 || X || Y) = 1 + 32 + 32 = 65 bytes
	// If it doesn't start with 04, it might be compressed or just the X coordinate

	let cleanHex = hex;
	if (hex.startsWith("04")) {
		cleanHex = hex; // Full uncompressed key (04 + X + Y)
	} else if (hex.length === 130) {
		// Might be X + Y without the 04 prefix
		cleanHex = "04" + hex;
	}

	const bytes = new Uint8Array(cleanHex.length / 2);
	for (let i = 0; i < cleanHex.length; i += 2) {
		bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
	}
	return bytes;
}
