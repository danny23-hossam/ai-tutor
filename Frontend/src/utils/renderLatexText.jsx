/**
 * renderLatexText — renders a plain text / markdown string as React nodes
 * with full support for:
 *   - LaTeX math:  $...$  $$...$$  \(...\)  \[...\]
 *   - Auto-detection of undelimited math (Unicode Greek, \commands, subscripts)
 *   - Bold / Italic / Lists / Code / Headings / Line breaks
 *
 * Powered by react-markdown + remark-math + rehype-katex.
 *
 * Handles ALL known AI output formats:
 *   Format 1: Already-delimited         →  $\alpha_i$  or  $$W^2$$
 *   Format 2: \( \) and \[ \] delimited →  \(\alpha_i\)
 *   Format 3: Raw LaTeX commands        →  \mathbf{w}\cdot\mathbf{x}_i
 *   Format 4: Unicode math symbols      →  α_i(y_i(W·x_i - b) - 1)
 *   Format 5: Plain subscript/super     →  W^2, x_i, W_{ij}
 *   Format 6: Mixed text + any above    →  "The sum of weights, ∫ W^2"
 *
 * Usage:
 *   import renderLatexText from '../../utils/renderLatexText';
 *   <p>{renderLatexText(question)}</p>
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/* ═══════════════════════════════════════════════════════════
   Unicode → LaTeX replacement map
   ═══════════════════════════════════════════════════════════ */
const UNICODE_TO_LATEX = {
  // Lowercase Greek
  'α': '\\alpha',  'β': '\\beta',   'γ': '\\gamma',  'δ': '\\delta',
  'ε': '\\epsilon','ζ': '\\zeta',   'η': '\\eta',     'θ': '\\theta',
  'ι': '\\iota',   'κ': '\\kappa',  'λ': '\\lambda',  'μ': '\\mu',
  'ν': '\\nu',     'ξ': '\\xi',     'π': '\\pi',      'ρ': '\\rho',
  'σ': '\\sigma',  'τ': '\\tau',    'φ': '\\phi',     'χ': '\\chi',
  'ψ': '\\psi',    'ω': '\\omega',
  // Uppercase Greek
  'Γ': '\\Gamma',  'Δ': '\\Delta',  'Θ': '\\Theta',   'Λ': '\\Lambda',
  'Σ': '\\Sigma',  'Π': '\\Pi',     'Φ': '\\Phi',     'Ψ': '\\Psi',
  'Ω': '\\Omega',
  // Operators & symbols
  '∫': '\\int',    '∑': '\\sum',    '∏': '\\prod',    '∞': '\\infty',
  '≤': '\\leq',    '≥': '\\geq',    '≠': '\\neq',     '≈': '\\approx',
  '±': '\\pm',     '×': '\\times',  '÷': '\\div',     '√': '\\sqrt',
  '∂': '\\partial','∇': '\\nabla',  '∈': '\\in',      '∉': '\\notin',
  '⊂': '\\subset', '⊃': '\\supset', '∪': '\\cup',     '∩': '\\cap',
  '→': '\\to',     '←': '\\leftarrow', '⇒': '\\Rightarrow',
  '⇔': '\\Leftrightarrow', '·': '\\cdot', '∀': '\\forall', '∃': '\\exists',
};

