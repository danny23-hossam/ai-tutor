import { useState, useEffect } from 'react';

/**
 * Returns true once KaTeX CDN has finished loading.
 * Components that use renderLatexText should call this hook
 * so they re-render after KaTeX becomes available.
 */
function useKatexReady() {
  const [ready, setReady] = useState(() => !!window.__katexReady);

  useEffect(() => {
    if (window.__katexReady) return; // already loaded
    const handler = () => setReady(true);
    document.addEventListener('katex-ready', handler, { once: true });
    return () => document.removeEventListener('katex-ready', handler);
  }, []);

  return ready;
}

export default useKatexReady;
