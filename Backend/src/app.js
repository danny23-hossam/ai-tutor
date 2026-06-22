const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// LOW-2: Patch console.error in production to strip stack traces from logs.
// Must be called before routes load so all controllers are covered.
const { installProductionLogger } = require('./utils/logger');
installProductionLogger();

const { sendWithMarkdownNegotiation } = require('./middleware/markdownNegotiation');

// Security: Prevent unhandled exceptions and rejections from crashing the app
// in a way that dumps raw objects (which may contain credentials like the DB config).
process.on('uncaughtException', (err) => {
    console.error('FATAL Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// ── Startup environment guard ─────────────────────────────────────────────
// Fail loudly if any critical secret is missing. This prevents the app from
// running with insecure fallback values (e.g. a hardcoded JWT secret).
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
    console.error(`\n[FATAL] Missing required environment variables: ${missingEnv.join(', ')}`);
    console.error('[FATAL] Set them in your .env file or deployment environment before starting the server.');
    process.exit(1);
}

// LOW-1: Warn in dev if CORS_ORIGIN is not set (in production this should be required).
if (!process.env.CORS_ORIGIN) {
    if (process.env.NODE_ENV === 'production') {
        console.error('[FATAL] CORS_ORIGIN must be set in production. Exiting.');
        process.exit(1);
    }
    console.warn('[WARN] CORS_ORIGIN not set — falling back to Vite dev origins only.');
}


const app = express();

function getBaseUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
}

// ── Trust Render's reverse proxy ─────────────────────────────────────────
// Render (and most cloud platforms) sit behind a load balancer that adds
// X-Forwarded-For. Without this, express-rate-limit throws a ValidationError
// and cannot correctly identify client IPs for rate limiting.
app.set('trust proxy', 1);

// ── MED-4: Security headers (helmet) ─────────────────────────────────────
// Override crossOriginResourcePolicy to 'cross-origin' — this API is
// intentionally served cross-origin (Vercel frontend → Render backend).
// The default 'same-origin' would block all browser requests from Vercel.
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// MED-3: Parse cookies so authMiddleware can read the HttpOnly JWT cookie
app.use(cookieParser());

// ── MED-1: Rate limiting ──────────────────────────────────────────────────
// Auth endpoints: 10 requests per 15 minutes (brute-force / credential stuffing)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,  // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    message: { message: 'Too many attempts from this IP. Please try again in 15 minutes.' },
});

// General API: 100 requests per minute (abuse / scraping protection)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' },
});

// CORS — credentials:true is required for the browser to send the HttpOnly auth cookie.
// With credentials:true, origin CANNOT be '*', so we use CORS_ORIGIN or the Vite dev default.
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
    origin: corsOrigins,
    credentials: true,
}));

// MED-2/3: Explicit JSON body size limit
app.use(express.json({ limit: '1mb' }));

// ── RFC 8288 Link headers for agent discovery ─────────────────────────────
// These headers advertise machine-readable resources to AI agents and crawlers.
// See: https://www.rfc-editor.org/rfc/rfc8288
//      https://www.rfc-editor.org/rfc/rfc9727#section-3
app.use((req, res, next) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader(
        'Link',
        [
            `<${baseUrl}/api/docs>; rel="service-doc"; type="text/html"`,
            `<${baseUrl}/api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
            `<${baseUrl}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
            `<${baseUrl}/.well-known/openid-configuration>; rel="openid-configuration"; type="application/json"`,
            `<${baseUrl}/.well-known/oauth-authorization-server>; rel="oauth-authorization-server"; type="application/json"`,
            `<${baseUrl}/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"`,
        ].join(', ')
    );
    next();
});

// ── Root endpoint ─────────────────────────────────────────────────────────
// Supports content negotiation:
//   • Browsers (Accept: text/html) → HTML page
//   • AI agents (Accept: text/markdown) → Markdown + x-markdown-tokens header
// The Vary: Accept header (set by sendWithMarkdownNegotiation) ensures caches
// store separate copies for each representation.
app.get('/', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PapyrusAI API</title>
</head>
<body>
  <h1>PapyrusAI API</h1>
  <p>AI-powered tutoring platform backend. Version 1.0.0.</p>
  <h2>Resources</h2>
  <ul>
    <li><a href="/api/docs">API Documentation</a></li>
    <li><a href="/api/openapi.json">OpenAPI Specification (JSON)</a></li>
    <li><a href="/.well-known/api-catalog">API Catalog</a></li>
  </ul>
  <h2>Endpoints</h2>
  <ul>
    <li><strong>POST /api/auth/register</strong> – Register a new user</li>
    <li><strong>POST /api/auth/login</strong> – Authenticate and receive a session cookie</li>
    <li><strong>GET /api/lessons</strong> – List lessons for the authenticated user</li>
    <li><strong>POST /api/ai-generations</strong> – Generate AI-powered study content</li>
  </ul>
</body>
</html>`;

    sendWithMarkdownNegotiation(req, res, html);
});

app.get('/api/docs', (req, res) => {
    const baseUrl = getBaseUrl(req);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PapyrusAI API Documentation</title>
</head>
<body>
  <h1>PapyrusAI API Documentation</h1>
  <p>This service provides authenticated endpoints for lessons, files, analytics, and AI generations.</p>
  <h2>OpenAPI</h2>
  <p><a href="${baseUrl}/api/openapi.json">${baseUrl}/api/openapi.json</a></p>
  <h2>Health</h2>
  <p><a href="${baseUrl}/api/health">${baseUrl}/api/health</a></p>
</body>
</html>`;
    sendWithMarkdownNegotiation(req, res, html);
});

