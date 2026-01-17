# CloudNotifiarr

A lightweight, self-hosted Web Push notification system for the *arr suite (Sonarr, Radarr, Lidarr, etc.) powered by Cloudflare Workers. It enables native-like push notifications on iOS (via Home Screen PWA) and other devices without needing paid apps or third-party services.

## Architecture

**Sonarr/Radarr** (Webhook) -> **Cloudflare Worker** -> **Apple Push Notification Service** -> **iOS PWA**

## Prerequisites

- Cloudflare account
- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- A domain managed by Cloudflare

## Setup Guide

### 1. Initialize & Configure
Clone the repo and install dependencies:
```bash
npm install
```

Create the D1 database:
```bash
npx wrangler d1 create cloudnotifiarr
```
*Update `wrangler.toml` with the `database_id` from the output.*

### 2. Generate Secrets
Generate your VAPID keys:
```bash
node scripts/generate-keys.js
```

Store the keys and your contact email in Cloudflare secrets:
```bash
npx wrangler secret put VAPID_PUBLIC_KEY   # Paste generated Public Key
npx wrangler secret put VAPID_PRIVATE_KEY  # Paste generated Private Key
npx wrangler secret put CONTACT_EMAIL      # e.g., mailto:your-email@example.com
```

### 3. Deploy
Initialize the database schema and deploy the worker:
```bash
npx wrangler d1 execute cloudnotifiarr --file=schema.sql --remote
npx wrangler deploy
```

## Client Setup (iOS)

1.  Navigate to your worker's URL (e.g., `https://notifications.yourdomain.com`).
2.  **Add to Home Screen:** Tap the Share button in Safari -> "Add to Home Screen".
3.  **Launch App:** Open the newly added icon from your home screen.
4.  **Subscribe:** Tap "Enable Notifications" and allow permissions.

## Application Configuration

Configure your *arr applications to send webhooks to your worker.

**Settings > Connect > + > Webhook**

*   **Name:** CloudNotifiarr
*   **On Grab/Import/Upgrade/Health:** Yes
*   **URL:** `https://your-worker-url.com/webhook`
*   **Method:** POST

## API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | GET | Frontend interface |
| `/webhook` | POST | Accepts webhooks from *arr apps |
| `/test` | POST | Sends a test notification to all subscribers |
| `/log` | POST | Client-side logging endpoint |

## Troubleshooting

*   **No Notifications?** Ensure you have added the site to your **Home Screen** (PWA mode). iOS web push often requires this context.
*   **Logs:** Use `npx wrangler tail` to view real-time logs from the worker.
*   **Encryption Errors:** If you reset keys, you must unsubscribe and resubscribe on the client device.

## License

MIT