import React, { useState, useEffect, useRef } from "react";
import apiClient from "../../api/apiClient";
import "./VideoPlayer.css";

const BASE_URL = apiClient.defaults.baseURL.startsWith('http') 
  ? apiClient.defaults.baseURL.replace(/\/api$/, '') 
  : window.location.origin;
/* ─── URL Detectors ─────────────────────────────────────────────── */

/**
 * Extract YouTube video ID from any YouTube URL format:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 */
function getYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") || u.pathname.split("/").pop() || null;
    }
    if (u.hostname === "youtu.be") {
      return u.pathname.replace("/", "");
    }
  } catch {}
  return null;
}

/**
 * Extract Google Drive file ID from any Drive URL format:
 *   https://drive.google.com/uc?export=view&id=FILE_ID
 *   https://drive.google.com/file/d/FILE_ID/view
 */
function getDriveFileId(url) {
  if (!url) return null;
  try {
    const p = new URL(url).searchParams.get("id");
    if (p) return p;
  } catch {}
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/* ─── Sub-components ─────────────────────────────────────────────── */

/** Loading spinner overlay shown while the iframe loads */
function LoadingOverlay() {
  return (
    <div className="vp-loading" aria-hidden="true">
      <div className="vp-spinner" />
    </div>
  );
}

/** State box for placeholder / error / generating states */
function StateBox({ variant, icon, label, sub, actions }) {
  return (
    <div className={`vp-state vp-${variant}`} role={variant === "error" ? "alert" : undefined}>
      <div className={`vp-icon-wrap${variant !== "placeholder" ? ` vp-icon-wrap--${variant}` : ""}`} aria-hidden="true">
        {icon}
      </div>
      <p className="vp-label">{label}</p>
      {sub && <p className="vp-sub">{sub}</p>}
      {actions && <div className="vp-error-actions">{actions}</div>}
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────────────── */
const PlayIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const SpinnerIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);
const ErrorIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/* ─── Main Component ─────────────────────────────────────────────── */

function VideoPlayer({ title, filePath, fileId, lessonId, onVideoCompleted }) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  // Local override: if refresh finds the file is ready, store it here
  const [localFilePath, setLocalFilePath] = useState(filePath);
  const [isChecking, setIsChecking] = useState(false);
  const [checkMsg, setCheckMsg]     = useState("");

  // HIGH-1: short-lived stream token (replaces passing full JWT in URL)
  const [streamToken, setStreamToken] = useState(null);
  const streamTokenRef = useRef(null);

  const label = title || "AI-Generated Video";

  const handleEnded = (event) => {
    const el = event?.currentTarget;
    if (!el) return;

    const duration = Number(el.duration);
    const currentTime = Number(el.currentTime);
    if (!Number.isFinite(duration) || duration <= 0) return;

    // Only count as completed when actual playback reached the end.
    const watchedRatio = currentTime / duration;
    if (!Number.isFinite(watchedRatio) || watchedRatio < 0.9) return;

    onVideoCompleted?.();
  };

  // Sync local path when the parent selects a different video
  useEffect(() => {
    setLocalFilePath(filePath);
    setIframeLoaded(false);
    setIframeError(false);
    setCheckMsg("");
    setStreamToken(null); // reset token when file changes
  }, [fileId, filePath]);

  // Fetch a short-lived stream token whenever fileId is set
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    const fetchToken = async () => {
      try {
        const res = await apiClient.post(`/lesson-files/stream-token/${fileId}`);
        if (!cancelled) {
          setStreamToken(res.data.token);
          streamTokenRef.current = res.data.token;
        }
      } catch {
        // If token fetch fails, streamToken stays null and the fallback Drive link is shown
        if (!cancelled) setStreamToken(null);
      }
    };
    fetchToken();
    return () => { cancelled = true; };
  }, [fileId]);

  // ── Soft refresh: re-fetch only this file record from the API ─────
  const handleRefreshCheck = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setCheckMsg("");
    try {
      const res = await apiClient.get(`/lesson-files/${lessonId}`);
      const record = res.data.find((f) => f.id === fileId);
      if (record && record.file_path) {
        // Video is ready — update local state, no page reload needed
        setLocalFilePath(record.file_path);
      } else {
        setCheckMsg("Still processing… try again in a moment.");
      }
    } catch {
      setCheckMsg("Could not check status. Please try again.");
    } finally {
      setIsChecking(false);
    }
  };

  // Use localFilePath for all URL detection so refresh works without prop change
  const activeFilePath = localFilePath;

  // ── Detect URL type ───────────────────────────────────────────────
  const youtubeId = getYouTubeId(activeFilePath);
  const driveId   = getDriveFileId(activeFilePath);

  /* ── Case 1: DB record exists but file not ready yet (AI still generating) */
  if (fileId && !activeFilePath) {
    return (
      <StateBox
        variant="generating"
        icon={<SpinnerIcon />}
        label="Generating your video…"
        sub={checkMsg || "The AI is still processing your content. Check back in a few minutes."}
        actions={
          <button
            className="vp-retry-btn vp-retry-btn--accent"
            type="button"
            onClick={handleRefreshCheck}
            disabled={isChecking}
          >
            {isChecking ? "Checking…" : "Refresh to check"}
          </button>
        }
      />
    );
  }

  /* ── Case 2: No file selected at all */
  if (!fileId && !activeFilePath) {
    return (
      <StateBox
        variant="placeholder"
        icon={<PlayIcon />}
        label={label}
        sub="Video will appear here once generated by AI"
      />
    );
  }

  /* ── Case 3: YouTube URL — embed with YouTube iframe player */
  if (youtubeId) {
    const embedUrl = `https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`;
    return (
      <div className="vp-wrap">
        {!iframeLoaded && <LoadingOverlay />}
        <iframe
          key={embedUrl}
          className="vp-iframe"
          src={embedUrl}
          title={label}
          scrolling="no"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          onLoad={() => setIframeLoaded(true)}
          style={{ opacity: iframeLoaded ? 1 : 0 }}
        />
      </div>
    );
  }

  /* ── Case 4: Google Drive URL ─────────────────────────────────────
     Always use native <video> via our backend stream proxy.
     The Drive /preview iframe is unreliable — Google throttles and
     blocks playback with 403s. Our backend proxies via Drive API
     (service account auth) which is never rate-limited the same way.
     ──────────────────────────────────────────────────────────────── */
  if (driveId) {
    const driveViewUrl = `https://drive.google.com/file/d/${driveId}/view`;
    // HIGH-1: use short-lived stream token instead of full JWT in URL
    const streamUrl = (fileId && streamToken)
      ? `${BASE_URL}/api/lesson-files/stream/${fileId}?streamToken=${encodeURIComponent(streamToken)}`
      : null;

    if (streamUrl) {
      return (
        <div className="vp-wrap vp-wrap--native">
          <video
            key={streamUrl}
            className="vp-video"
            controls
            preload="metadata"
            playsInline
            aria-label={label}
            onEnded={handleEnded}
          >
            <source src={streamUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    // Fallback: no fileId or no auth — link to Google Drive directly
    return (
      <StateBox
        variant="error"
        icon={<ErrorIcon />}
        label="Video available on Google Drive"
        sub="Open the video directly in Google Drive to watch it."
        actions={
          <a
            className="vp-watch-btn"
            href={driveViewUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Watch on Google Drive
          </a>
        }
      />
    );
  }

  /* ── Case 5: Backend stream URL or other direct URL */
  if (fileId && activeFilePath) {
    // HIGH-1: use short-lived stream token
    const streamSrc = streamToken
      ? `${BASE_URL}/api/lesson-files/stream/${fileId}?streamToken=${encodeURIComponent(streamToken)}`
      : null;

    if (!streamSrc) {
      // Token still loading — show a spinner
      return (
        <StateBox
          variant="generating"
          icon={<SpinnerIcon />}
          label={label}
          sub="Loading player…"
        />
      );
    }

    return (
      <div className="vp-wrap">
        <video
          key={streamSrc}
          className="vp-video"
          controls
          preload="metadata"
          aria-label={label}
          onEnded={handleEnded}
        >
          <source src={streamSrc} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  /* ── Fallback: nothing to show */
  return (
    <StateBox
      variant="placeholder"
      icon={<PlayIcon />}
      label={label}
      sub="No video available"
    />
  );
}

export default VideoPlayer;
