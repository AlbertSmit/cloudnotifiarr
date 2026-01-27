import {
	deactivateSubscription,
	getActiveSubscriptions,
	getRecentNotifications,
	saveNotification,
	saveSubscription,
} from "./db";
import { getFrontendHtml, MANIFEST, SERVICE_WORKER_CODE } from "./frontend";
import { sendNotificationToSubscription, sendPushToAll } from "./push";
import type {
	ArrWebhookPayload,
	Env,
	FormattedMessage,
	NotificationPayload,
} from "./types";

type RouteHandler = (request: Request, env: Env, url: URL) => Promise<Response>;

// #MARK: Route Handlers

const handleHealth: RouteHandler = async () => {
	return new Response("OK", { status: 200 });
};

const handleFrontend: RouteHandler = async (req, env) => {
	const html = getFrontendHtml(env.VAPID_PUBLIC_KEY);
	return new Response(html, { headers: { "Content-Type": "text/html" } });
};

const handleServiceWorker: RouteHandler = async () => {
	return new Response(SERVICE_WORKER_CODE, {
		headers: { "Content-Type": "application/javascript" },
	});
};

const handleIcon: RouteHandler = async () => {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23007AFF" width="192" height="192" rx="40"/><text x="96" y="130" font-size="100" text-anchor="middle" fill="white">🔔</text></svg>`;
	return new Response(svg, {
		headers: {
			"Content-Type": "image/svg+xml",
			"Cache-Control": "public, max-age=86400",
		},
	});
};

const handleManifest: RouteHandler = async () => {
	return new Response(JSON.stringify(MANIFEST), {
		headers: { "Content-Type": "application/json" },
	});
};

const handleSubscribe: RouteHandler = async (req, env) => {
	const subscription = await req.json();
	const userAgent = req.headers.get("User-Agent") || undefined;
	await saveSubscription(env.DB, subscription as any, userAgent);
	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	});
};

const handleUnsubscribe: RouteHandler = async (req, env) => {
	const subscription = await req.json();
	await deactivateSubscription(env.DB, (subscription as any).endpoint);
	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	});
};

const handleLog: RouteHandler = async (req) => {
	const data = await req.json().catch(() => ({}));
	console.log("[CLIENT LOG]", (data as any).message);
	return new Response("OK", { status: 200 });
};