// Pre-build the Unicode detection regex once
const _unicodeChars = Object.keys(UNICODE_TO_LATEX)
  .map(c => c.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')).join('');
const UNICODE_RE = new RegExp(`[${_unicodeChars}]`, 'g');

/* ═══════════════════════════════════════════════════════════
   Detection helpers
   ═══════════════════════════════════════════════════════════ */

/** Does the text already have proper math delimiters? */
function hasDelimiters(text) {
  return /\$/.test(text);
}

/** Does the text contain LaTeX backslash commands like \mathbf, \cdot, \ge? */
function hasLatexCommands(text) {
  return /\\[a-zA-Z]{2,}/.test(text);
}

/** Does the text contain subscript/superscript notation? */
function hasMathNotation(text) {
  return /[_^]/.test(text);
}

/** Does the text contain Unicode math symbols? */
function hasUnicodeMath(text) {
  // Reset lastIndex since UNICODE_RE is global
  UNICODE_RE.lastIndex = 0;
  return UNICODE_RE.test(text);
}

/**
 * Count "real" English words in the text.
 * English word = 3+ consecutive letters, no backslash, no _ or ^
 * This helps distinguish "all math" from "mixed English + math"
 */
function countEnglishWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.filter(w => {
    // Must be 3+ letters (possibly with trailing punctuation)
    if (!/^[a-zA-Z]{3,}[.?,;:!'")\]]*$/.test(w)) return false;
    // Must NOT contain LaTeX backslash
    if (w.includes('\\')) return false;
    return true;
  }).length;
}

/* ═══════════════════════════════════════════════════════════
   autoWrapMath — the core preprocessing function
   ═══════════════════════════════════════════════════════════ */

/**
 * Auto-detect undelimited math expressions and wrap them in $...$.
 *
 * Strategy:
 *   1. If text already has $ delimiters → return as-is (remark-math handles it)
 *   2. Replace Unicode math symbols → LaTeX commands
 *   3. If text is "mostly math" (few English words) → wrap entire text in $...$
 *   4. If text is mixed English + math → find math segments and wrap each one
 */
function autoWrapMath(text) {
  // ── Gate 1: Already has $ delimiters → skip entirely ──
  if (hasDelimiters(text)) return text;

  // ── Step 1: Replace Unicode math → LaTeX commands ──
  let processed = text;
  UNICODE_RE.lastIndex = 0;
  if (hasUnicodeMath(text)) {
    UNICODE_RE.lastIndex = 0;
    processed = text.replace(UNICODE_RE, (ch) => UNICODE_TO_LATEX[ch] || ch);
  }

  // ── Gate 2: No math indicators at all → return ──
  const _hasLatex = hasLatexCommands(processed);
  const _hasNotation = hasMathNotation(processed);
  if (!_hasLatex && !_hasNotation) return processed;

  // ── Step 2: Count English words to decide strategy ──
  const engWordCount = countEnglishWords(processed);

  // ── Tier 1: Predominantly math ──
  // Entire text is one math expression (like answer options):
  //   e.g. "(y_i(\mathbf{w}\cdot\mathbf{x}_i - b) \ge 1)"
  //   e.g. "W^2 + b"
  //   e.g. "\alpha_i(y_i(W x_i - b) - 1)"
  if (engWordCount <= 2) {
    return '$' + processed + '$';
  }

  // ── Tier 2: Mixed text — find and wrap math segments ──
  // e.g. "The sum of squared weights, \int W^2"
  // e.g. "Which constraint on (x_i, y_i) is correct?"
  return wrapMathSegments(processed);
}

/**
 * Find math segments in mixed English+math text and wrap each in $...$.
 *
 * A "math segment" starts when we encounter a token containing:
 *   - A LaTeX command (\something)
 *   - A subscript/superscript (x_i, W^2, x_{ij})
 *
 * It continues as long as subsequent tokens are "math-compatible":
 *   - Single/double letter variables (x, W, ab)
 *   - Numbers (1, 42)
 *   - Operators and brackets (+, -, *, /, =, (, ), etc.)
 *   - More LaTeX commands or subscript/superscript tokens
 */
function wrapMathSegments(text) {
  // Split preserving whitespace so we can reconstruct
  const parts = text.split(/(\s+)/);
  let result = '';
  let mathBuf = '';
  let inMath = false;

  const flushMath = () => {
    const trimmed = mathBuf.trim();
    if (trimmed) {
      result += '$' + trimmed + '$';
    }
    mathBuf = '';
    inMath = false;
  };

  for (const part of parts) {
    // ── Whitespace: add to current buffer ──
    if (/^\s+$/.test(part)) {
      if (inMath) mathBuf += ' ';
      else result += part;
      continue;
    }

    // ── Check if token has definitive math indicators ──
    const tokenHasMath = /\\[a-zA-Z]/.test(part) || /[_^]/.test(part);

    // ── Check if token is "math-compatible" (can continue a math run) ──
    // This catches variables (b, x), numbers (1), operators (+, -, =),
    // and bracket-attached tokens (b), 1), x])
    const isMathContinuation = inMath && !tokenHasMath && (
      /^[A-Za-z]{1,2}[)}\].,;:]*$/.test(part) ||   // short variable, possibly with closing bracket
      /^\d+[)}\].,;:]*$/.test(part) ||                // number, possibly with closing bracket
      /^[+\-*/=()[\]{}|.,;:<>!]+$/.test(part) ||     // pure operators/brackets
      /^[(\[{][A-Za-z\d]/.test(part) ||                // opening bracket + letter/digit
      /^[A-Za-z\d][)\]}]$/.test(part)                  // letter/digit + closing bracket
    );

    if (tokenHasMath || isMathContinuation) {
      if (!inMath) inMath = true;
      if (mathBuf && !mathBuf.endsWith(' ')) mathBuf += ' ';
      mathBuf += part;
    } else {
      // This token is plain English — flush any accumulated math
      if (inMath) flushMath();
      result += part;
    }
  }

  // Flush any remaining math at end of string
  if (inMath) flushMath();
  return result;
}

/* ═══════════════════════════════════════════════════════════
   Main export
   ═══════════════════════════════════════════════════════════ */

/**
 * Main export — call with a string, get React nodes back.
 * Returns the original value unchanged if it's not a string.
 */
function renderLatexText(text) {
  if (!text || typeof text !== 'string') return text;

  let processed = text;

  // ── Step 1: Convert \[...\] and \(...\) delimiter pairs ──
  // remark-math only recognizes $/$$ by default, so convert these first.
  // \( and \) are ALWAYS LaTeX inline math delimiters (the content inside
  // can start with any LaTeX command like \mathbf, \alpha, etc.)
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$' + '$1' + '$$$$');
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, p1) => '$' + p1 + '$');

  // ── Step 2: Auto-detect and wrap undelimited math ──
  processed = autoWrapMath(processed);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // Render paragraphs as spans to avoid nesting <p> inside <p>/<h3>/etc.
        p: ({ children }) => <span className="md-paragraph">{children}</span>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

export default renderLatexText;
