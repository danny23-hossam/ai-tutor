/**
 * One-time script: Generate an Ed25519 key pair for Web Bot Auth.
 *
 * Usage:
 *   node Backend/scripts/generate-bot-auth-keys.js
 *
 * Output:
 *   - Prints WEB_BOT_AUTH_PRIVATE_KEY and WEB_BOT_AUTH_PUBLIC_JWK to stdout
 *   - Copy these into Backend/.env (and your Render secret env vars)
 *
 * Spec: https://datatracker.ietf.org/doc/html/draft-meunier-http-message-signatures-directory
 */

'use strict';

const { webcrypto } = require('crypto');
const { subtle } = webcrypto;

async function main() {
    // Generate Ed25519 key pair via WebCrypto (Node ≥ 15)
    const { privateKey, publicKey } = await subtle.generateKey(
        { name: 'Ed25519' },
        true, // extractable
        ['sign', 'verify']
    );

    // Export private key as JWK (we store the full JWK, use "d" for signing)
    const privateJwk = await subtle.exportKey('jwk', privateKey);

    // Export public key as JWK (only kty/crv/x — no "d")
    const publicJwk = await subtle.exportKey('jwk', publicKey);
    // Strip any private key material just in case
    const { d: _d, ...safePublicJwk } = publicJwk;

    // Calculate JWK thumbprint (RFC 7638 / RFC 8037 §Appendix A.3)
    // For OKP/Ed25519: canonical JSON is {"crv":"Ed25519","kty":"OKP","x":"<x>"}
    const thumbprintInput = JSON.stringify({
        crv: safePublicJwk.crv,
        kty: safePublicJwk.kty,
        x: safePublicJwk.x,
    });
    const thumbprintBytes = await subtle.digest(
        'SHA-256',
        new TextEncoder().encode(thumbprintInput)
    );
    const thumbprint = Buffer.from(thumbprintBytes)
        .toString('base64url'); // base64url, no padding

    console.log('\n=== Web Bot Auth Keys ===\n');
    console.log('Add these to Backend/.env (and your Render environment variables):\n');
    console.log(`WEB_BOT_AUTH_PRIVATE_KEY='${JSON.stringify(privateJwk)}'`);
    console.log(`WEB_BOT_AUTH_PUBLIC_JWK='${JSON.stringify(safePublicJwk)}'`);
    console.log(`\nJWK Thumbprint (informational — computed at runtime):\n  ${thumbprint}\n`);
    console.log('=========================\n');
    console.log('IMPORTANT: Keep WEB_BOT_AUTH_PRIVATE_KEY secret. Never commit it to git.\n');
}

main().catch(err => {
    console.error('Failed to generate keys:', err);
    process.exit(1);
});
