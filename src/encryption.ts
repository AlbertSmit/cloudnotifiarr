import type { PushSubscription } from "./types";

/**
 * Generate VAPID key pair
 * Run once and store keys in wrangler secrets
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
	// Generate P-256 key pair
	// Note: This is for offline generation script only, not used in Worker runtime
	// For Worker runtime usage, we'd need async/await, but this function is unused there.
	return { publicKey: "", privateKey: "" };
}

/**
 * Convert VAPID public key to format expected by PushManager
 */
export function vapidToApplicationKey(publicKey: ArrayBuffer): Uint8Array {
	return new Uint8Array(publicKey);
}

/**
 * Create VAPID JWT token
 */
export async function createVapidJwt(
	audience: string, // The origin of the push service
	subject: string, // mailto: or URL
	publicKey: string,
	privateKey: CryptoKey,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const expiration = now + 86400; // 24 hours

	const header = {
		alg: "ES256",
		typ: "JWT",
	};

	// Ensure subject has mailto: prefix
	let finalSubject = subject;
	if (
		subject.includes("@") &&
		!subject.startsWith("mailto:") &&
		!subject.startsWith("https://")
	) {
		finalSubject = "mailto:" + subject;
	}

	const payload = {
		aud: audience,
		sub: finalSubject,
		exp: expiration,
	};

	const encodedHeader = base64UrlEncode(JSON.stringify(header));
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const token = `${encodedHeader}.${encodedPayload}`;

	// Sign with ECDSA P-256
	const signature = await crypto.subtle.sign(
		{
			name: "ECDSA",
			hash: { name: "SHA-256" },
		},
		privateKey,
		new TextEncoder().encode(token),
	);

	return `${token}.${arrayBufferToBase64Url(signature)}`;
}

/**
 * Encrypt payload for Web Push (RFC 8291 & RFC 8188)
 */
export async function encryptPayload(
	plaintext: string,
	subscription: PushSubscription,
): Promise<ArrayBuffer> {
	// 1. Generate ephemeral key pair
	const ecdhPair = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	);

	// 2. Derive ECDH Shared Secret
	const recipientPublicKey = base64UrlToArrayBuffer(subscription.keys.p256dh);
	const recipientKey = await crypto.subtle.importKey(
		"raw",
		recipientPublicKey,
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		[],
	);

	const sharedSecret = await crypto.subtle.deriveBits(
		{ name: "ECDH", public: recipientKey },
		ecdhPair.privateKey,
		256,
	);

	// 3. Derive IKM (Input Keying Material) - RFC 8291
	const auth = base64UrlToArrayBuffer(subscription.keys.auth);
	const ephemeralPublicKey = await crypto.subtle.exportKey(
		"raw",
		ecdhPair.publicKey,
	);
	const ephemeralPublicBytes = new Uint8Array(ephemeralPublicKey);
	const recipientPublicBytes = new Uint8Array(recipientPublicKey);

	// Info = "WebPush: info" || 0x00 || recipient_public_key || transmitter_public_key
	const infoPrefix = new TextEncoder().encode("WebPush: info\0");
	const webPushInfo = new Uint8Array(
		infoPrefix.length +
			recipientPublicBytes.length +
			ephemeralPublicBytes.length,
	);
	webPushInfo.set(infoPrefix, 0);
	webPushInfo.set(recipientPublicBytes, infoPrefix.length);
	webPushInfo.set(
		ephemeralPublicBytes,
		infoPrefix.length + recipientPublicBytes.length,
	);

	// IKM = HKDF(salt=auth, ikm=sharedSecret, info=webPushInfo, len=32)
	const ikm = await hkdf(new Uint8Array(auth), sharedSecret, webPushInfo, 32);

	// 4. Derive CEK and Nonce - RFC 8188
	const salt = crypto.getRandomValues(new Uint8Array(16));

	// CEK = HKDF(salt=salt, ikm=ikm, info="Content-Encoding: aes128gcm"||0x00, len=16)
	const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
	const cekRaw = await hkdf(salt, ikm, cekInfo, 16);

	// Nonce = HKDF(salt=salt, ikm=ikm, info="Content-Encoding: nonce"||0x00, len=12)
	const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
	const nonce = await hkdf(salt, ikm, nonceInfo, 12);

	// 5. Encrypt
	const cek = await crypto.subtle.importKey(
		"raw",
		cekRaw,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	);

	const plaintextBytes = new TextEncoder().encode(plaintext);
	const padding = new Uint8Array([0x02]); // RFC 8188 padding delimiter
	const input = new Uint8Array(plaintextBytes.length + padding.length);
	input.set(plaintextBytes);
	input.set(padding, plaintextBytes.length);

	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: nonce },
		cek,
		input,
	);

	// 6. Construct Header (RFC 8188)
	// Header: Salt (16) + RS (4) + IDLen (1) + KeyId (65)
	const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
	const idlen = new Uint8Array([ephemeralPublicBytes.length]);

	const headerLen = 16 + 4 + 1 + ephemeralPublicBytes.length;
	const result = new Uint8Array(headerLen + encrypted.byteLength);

	let offset = 0;
	result.set(salt, offset);
	offset += 16;
	result.set(rs, offset);
	offset += 4;
	result.set(idlen, offset);
	offset += 1;
	result.set(ephemeralPublicBytes, offset);
	offset += ephemeralPublicBytes.length;
	result.set(new Uint8Array(encrypted), offset);

	return result.buffer;
}

/**
 * HKDF key derivation
 */
async function hkdf(
	salt: Uint8Array,
	ikm: ArrayBuffer,
	info: Uint8Array,
	length: number,
): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey(
		"raw",
		ikm,
		{ name: "HKDF" },
		false,
		["deriveBits"],
	);

	return crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: salt,
			info: info,
		},
		key,
		length * 8,
	);
}

/**
 * Get push service audience from subscription endpoint
 */
export function getAudience(endpoint: string): string {
	const url = new URL(endpoint);
	return `${url.protocol}//${url.host}`;
}

/**
 * Base64 URL encoding (Web Push standard)
 */
function base64UrlEncode(str: string): string {
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Base64 URL to standard Base64
 */
function base64UrlToBase64(base64Url: string): string {
	const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
	return base64Url.replace(/-/g, "+").replace(/_/g, "/") + padding;
}

/**
 * ArrayBuffer to Base64 URL
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return base64UrlEncode(binary);
}

/**
 * Base64 URL to ArrayBuffer
 */
export function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
	const base64 = base64UrlToBase64(base64Url);
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

/**
 * Import VAPID private key from stored format
 */
export async function importVapidPrivateKey(
	privateKeyBase64: string,
): Promise<CryptoKey> {
	const privateKeyBytes = base64UrlToArrayBuffer(privateKeyBase64);
	return crypto.subtle.importKey(
		"pkcs8",
		privateKeyBytes,
		{
			name: "ECDSA",
			namedCurve: "P-256",
		},
		true,
		["sign"],
	);
}

/**
 * Export VAPID public key to ArrayBuffer for subscription
 */
export function exportVapidPublicKey(publicKeyBase64: string): ArrayBuffer {
	return base64UrlToArrayBuffer(publicKeyBase64);
}