app.get('/api/openapi.json', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader('Content-Type', 'application/vnd.oai.openapi+json; charset=utf-8');
    res.json({
        openapi: '3.1.0',
        info: {
            title: 'PapyrusAI API',
            version: '1.0.0',
            description: 'AI-powered tutoring platform backend API.'
        },
        servers: [{ url: `${baseUrl}/api` }],
        paths: {
            '/health': {
                get: {
                    summary: 'Service health check',
                    responses: {
                        '200': { description: 'Healthy' }
                    }
                }
            }
        }
    });
});



// ── P3-2: Validate numeric route params globally ──────────────────────────
// app.param() fires whenever ANY route contains the named parameter.
// This prevents non-integer IDs from reaching PostgreSQL and causing
// confusing 500 errors instead of proper 400 Bad Request responses.
function requirePositiveInt(paramName) {
    return (req, res, next, value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed <= 0 || String(parsed) !== String(value)) {
            return res.status(400).json({ message: `Invalid ${paramName}: must be a positive integer` });
        }
        req.params[paramName] = parsed;
        next();
    };
}
app.param('id',       requirePositiveInt('id'));
app.param('lessonId', requirePositiveInt('lessonId'));

// ── Routes ────────────────────────────────────────────────────────────────

// Health endpoint for the API catalog status
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

// ── .well-known routes (no rate limiting — must be freely accessible) ────
app.get('/.well-known/api-catalog', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader('Content-Type', 'application/linkset+json');
    res.send(JSON.stringify({
        "linkset": [
            {
                "anchor": `${baseUrl}/api`,
                "service-desc": [
                    { "href": `${baseUrl}/api/openapi.json`, "type": "application/vnd.oai.openapi+json" }
                ],
                "service-doc": [
                    { "href": `${baseUrl}/api/docs`, "type": "text/html" }
                ],
                "status": [
                    { "href": `${baseUrl}/api/health`, "type": "application/json" }
                ]
            }
        ]
    }));
});

// OpenID Connect Discovery 1.0 metadata
app.get('/.well-known/openid-configuration', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/login`,
        token_endpoint: `${baseUrl}/api/auth/login`,
        jwks_uri: `${baseUrl}/.well-known/http-message-signatures-directory`,
        response_types_supported: ['token'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['HS256'],
        grant_types_supported: ['password', 'client_credentials'],
        scopes_supported: ['api', 'stream']
    });
});

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
        "issuer": baseUrl,
        "authorization_endpoint": `${baseUrl}/login`,
        "token_endpoint": `${baseUrl}/api/auth/login`,
        "jwks_uri": `${baseUrl}/.well-known/http-message-signatures-directory`,
        "response_types_supported": ["token"],
        "grant_types_supported": ["password", "client_credentials"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
        "scopes_supported": ["api", "stream"]
    });
});

// OAuth Protected Resource Metadata (RFC 9728)
app.get('/.well-known/oauth-protected-resource', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
        "resource": baseUrl,
        "authorization_servers": [baseUrl],
        "scopes_supported": ["api", "stream"],
        "bearer_methods_supported": ["header", "cookie"]
    });
});

// Model Context Protocol (MCP) Server Card (SEP-1649)
app.get('/.well-known/mcp/server-card.json', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
        "serverInfo": {
            "name": "PapyrusAI Server",
            "version": "1.0.0",
            "description": "AI-powered tutoring platform backend"
        },
        "transport": {
            "type": "sse", // SSE is standard for over-HTTP MCP
            "endpoint": `${baseUrl}/api/mcp/sse`
        },
        "capabilities": {
            "tools": {},
            "prompts": {},
            "resources": {}
        }
    });
});

// Agent Skills Discovery Index (RFC v0.2.0)
app.get('/.well-known/agent-skills/index.json', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
        "$schema": "https://agentskills.io/schema/v0.2.0/skills_index.json",
        "skills": [
            {
                "name": "papyrus-ai-api",
                "type": "rest",
                "description": "Core interactions with the PapyrusAI tutoring platform",
                "url": `${baseUrl}/api/openapi.json`,
                // SHA-256 placeholder (representing the openapi spec schema identity)
                "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" 
            }
        ]
    });
});

const webBotAuthRoutes = require('./routes/webBotAuthRoutes');
app.use('/.well-known/http-message-signatures-directory', webBotAuthRoutes);

// Apply the strict limiter to auth before registering the routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authLimiter, authRoutes);

// Apply the general limiter to all other API routes
app.use('/api', apiLimiter);

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

const lessonRoutes = require('./routes/lessonRoutes');
app.use('/api/lessons', lessonRoutes);

const userLessonRoutes = require('./routes/userLessonRoutes');
app.use('/api/user-lessons', userLessonRoutes);

const aiGenerationRoutes = require('./routes/aiGenerationRoutes');
app.use('/api/ai-generations', aiGenerationRoutes);

const reminderRoutes = require('./routes/reminderRoutes');
app.use('/api/reminders', reminderRoutes);

const lessonFileRoutes = require('./routes/lessonFileRoutes');
app.use('/api/lesson-files', lessonFileRoutes);

const studyDaysRoutes = require('./routes/studyDaysRoutes');
app.use('/api/study-days', studyDaysRoutes);


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Papyrus Server running on port ${PORT}`);
});
