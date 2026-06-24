import { useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * useLatex — after content changes, walks every text node under a ref'd
 * DOM element and renders any LaTeX math found using KaTeX.
 *
 * Supports ALL common delimiters produced by AI models:
 *   $$  ... $$    display block math  (most common from AI)
 *   \[  ... \]    display block math
 *   \(  ... \)    inline math
 *   $   ... $     inline math
 *
 * Usage:
 *   const ref = useRef(null);
 *   useLatex(ref, [dependency]);   // re-runs when dependency changes
 *
 * IMPORTANT: pass the deps array as the second argument so the hook
 * knows when to re-scan (e.g. after content loads or a tab switches).
 */
function useLatex(ref, deps = []) {
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;

    // We use a double-RAF approach:
    //  1. The first RAF fires after React has committed the render.
    //  2. The second RAF fires after the browser has painted that commit,
    //     ensuring dangerouslySetInnerHTML content is fully in the DOM.
    // A 100ms setTimeout backup catches slow-reload edge cases where both
    // RAFs complete before the injected HTML is actually laid out.
    let raf1, raf2, timer;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        renderMathInElement(el);
      });
    });

    // Safety net for hard reloads / slow machines
    timer = setTimeout(() => {
      const current = ref?.current;
      if (current) renderMathInElement(current);
    }, 100);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ── Delimiter table ──────────────────────────────────────────────────────────
// Order matters: $$ MUST come before $ so that when both match at the
// same position (e.g. the string starts with "$$"), $$ wins.
const DELIMITERS = [
  { left: '$$',  right: '$$',  display: true  },
  { left: '\\[', right: '\\]', display: true  },
  { left: '\\(', right: '\\)', display: false },
  { left: '$',   right: '$',   display: false },
];

// ── DOM walker ──────────────────────────────────────────────────────────────

/**
 * Walk every text node under `root`, detect LaTeX delimiters, and replace
 * each math segment with a KaTeX-rendered <span> in-place.
 *
 * We collect all text nodes FIRST (before modifying the tree) to avoid
 * invalidating the TreeWalker while iterating.
 */
function renderMathInElement(root) {
  // Collect text nodes first — modifying the DOM while walking breaks iterators
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    // Skip nodes already inside a KaTeX-rendered subtree
    if (node.parentElement?.closest('.katex, .katex-display-wrap, .katex-inline')) continue;
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    if (!text || !text.trim()) continue;

    // Fast bail — does this text contain any delimiter?
    const hasLatex = DELIMITERS.some(d => text.includes(d.left));
    if (!hasLatex) continue;

    const frag = splitAndRender(text);
    if (frag && textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }
}

/**
 * Split `text` on LaTeX delimiters, render each math segment with KaTeX,
 * and return a DocumentFragment with plain-text nodes and math spans interleaved.
 * Returns null if no math was successfully rendered (prevents no-op replacements).
 */
function splitAndRender(text) {
  const frag = document.createDocumentFragment();
  let remaining = text;
  let didRender = false;

  while (remaining.length > 0) {
    // ── Find the earliest delimiter ─────────────────────────────────────
    let best = null;
    let bestIdx = Infinity;

    for (const d of DELIMITERS) {
      const idx = remaining.indexOf(d.left);
      if (idx === -1) continue;
      // Strict less-than: first entry in array wins ties ($$ beats $)
      if (idx < bestIdx) {
        bestIdx = idx;
        best = d;
      }
    }

    if (best === null) {
      // No more delimiters — append remaining as plain text
      frag.appendChild(document.createTextNode(remaining));
      break;
    }

    // Plain text before the opening delimiter
    if (bestIdx > 0) {
      frag.appendChild(document.createTextNode(remaining.slice(0, bestIdx)));
    }

    // Advance past opening delimiter
    const afterLeft = remaining.slice(bestIdx + best.left.length);

    // Find matching closing delimiter
    const endIdx = afterLeft.indexOf(best.right);
    if (endIdx === -1) {
      // Unclosed delimiter — emit the rest as raw text and stop
      frag.appendChild(document.createTextNode(remaining.slice(bestIdx)));
      break;
    }

    const latex = afterLeft.slice(0, endIdx).trim();
    remaining = afterLeft.slice(endIdx + best.right.length);

    // Skip empty math blocks (e.g. $$$$ or $$  $$)
    if (!latex) continue;

    try {
      const html = katex.renderToString(latex, {
        displayMode: best.display,
        throwOnError: false,
        strict: false,
        trust: false,
      });

      const wrapper = document.createElement('span');
      wrapper.className = best.display ? 'katex-display-wrap' : 'katex-inline';

      if (best.display) {
        wrapper.style.display = 'block';
        wrapper.style.textAlign = 'center';
        wrapper.style.margin = '0.75em 0';
        wrapper.style.overflowX = 'auto';
      }

      wrapper.innerHTML = html;
      frag.appendChild(wrapper);
      didRender = true;
    } catch {
      // Bad LaTeX — put back the original delimited string so content isn't lost
      frag.appendChild(
        document.createTextNode(best.left + latex + best.right)
      );
    }
  }

  return didRender ? frag : null;
}

export default useLatex;
