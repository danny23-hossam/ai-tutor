'use strict';

/**
 * Markdown content negotiation helpers.
 *
 * When an HTTP client sends `Accept: text/markdown` (e.g. an AI agent),
 * we should return a markdown representation of the page instead of HTML,
 * while keeping HTML as the default for browsers.
 *
 * Spec references:
 *   - https://llmstxt.org/
 *   - https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
 *   - https://www.rfc-editor.org/rfc/rfc9110#section-12  (HTTP content negotiation)
 */

const TurndownService = require('turndown');

const turndown = new TurndownService({
    headingStyle: 'atx',       // Use # headers
    codeBlockStyle: 'fenced',  // Use ``` fences
    bulletListMarker: '-',
});

/**
 * Convert an HTML string to Markdown.
 *
 * @param {string} html
 * @returns {string} markdown
 */
function htmlToMarkdown(html) {
    return turndown.turndown(html);
}

/**
 * Naively count the approximate GPT-style token count for a string.
 * One token ≈ 4 characters (rough heuristic matching Cloudflare's approach).
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

/**
 * Returns true when the request prefers `text/markdown` over `text/html`.
 * Respects quality values (q-factor) per RFC 9110 §12.5.1.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function wantsMarkdown(req) {
    // express provides req.accepts() which handles q-factors correctly
    const preferred = req.accepts(['text/html', 'text/markdown']);
    return preferred === 'text/markdown';
}

/**
 * Express route helper: given an HTML string and a res object, sends
 * either HTML or Markdown depending on what the client accepts.
 *
 * Usage inside a route handler:
 *   sendWithMarkdownNegotiation(req, res, myHtmlString);
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {string} html - The HTML body to serve (or convert)
 * @param {number} [statusCode=200]
 */
function sendWithMarkdownNegotiation(req, res, html, statusCode = 200) {
    // Always advertise that markdown is available
    res.setHeader('Vary', 'Accept');

    if (wantsMarkdown(req)) {
        const md = htmlToMarkdown(html);
        const tokens = estimateTokens(md);

        res.status(statusCode)
            .setHeader('Content-Type', 'text/markdown; charset=utf-8')
            .setHeader('x-markdown-tokens', String(tokens))
            .send(md);
    } else {
        res.status(statusCode)
            .setHeader('Content-Type', 'text/html; charset=utf-8')
            .send(html);
    }
}

module.exports = { wantsMarkdown, htmlToMarkdown, estimateTokens, sendWithMarkdownNegotiation };