const handleWebhook: RouteHandler = async (req, env) => {
	let webhook: ArrWebhookPayload;
	const contentType = req.headers.get("Content-Type") || "";

	if (contentType.includes("application/json")) {
		webhook = await req.json();
	} else {
		const text = await req.text();
		webhook = JSON.parse(text);
	}

	const message = formatArrMessage(webhook);

	await saveNotification(
		env.DB,
		message.title,
		message.body,
		JSON.stringify(webhook),
		message.eventType,
	);

	const pushPayload: NotificationPayload = {
		title: message.title,
		body: message.body,
		icon: "/icon-192.png",
		badge: "/badge-72.png",
		tag: message.eventType,
		data: message.data,
	};

	const result = await sendPushToAll(env.DB, pushPayload, env);

	return new Response(
		JSON.stringify({ success: true, sent: result.sent, failed: result.failed }),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
};

const handleTest: RouteHandler = async (req, env) => {
	const body = await req.json().catch(() => ({}));
	const targetEndpoint = (body as any).endpoint;

	const pushPayload: NotificationPayload = {
		title: "Test Notification",
		body: "CloudNotifiarr is working correctly!",
		icon: "/icon-192.png",
		badge: "/badge-72.png",
		tag: "test",
		data: { url: "/" },
	};

	if (targetEndpoint) {
		const detail = await sendNotificationToSubscription(
			env.DB,
			targetEndpoint,
			pushPayload,
			env,
		);
		return new Response(
			JSON.stringify({
				success: true,
				message: "Test notification sent",
				sent: detail.success ? 1 : 0,
				failed: detail.success ? 0 : 1,
				debug: { status: detail.status, message: detail.statusText },
			}),
			{ headers: { "Content-Type": "application/json" } },
		);
	}

	const result = await sendPushToAll(env.DB, pushPayload, env);
	return new Response(
		JSON.stringify({
			success: true,
			message: "Test notification sent",
			sent: result.sent,
			failed: result.failed,
		}),
		{ headers: { "Content-Type": "application/json" } },
	);
};

const handleStats: RouteHandler = async (req, env) => {
	const subscriptions = await getActiveSubscriptions(env.DB);
	return new Response(
		JSON.stringify({ active_subscriptions: subscriptions.length }),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
};

const handleNotifications: RouteHandler = async (req, env, url) => {
	const limit = Number.parseInt(url.searchParams.get("limit") || "20");
	const notifications = await getRecentNotifications(env.DB, limit);
	return new Response(JSON.stringify(notifications), {
		headers: { "Content-Type": "application/json" },
	});
};

// #MARK: Router

export async function handleRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;
	const method = request.method;

	try {
		if (path === "/health" || path === "/favicon.ico")
			return handleHealth(request, env, url);
		if ((path === "/" || path === "/index.html") && method === "GET")
			return handleFrontend(request, env, url);
		if (path === "/sw.js" && method === "GET")
			return handleServiceWorker(request, env, url);
		if (
			(path === "/icon-192.png" || path === "/badge-72.png") &&
			method === "GET"
		)
			return handleIcon(request, env, url);
		if (path === "/manifest.json" && method === "GET")
			return handleManifest(request, env, url);
		if (path === "/subscribe" && method === "POST")
			return handleSubscribe(request, env, url);
		if (path === "/unsubscribe" && method === "POST")
			return handleUnsubscribe(request, env, url);
		if (path === "/log" && method === "POST")
			return handleLog(request, env, url);
		if (path === "/webhook" && method === "POST")
			return handleWebhook(request, env, url);
		if (path === "/test" && method === "POST")
			return handleTest(request, env, url);
		if (path === "/stats" && method === "GET")
			return handleStats(request, env, url);
		if (path === "/notifications" && method === "GET")
			return handleNotifications(request, env, url);

		// Compatibility
		if (path === "/vapid-public-key" && method === "GET") {
			return new Response(env.VAPID_PUBLIC_KEY, {
				headers: { "Content-Type": "text/plain" },
			});
		}

		return new Response("Not Found", { status: 404 });
	} catch (error: any) {
		console.error("Worker error:", error);
		return new Response(
			JSON.stringify({ error: error.message || String(error) }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

// #MARK: Helpers

function formatArrMessage(webhook: ArrWebhookPayload): FormattedMessage {
	const eventType = webhook.eventType;
	let title = "";
	let body = "";
	const data: Record<string, unknown> = {};

	switch (eventType) {
		case "Grab":
			title = "Episode Grabbed";
			body = formatEpisodeMessage(webhook);
			if (webhook.release?.quality) body += ` [${webhook.release.quality}]`;
			if (webhook.release?.releaseGroup)
				body += ` - ${webhook.release.releaseGroup}`;
			data.type = "arr-grab";
			break;

		case "Download":
		case "EpisodeDownload":
		case "Import":
			title = "Download Complete";
			body = formatEpisodeMessage(webhook);
			data.type = "arr-download";
			break;

		case "SeriesAdd":
			title = "Series Added";
			body = webhook.series?.title || "Unknown Series";
			data.type = "arr-series-add";
			break;

		case "SeriesDelete":
			title = "Series Deleted";
			body = webhook.series?.title || "Unknown Series";
			data.type = "arr-series-delete";
			break;

		case "Rename":
			title = "Series Renamed";
			body = webhook.series?.title || "Unknown Series";
			data.type = "arr-rename";
			break;

		case "EpisodeFileDelete":
			title = "Episode Deleted";
			body = formatEpisodeMessage(webhook);
			data.type = "arr-episode-delete";
			break;

		case "Health":
			title = "Health Issue";
			body = formatHealthMessage(webhook);
			data.type = "arr-health";
			break;

		case "Test":
			title = "Test Notification";
			body = "CloudNotifiarr is configured correctly!";
			data.type = "arr-test";
			break;

		case "MovieDownload":
		case "MovieDelete":
			title =
				eventType === "MovieDownload" ? "Movie Downloaded" : "Movie Deleted";
			body = webhook.movie?.title || "Unknown Movie";
			if (webhook.movie?.year) body += " (" + webhook.movie.year + ")";
			if (eventType === "MovieDownload" && webhook.release?.quality)
				body += ` [${webhook.release.quality}]`;
			data.type = "arr-movie";
			break;

		case "MovieAdded":
			title = "Movie Added";
			body = webhook.movie?.title || "Unknown Movie";
			if (webhook.movie?.year) body += ` (${webhook.movie.year})`;
			data.type = "arr-movie-add";
			break;

		case "MovieGrab":
			title = "Movie Grabbed";
			body = webhook.movie?.title || "Unknown Movie";
			if (webhook.movie?.year) body += ` (${webhook.movie.year})`;
			if (webhook.release?.quality) body += ` [${webhook.release.quality}]`;
			if (webhook.release?.releaseGroup)
				body += ` - ${webhook.release.releaseGroup}`;
			data.type = "arr-movie-grab";
			break;

		case "ApplicationUpdate":
			title = "App Updated";
			body = (webhook.package?.packageAuthor || "App") + " updated";
			data.type = "arr-update";
			break;

		default:
			title = formatEventTypeTitle(eventType);
			body = extractBestBody(webhook);
			data.type = "arr-other";
	}

	return { title, body, eventType, data };
}

function formatEpisodeMessage(webhook: ArrWebhookPayload): string {
	const seriesTitle = webhook.series?.title || "Unknown Series";

	if (webhook.episode) {
		const ep = webhook.episode;
		return (
			seriesTitle +
			" S" +
			ep.seasonNumber.toString().padStart(2, "0") +
			"E" +
			ep.episodeNumber.toString().padStart(2, "0") +
			" - " +
			ep.title
		);
	}

	if (webhook.episodes && webhook.episodes.length > 0) {
		const ep = webhook.episodes[0];
		const more =
			webhook.episodes.length > 1
				? " (+" + (webhook.episodes.length - 1) + " more)"
				: "";
		return (
			seriesTitle +
			" S" +
			ep.seasonNumber.toString().padStart(2, "0") +
			"E" +
			ep.episodeNumber.toString().padStart(2, "0") +
			" - " +
			ep.title +
			more
		);
	}

	return seriesTitle;
}

function formatHealthMessage(webhook: ArrWebhookPayload): string {
	const messages = webhook.messages || [];
	if (messages.length > 0) {
		return messages
			.map((m) => m.message || m.text || "Health issue")
			.join("\n");
	}
	return "Health check failed";
}

/**
 * Converts camelCase/PascalCase eventType to a human-readable title
 * e.g. "MovieAdded" -> "Movie Added", "EpisodeFileDelete" -> "Episode File Delete"
 */
function formatEventTypeTitle(eventType: string): string {
	return eventType
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/**
 * Extracts the best human-readable summary from an *arr webhook payload
 * Tries to find meaningful content rather than dumping raw JSON
 */
function extractBestBody(webhook: ArrWebhookPayload): string {
	// Try movie info first
	if (webhook.movie?.title) {
		let msg = webhook.movie.title;
		if (webhook.movie.year) msg += ` (${webhook.movie.year})`;
		return msg;
	}

	// Try series/episode info
	if (webhook.series?.title) {
		return formatEpisodeMessage(webhook);
	}

	// Try health messages
	if (webhook.messages && webhook.messages.length > 0) {
		return formatHealthMessage(webhook);
	}

	// Try package info (for updates)
	if (webhook.package?.packageAuthor) {
		let msg = webhook.package.packageAuthor;
		if (webhook.package.packageVersion) msg += ` v${webhook.package.packageVersion}`;
		return msg;
	}

	// Last resort: indicate unknown payload
	return "Notification received";
}
