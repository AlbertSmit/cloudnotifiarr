import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY: string;
	CONTACT_EMAIL: string;
	DB: D1Database;
}
