import React, { useState, useRef, useEffect } from "react";
import "./UploadedFile.css";
import { BsFileEarmarkText, BsBook, BsDownload, BsXCircle } from "react-icons/bs";
import apiClient from "../../api/apiClient";

// Use Google Docs Viewer for any remote PDF — bypasses all CORS/header issues
function getPreviewUrl(url) {
  if (!url) return null;
  if (url.startsWith('blob:')) return url; // local file after fresh upload
  return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
}

// fileUrl  = server URL for a DB-stored file (Cloudinary URL or relative path)
// fileId   = DB record id, used for backend proxy download
// fileName = display name stored in DB
// file     = local JS File object (just after a fresh upload before page refresh)
const UploadedFile = ({ fileName, file, fileUrl, fileId, onUpload }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [localUrl, setLocalUrl] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef(null);

  const activeUrl = fileUrl || localUrl;

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setLocalUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setLocalUrl(null);
      setShowPreview(false);
    }
  }, [file]);

  useEffect(() => {
    setShowPreview(false);
  }, [fileUrl]);

  const togglePreview = () => {
    if (!activeUrl) return;
    setShowPreview((s) => !s);
  };

  const handleDownload = async () => {
    if (!activeUrl) return;

    // For local blob (fresh upload not yet saved): download directly
    if (activeUrl.startsWith('blob:')) {
      const link = document.createElement("a");
      link.href = activeUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // For saved files: use backend proxy for correct filename
    if (fileId) {
      setDownloading(true);
      try {
        const response = await apiClient.get(`/lesson-files/download/${fileId}`, {
          responseType: 'blob',
        });
        const blobUrl = URL.createObjectURL(response.data);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        console.error('Download failed:', err);
        // Fallback: open directly
        window.open(activeUrl, '_blank', 'noopener,noreferrer');
      } finally {
        setDownloading(false);
      }
    } else {
      window.open(activeUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const hasFile = !!activeUrl;

  return (
    <div className="preview-card">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const f = e.target.files[0];
          if (f) onUpload(f);
          setShowPreview(false);
          e.target.value = "";
        }}
        style={{ display: "none" }}
        accept="application/pdf"
      />

      {showPreview && activeUrl ? (
        <div className="pdf-preview-container">
          <iframe
            src={getPreviewUrl(activeUrl)}
            title={fileName}
            width="100%"
            height="500px"
            style={{ border: "none" }}
          />
        </div>
      ) : (
        <div className="file-info-area" style={{ cursor: "default" }}>
          <div className="icon-container">
            <BsFileEarmarkText className="file-icon" />
          </div>
          <h3 className="file-name">{fileName}</h3>
          <p className="file-status">
            {hasFile ? "Document ready to view" : "File not available"}
          </p>
        </div>
      )}

      <div className="button-group">
        <button
          className={`btn ${showPreview ? "btn-secondary" : "btn-primary"}`}
          onClick={togglePreview}
          disabled={!hasFile}
        >
          {showPreview ? <BsXCircle className="btn-icon" /> : <BsBook className="btn-icon" />}
          {showPreview ? "Close Preview" : "Open Preview"}
        </button>

        <button
          className="btn btn-secondary"
          onClick={handleDownload}
          disabled={!hasFile || downloading}
        >
          <BsDownload className="btn-icon" />
          {downloading ? "Downloading..." : "Download"}
        </button>
      </div>
    </div>
  );
};

export default UploadedFile;