#!/usr/bin/env node

/**
 * Generate proper VAPID keys for CloudNotifiarr
 *
 * Usage: node scripts/generate-keys.js
 *
 * Output:
 *   PUBLIC_KEY: <base64url>
 *   PRIVATE_KEY: <base64url>
 */

const crypto = require("node:crypto");

function toBase64Url(buffer) {
	return buffer
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

// Generate P-256 key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
	namedCurve: "P-256",
});

// Export Private Key as PKCS8 (required by Web Crypto import)
const privateKeyPkcs8 = privateKey.export({
	type: "pkcs8",
	format: "der",
});

// Export Public Key as Raw Uncompressed (required for VAPID)
// We use 'spki' first then extract the key data, or simply export as uncompressed
const publicKeyRaw = publicKey.export({
	format: "der",
	type: "spki",
});

// Extract the raw key from SPKI (last 65 bytes for P-256 uncompressed)
// SPKI header for P-256 is usually 26 bytes, total 91 bytes.
// But safer to use createECDH for raw public export if needed,
// OR just trust that we can convert.
// Actually, let's use the node ECDH for the public key raw export to be safe and simple
const ecdh = crypto.createECDH("prime256v1");
ecdh.setPrivateKey(
	privateKey.export({ type: "sec1", format: "der" }).subarray(7, 39),
); // EC private key is 32 bytes at offset 7 in SEC1 header.. tricky.

// Better way:
const jwk = publicKey.export({ format: "jwk" });
const x = Buffer.from(jwk.x, "base64");
const y = Buffer.from(jwk.y, "base64");
const rawPublic = Buffer.concat([Buffer.from([0x04]), x, y]);

console.log("\n=== VAPID Keys Generated ===\n");
console.log("VAPID_PUBLIC_KEY (Base64URL):");
console.log(toBase64Url(rawPublic));
console.log("\nVAPID_PRIVATE_KEY (Base64URL):");
console.log(toBase64Url(privateKeyPkcs8));

console.log("\n=== Setup Instructions ===\n");
console.log("1. Store the keys in Cloudflare secrets:");
console.log("   npx wrangler secret put VAPID_PUBLIC_KEY");
console.log("   npx wrangler secret put VAPID_PRIVATE_KEY");
console.log("");
console.log("2. Set your contact email:");
console.log("   npx wrangler secret put CONTACT_EMAIL");
console.log("   Example: mailto:notifications@example.com\n");
