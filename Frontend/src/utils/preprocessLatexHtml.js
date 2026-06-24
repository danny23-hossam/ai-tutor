/**
 * preprocessLatexHtml — takes an HTML string, finds LaTeX delimiters inside
 * text nodes, replaces them with KaTeX-rendered HTML, and returns the
 * processed HTML string.
 *
 * This runs SYNCHRONOUSLY before React commits to the DOM, so the very
 * first paint already has rendered equations — no flash of raw LaTeX.
 *
 * Supports ALL common delimiters produced by AI models:
 *   $$  ... $$    display block math
 *   \[  ... \]    display block math
 *   \(  ... \)    inline math
 *   $   ... $     inline math
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

// Order matters: $$ MUST come before $ so the longer delimiter wins ties.
const DELIMITERS = [
  { left: '$$',  right: '$$',  display: true  },
  { left: '\\[', right: '\\]', display: true  },
  { left: '\\(', right: '\\)', display: false },
  { left: '$',   right: '$',   display: false },
];

/**
 * Heuristic: detect text that looks like LaTeX but wasn't wrapped in
 * delimiters by the AI. Auto-wrap such expressions in $...$ so the
 * main parser can pick them up.
 *
 * Detects patterns like: LL_{t+1}(D), x^{2}, \sum_{i=1}, etc.
 */
const UNDELIMITED_LATEX_RE = /(?:[A-Za-z_]+(?:_{[^}]+}|\^{[^}]+})+(?:\([^)]*\))?|\\(?:sum|prod|frac|sqrt|log|ln|sin|cos|tan|int|lim|inf|sup|max|min|alpha|beta|gamma|delta|epsilon|lambda|mu|sigma|theta|omega|Delta|Lambda|Sigma|Omega|partial|nabla|forall|exists|in|notin|subset|subseteq|cup|cap|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|rightarrow|leftarrow|Rightarrow|Leftarrow|infty)(?:[_{^][^}\s]*}?)*)/g;

function autoWrapUndelimitedLatex(text) {
  if (!text || typeof text !== 'string') return text;
  // Don't process if it already has delimiters
  if (DELIMITERS.some(d => text.includes(d.left))) return text;
  // Check for subscript/superscript patterns or backslash commands
  if (!text.includes('_{') && !text.includes('^{') && !text.includes('\\')) return text;

  return text.replace(UNDELIMITED_LATEX_RE, (match) => {
    // Avoid wrapping things that are clearly not math (too short, just letters)
    if (match.length < 3) return match;
    return `$${match}$`;
  });
}

/**
 * Process a plain text string: find LaTeX delimiters and replace each
 * math segment with KaTeX-rendered HTML. Non-math text is escaped.
 * Returns the processed HTML string, or null if nothing was rendered.
 */
function processTextSegment(text) {
  if (!text || !text.trim()) return null;

  // Auto-wrap undelimited LaTeX patterns before checking for delimiters
  text = autoWrapUndelimitedLatex(text);

  // Fast bail — no delimiters at all
  const hasLatex = DELIMITERS.some(d => text.includes(d.left));
  if (!hasLatex) return null;

  let remaining = text;
  let result = '';
  let didRender = false;

  while (remaining.length > 0) {
    // Find the earliest-starting delimiter
    let best = null;
    let bestIdx = Infinity;

    for (const d of DELIMITERS) {
      const idx = remaining.indexOf(d.left);
      if (idx === -1) continue;
      if (idx < bestIdx) {
        bestIdx = idx;
        best = d;
      }
    }

    if (best === null) {
      result += escapeHtml(remaining);
      break;
    }

    // Plain text before the opening delimiter
    if (bestIdx > 0) {
      result += escapeHtml(remaining.slice(0, bestIdx));
    }

    // Advance past opening delimiter
    const afterLeft = remaining.slice(bestIdx + best.left.length);

    // Find matching closing delimiter
    const endIdx = afterLeft.indexOf(best.right);
    if (endIdx === -1) {
      // Unclosed — emit raw text and stop
      result += escapeHtml(remaining.slice(bestIdx));
      break;
    }

    const latex = afterLeft.slice(0, endIdx).trim();
    remaining = afterLeft.slice(endIdx + best.right.length);

    if (!latex) continue;

    try {
      const html = katex.renderToString(latex, {
        displayMode: best.display,
        throwOnError: false,
        strict: false,
        trust: false,
      });

      const style = best.display
        ? ' style="display:block;text-align:center;margin:0.75em 0;overflow-x:auto"'
        : '';
      const cls = best.display ? 'katex-display-wrap' : 'katex-inline';

      result += `<span class="${cls}"${style}>${html}</span>`;
      didRender = true;
    } catch {
      // Bad LaTeX — show raw text
      result += escapeHtml(best.left + latex + best.right);
    }
  }

  return didRender ? result : null;
}

/** Minimal HTML escaping for plain text segments */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Main export — takes an HTML string, processes LaTeX in all text nodes,
 * returns a new HTML string with KaTeX-rendered math.
 *
 * Uses DOMParser to properly walk text nodes without clobbering HTML tags.
 */
export default function preprocessLatexHtml(html) {
  if (!html || typeof html !== 'string') return html;

  // Fast bail — no delimiters in the entire string
  const hasLatex = DELIMITERS.some(d => html.includes(d.left));
  if (!hasLatex) return html;

  // Parse the HTML into a temporary document
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Collect text nodes first (modifying DOM while walking breaks iterators)
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    // Skip nodes already inside KaTeX output (shouldn't happen, but be safe)
    if (node.parentElement?.closest('.katex, .katex-display-wrap, .katex-inline')) continue;
    textNodes.push(node);
  }

  // Process each text node
  for (const textNode of textNodes) {
    const processed = processTextSegment(textNode.nodeValue);
    if (processed !== null) {
      // Create a temporary container, set innerHTML, then replace the text node
      // with the rendered content
      const temp = doc.createElement('span');
      temp.innerHTML = processed;

      // Replace text node with the children of the temp span
      const parent = textNode.parentNode;
      while (temp.firstChild) {
        parent.insertBefore(temp.firstChild, textNode);
      }
      parent.removeChild(textNode);
    }
  }

  return doc.body.innerHTML;
}
