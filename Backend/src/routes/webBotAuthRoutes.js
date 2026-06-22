'use strict';

/**
 * Web Bot Auth — HTTP Message Signatures Directory
 *
 * Spec: https://datatracker.ietf.org/doc/html/draft-meunier-http-message-signatures-directory-01
 * Docs: https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/
 *
 * Publishes a JWKS at /.well-known/http-message-signatures-directory so that
 * receiving sites (e.g. Cloudflare-protected sites) can verify requests signed
 * by this server.
 *
 * Environment variables required:
 *   WEB_BOT_AUTH_PRIVATE_KEY  – Full JWK (JSON string) of the Ed25519 private key
 *   WEB_BOT_AUTH_PUBLIC_JWK   – Public JWK (JSON string) of the Ed25519 public key
 *
 * Generate them once with:
 *   node Backend/scripts/generate-bot-auth-keys.js
 */

const express = require('express');
const { webcrypto } = require('crypto');

const { subtle } = webcrypto;
const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate the base64url-encoded JWK thumbprint (RFC 7638 / RFC 8037 §A.3).
 * For OKP Ed25519 the canonical JSON member set is: crv, kty, x  (alphabetical).
 *
 * @param {{ crv: string, kty: string, x: string }} pubJwk
 * @returns {Promise<string>}
 */
async function jwkThumbprint(pubJwk) {
    const canonical = JSON.stringify({ crv: pubJwk.crv, kty: pubJwk.kty, x: pubJwk.x });
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return Buffer.from(digest).toString('base64url');
}

/**
 * Import an Ed25519 private key JWK for signing.
 *
 * @param {object} jwk – Private key JWK
 * @returns {Promise<CryptoKey>}
 */
function importPrivateKey(jwk) {
    return subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
}

/**
 * Produce an Ed25519 signature over `data` and return it as base64.
 *
 * @param {CryptoKey} key
 * @param {string|Uint8Array} data
 * @returns {Promise<string>} base64-encoded signature
 */
async function sign(key, data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const sig = await subtle.sign('Ed25519', key, bytes);
    return Buffer.from(sig).toString('base64');
}

/**
 * Build the signature base string for the directory endpoint per RFC 9421.
 *
 * Components signed: ("@authority";req)
 * Parameters: alg, keyid, nonce, tag, created, expires
 *
 * @param {object} opts
 * @returns {string}
 */
function buildSignatureBase({ authority, keyid, nonce, created, expires }) {
    // Component identifier line
    const componentLine = `"@authority";req: ${authority}`;

    // Signature-Input value (without the label prefix, for the base)
    const inputValue =
        `("@authority";req)` +
        `;alg="ed25519"` +
        `;keyid="${keyid}"` +
        `;nonce="${nonce}"` +
        `;tag="http-message-signatures-directory"` +
        `;created=${created}` +
        `;expires=${expires}`;

    // Signature base = component lines + @signature-params line (RFC 9421 §2.5)
    return `${componentLine}\n"@signature-params": ${inputValue}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET /.well-known/http-message-signatures-directory
 *
 * Returns a signed JWKS. The Signature + Signature-Input headers prove this
 * server controls the private key corresponding to the published public key.
 */
router.get('/', async (req, res) => {
    // ── 1. Load keys from environment ────────────────────────────────────────
    const privateJwkJson  = process.env.WEB_BOT_AUTH_PRIVATE_KEY;
    const publicJwkJson   = process.env.WEB_BOT_AUTH_PUBLIC_JWK;

    if (!privateJwkJson || !publicJwkJson) {
        console.error('[web-bot-auth] Missing WEB_BOT_AUTH_PRIVATE_KEY or WEB_BOT_AUTH_PUBLIC_JWK env vars.');
        return res.status(503).json({
            error: 'Web Bot Auth not configured. See Backend/scripts/generate-bot-auth-keys.js.',
        });
    }

    let privateJwk, publicJwk;
    try {
        privateJwk = JSON.parse(privateJwkJson);
        publicJwk  = JSON.parse(publicJwkJson);
    } catch {
        return res.status(500).json({ error: 'Invalid key configuration.' });
    }

    // ── 2. Build JWKS body ───────────────────────────────────────────────────
    // Only expose kty / crv / x — never expose "d" (private scalar)
    const { d: _d, ...safePublicJwk } = publicJwk;
    const jwks = { keys: [safePublicJwk] };
    const body = JSON.stringify(jwks);

    // ── 3. Compute signature parameters ──────────────────────────────────────
    const now      = Math.floor(Date.now() / 1000);
    const created  = now;
    const expires  = now + 300; // 5-minute window

    // Random nonce (base64url, 32 bytes)
    const nonceBytes = new Uint8Array(32);
    webcrypto.getRandomValues(nonceBytes);
    const nonce = Buffer.from(nonceBytes).toString('base64url');

    // Authority = Host header from the request
    const authority = req.hostname || req.headers['host'] || 'localhost';

    // JWK thumbprint used as keyid
    const keyid = await jwkThumbprint(safePublicJwk);

    // ── 4. Build signature base and sign ──────────────────────────────────────
    const sigBase = buildSignatureBase({ authority, keyid, nonce, created, expires });

    let privateKey, sigB64;
    try {
        privateKey = await importPrivateKey(privateJwk);
        sigB64 = await sign(privateKey, sigBase);
    } catch (err) {
        console.error('[web-bot-auth] Signing failed:', err.message);
        return res.status(500).json({ error: 'Signing failed.' });
    }

    // ── 5. Compose Signature-Input and Signature headers ─────────────────────
    const signatureInput =
        `sig1=("@authority";req)` +
        `;alg="ed25519"` +
        `;keyid="${keyid}"` +
        `;nonce="${nonce}"` +
        `;tag="http-message-signatures-directory"` +
        `;created=${created}` +
        `;expires=${expires}`;

    const signatureHeader = `sig1=:${sigB64}:`;

    // ── 6. Send response ──────────────────────────────────────────────────────
    res
        .set('Content-Type', 'application/http-message-signatures-directory+json')
        .set('Signature-Input', signatureInput)
        .set('Signature', signatureHeader)
        .set('Cache-Control', 'max-age=86400')
        .send(body);
});

module.exports = router;
