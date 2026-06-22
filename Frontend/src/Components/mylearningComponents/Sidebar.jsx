import React, { useState, useEffect, useRef } from "react";
import { Accordion, Button, Spinner, Modal } from "react-bootstrap";
import { BsX, BsPencil, BsTrash, BsCheck, BsXCircle } from "react-icons/bs";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../api/apiClient";
import "./Sidebar.css";

function Sidebar({ onCloseSidebar, onSelectContent, onFilesChanged, lessonId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [openAccordion, setOpenAccordion] = useState("0");

  // Reduced-motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const itemAnim = {
    initial: { opacity: 0, y: prefersReducedMotion ? 0 : 7 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: prefersReducedMotion ? 0 : 0.18, ease: [0.25, 1, 0.5, 1] },
  };


  // Rename state
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const renameInputRef = useRef(null);

  // Custom delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  // Generate-with-PDF-selection modal
  const [generateModal, setGenerateModal] = useState({ show: false, type: null, selectedPdfIds: [] });

  // ── In-app toast notification ────────────────────────────────
  const [notify, setNotify] = useState(null); // { type: 'error'|'success'|'info', message }
  const notifyTimerRef = useRef(null);

  const showNotify = (type, message) => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    setNotify({ type, message });
    notifyTimerRef.current = setTimeout(() => setNotify(null), 4500);
  };

  // ── Fetch files from DB ──────────────────────────────────────
  const fetchFiles = async () => {
    if (!lessonId) return;
    try {
      setLoading(true);
      const { data } = await apiClient.get(`/lesson-files/${lessonId}`);
      setFiles(data);

      // Auto-select first video (or first uploaded file) on load
      const firstVideo = data.find((f) => f.type === "video");
      const firstFile = data[0];
      const toSelect = firstVideo || firstFile;
      if (toSelect && activeId === null) {
        setActiveId(toSelect.id);
        onSelectContent(toSelect.type, toSelect.name, toSelect.file_path, toSelect.id);
        setOpenAccordion(toSelect.type === "video" ? "1" : toSelect.type === "audio" ? "2" : "0");
      }
    } catch (err) {
      console.error("Error fetching lesson files:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line
  }, [lessonId]);

  useEffect(() => {
    if (editingId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingId]);

  // ── Derived lists ────────────────────────────────────────────
  const uploadedFiles = files.filter((f) => f.type === "upload");
  const videos        = files.filter((f) => f.type === "video");
  const audios        = files.filter((f) => f.type === "audio");

  // ── Upload File ──────────────────────────────────────────────
  const fileInputRef = useRef(null);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file || !lessonId) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("lesson_id", lessonId);

    try {
      // ⚠️ Do NOT set Content-Type manually — axios sets multipart/form-data
      // with the correct boundary automatically when FormData is passed.
      const { data } = await apiClient.post("/lesson-files/upload", formData);
      setFiles((prev) => [...prev, data]);
      setActiveId(data.id);
      onSelectContent("upload", data.name, data.file_path, data.id);
      setOpenAccordion("0");
      if (onFilesChanged) onFilesChanged(); // refresh analytics
      if (onCloseSidebar) onCloseSidebar();
    } catch (err) {
      console.error("Upload failed:", err);
      showNotify("error", `Upload failed: ${err.response?.data?.message || err.message || "Unknown error"}`);
    }
    e.target.value = "";
  };

  // ── Generate — step 1: open PDF-selection modal ─────────────
  const openGenerateModal = (type) => {
    setGenerateModal({ show: true, type, selectedPdfIds: [] });
  };

  // ── Generate — step 2: confirm and send to backend ───────────
  const handleGenerate = async () => {
    const { type, selectedPdfIds } = generateModal;
    setGenerateModal({ show: false, type: null, selectedPdfIds: [] });
    if (!lessonId) return;

    const label = type === "video" ? "AI Video" : "AI Audio";
    const count = (type === "video" ? videos : audios).length + 1;
    const name = `${label} ${count}`;

    // Build source file details for the AI team
    const sourcePdfs = uploadedFiles
      .filter((f) => selectedPdfIds.includes(f.id))
      .map((f) => ({ id: f.id, name: f.name, file_path: f.file_path }));

    try {
      const { data } = await apiClient.post("/lesson-files", {
        lesson_id: lessonId,
        type,
        name,
        source_file_ids: selectedPdfIds,   // AI team uses these to locate PDFs
        source_files: sourcePdfs,           // convenience: full paths included
      });
      setFiles((prev) => [...prev, data]);
      setActiveId(data.id);
      onSelectContent(type, data.name, data.file_path, data.id);
      setOpenAccordion(type === "video" ? "1" : "2");
      if (onFilesChanged) onFilesChanged(); // refresh analytics
      if (onCloseSidebar) onCloseSidebar();
    } catch (err) {
      console.error("Generate failed:", err);
      showNotify("error", `Generation failed: ${err.response?.data?.message || err.message || "Unknown error"}`);
    }
  };

  const togglePdfSelection = (id) => {
    setGenerateModal((prev) => ({
      ...prev,
      selectedPdfIds: prev.selectedPdfIds.includes(id)
        ? prev.selectedPdfIds.filter((x) => x !== id)
        : [...prev.selectedPdfIds, id],
    }));
  };

  // ── Select ───────────────────────────────────────────────────
  const handleSelect = (record) => {
    if (editingId !== null) return;
    setActiveId(record.id);
    onSelectContent(record.type, record.name, record.file_path, record.id);
    if (onCloseSidebar) onCloseSidebar();
  };

  // ── Rename ───────────────────────────────────────────────────
  const startEdit = (e, record) => {
    e.stopPropagation();
    setEditingId(record.id);
    setEditingName(record.name);
  };

  const saveEdit = async (id) => {
    if (!editingName.trim()) { cancelEdit(); return; }
    try {
      const { data } = await apiClient.put(`/lesson-files/${id}`, { name: editingName.trim() });
      setFiles((prev) => prev.map((f) => (f.id === id ? data : f)));
    } catch (err) {
      console.error("Rename failed:", err);
    }
    setEditingId(null);
    setEditingName("");
  };

  const cancelEdit = () => { setEditingId(null); setEditingName(""); };

  // ── Delete (custom modal) ────────────────────────────────────
  const askDelete = (e, record) => {
    e.stopPropagation();
    if (onCloseSidebar) onCloseSidebar(); // start sidebar slide-out (0.3s transition)
    // Open modal AFTER the sidebar has finished sliding out
    setTimeout(() => setDeleteTarget(record), 320);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await apiClient.delete(`/lesson-files/${id}`);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (onFilesChanged) onFilesChanged(); // refresh analytics
      if (activeId === id) {
        setActiveId(null);
        onSelectContent("video", "", null, null);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      showNotify("error", `Delete failed: ${err.response?.data?.message || err.message || "Unknown error"}`);
    }
  };

  // ── Render a single list item ────────────────────────────────
  const renderItem = (record) => (
    <motion.li
      key={record.id}
      initial={itemAnim.initial}
      animate={itemAnim.animate}
      transition={itemAnim.transition}
      className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between sidebar-file-item${activeId === record.id ? " active" : ""}`}
      onClick={() => handleSelect(record)}
      style={{ cursor: "pointer" }}
    >
      {editingId === record.id ? (
        <div className="d-flex align-items-center gap-1 w-100" onClick={(e) => e.stopPropagation()}>
          <input
            ref={renameInputRef}
            className="form-control form-control-sm"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit(record.id);
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={() => saveEdit(record.id)}
          />
          <BsCheck className="sidebar-icon text-success" onClick={() => saveEdit(record.id)} />
          <BsXCircle className="sidebar-icon text-danger" onClick={cancelEdit} />
        </div>
      ) : (
        <>
          <span className="sidebar-file-name text-truncate">{record.name}</span>
          <span className="sidebar-actions ms-2 d-flex gap-1">
            <BsPencil
              className="sidebar-icon"
              title="Rename"
              aria-label={`Rename ${record.name}`}
              role="button"
              tabIndex={0}
              onClick={(e) => startEdit(e, record)}
              onKeyDown={(e) => e.key === 'Enter' && startEdit(e, record)}
            />
            <BsTrash
              className="sidebar-icon text-danger"
              title="Delete"
              aria-label={`Delete ${record.name}`}
              role="button"
              tabIndex={0}
              onClick={(e) => askDelete(e, record)}
              onKeyDown={(e) => e.key === 'Enter' && askDelete(e, record)}
            />
          </span>
        </>
      )}
    </motion.li>
  );

  return (
    <div className="sidebar-container">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,image/*,application/pdf"
        onChange={handleFileSelected}
      />

      {/* ── Custom Delete Confirm Modal ── */}
      <Modal
        show={!!deleteTarget}
        onHide={() => setDeleteTarget(null)}
        centered
        className="delete-confirm-modal"
        backdropClassName="delete-confirm-backdrop"
        dialogClassName="delete-modal-dialog"
        contentClassName="delete-modal-content"
      >
        <Modal.Body className="text-center px-5 pt-5 pb-4">
          {/* Icon */}
          <div className="delete-modal-icon mb-4">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </div>

          <h4 className="delete-modal-title">Delete this item?</h4>
          <p className="delete-modal-subtitle">
            <span className="delete-modal-filename">"{deleteTarget?.name}"</span>
            {" "}will be permanently removed and cannot be recovered.
          </p>

          <div className="delete-modal-actions">
            <button className="delete-btn-cancel" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button className="delete-btn-confirm" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </Modal.Body>
      </Modal>

      {/* ── PDF-Selection Modal (Generate Video / Audio) ── */}
      <Modal
        show={generateModal.show}
        onHide={() => setGenerateModal({ show: false, type: null, selectedPdfIds: [] })}
        centered
        className="delete-confirm-modal"
        backdropClassName="delete-confirm-backdrop"
        dialogClassName="delete-modal-dialog"
        contentClassName="delete-modal-content"
      >
        <Modal.Body className="px-4 pt-4 pb-3">
          <h5 className="fw-bold mb-1">
            {generateModal.type === "video" ? "🎬 Generate Video" : "🎙️ Generate Audio"}
          </h5>
          <p className="text-muted mb-3" style={{ fontSize: "0.85rem" }}>
            Select which uploaded PDFs the AI should use as source material.
          </p>

          {uploadedFiles.length === 0 ? (
            <p className="text-muted text-center py-3" style={{ fontSize: "0.9rem" }}>
              ⚠️ No PDFs uploaded yet. Upload at least one file first.
            </p>
          ) : (
            <>
              {/* Select All shortcut */}
              <div className="d-flex align-items-center gap-2 mb-2 pb-2" style={{ borderBottom: "1px solid #eee" }}>
                <input
                  type="checkbox"
                  id="gen-select-all"
                  checked={generateModal.selectedPdfIds.length === uploadedFiles.length}
                  onChange={() =>
                    setGenerateModal((prev) => ({
                      ...prev,
                      selectedPdfIds:
                        prev.selectedPdfIds.length === uploadedFiles.length
                          ? []
                          : uploadedFiles.map((f) => f.id),
                    }))
                  }
                />
                <label htmlFor="gen-select-all" style={{ fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}>
                  Select All
                </label>
              </div>

              {/* Per-file checkboxes — scrollable after 3 rows (~42px each) */}
              <div style={{ maxHeight: "130px", overflowY: "auto", paddingRight: "4px" }}>
                {uploadedFiles.map((f) => (
                  <div key={f.id} className="d-flex align-items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id={`gen-pdf-${f.id}`}
                      checked={generateModal.selectedPdfIds.includes(f.id)}
                      onChange={() => togglePdfSelection(f.id)}
                    />
                    <label
                      htmlFor={`gen-pdf-${f.id}`}
                      style={{ fontSize: "0.88rem", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}
                      title={f.name}
                    >
                      📄 {f.name}
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="delete-modal-actions">
            <button
              className="delete-btn-cancel"
              onClick={() => setGenerateModal({ show: false, type: null, selectedPdfIds: [] })}
            >
              Cancel
            </button>
            <button
              className="delete-btn-confirm generate-btn-confirm"
              disabled={generateModal.selectedPdfIds.length === 0}
              style={{ opacity: generateModal.selectedPdfIds.length === 0 ? 0.5 : 1 }}
              onClick={handleGenerate}
            >
              Generate
            </button>
          </div>
        </Modal.Body>
      </Modal>

      <div className="sidebar-header">
        <h4 className="sidebar-title mb-0">Lesson Content</h4>
        <Button variant="link" className="sidebar-close-btn d-xl-none p-0" onClick={onCloseSidebar}>
          <BsX size={28} />
        </Button>
      </div>

      <Button variant="outline-dark" className="w-100 mb-3 sideButtons upload-button" onClick={handleUploadClick}>
        <i className="bi bi-upload me-2"></i> Upload File
      </Button>
      <Button variant="outline-dark" className="w-100 mb-2 sideButtons generate-button" onClick={() => openGenerateModal("video")}>
        <i className="bi bi-camera-video me-2"></i> Generate Video
      </Button>
      <Button variant="outline-dark" className="w-100 mb-3 sideButtons generate-button" onClick={() => openGenerateModal("audio")}>
        <i className="bi bi-mic me-2"></i> Generate Audio
      </Button>

      {loading ? (
        <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Accordion activeKey={openAccordion} onSelect={(e) => setOpenAccordion(e)}>
          <Accordion.Item eventKey="0" className="accordion-item-custom">
            <Accordion.Header>
              Uploaded Files{" "}
              {uploadedFiles.length > 0 && <span className="badge bg-secondary ms-2">{uploadedFiles.length}</span>}
            </Accordion.Header>
            <Accordion.Body>
              {uploadedFiles.length === 0
                ? <p className="text-muted small mb-0">No files uploaded yet.</p>
                : <ul className="list-group list-group-flush">{uploadedFiles.map(renderItem)}</ul>}
            </Accordion.Body>
          </Accordion.Item>

          <Accordion.Item eventKey="1" className="accordion-item-custom">
            <Accordion.Header>
              AI-Generated Videos{" "}
              {videos.length > 0 && <span className="badge bg-secondary ms-2">{videos.length}</span>}
            </Accordion.Header>
            <Accordion.Body>
              {videos.length === 0
                ? <p className="text-muted small mb-0">No videos generated yet.</p>
                : <ul className="list-group list-group-flush">{videos.map(renderItem)}</ul>}
            </Accordion.Body>
          </Accordion.Item>

          <Accordion.Item eventKey="2" className="accordion-item-custom">
            <Accordion.Header>
              AI-Generated Audios{" "}
              {audios.length > 0 && <span className="badge bg-secondary ms-2">{audios.length}</span>}
            </Accordion.Header>
            <Accordion.Body>
              {audios.length === 0
                ? <p className="text-muted small mb-0">No audios generated yet.</p>
                : <ul className="list-group list-group-flush">{audios.map(renderItem)}</ul>}
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      )}

      {/* ── In-app toast notification ─────────────────────────────── */}
      <AnimatePresence>
        {notify && (
          <motion.div
            key="sidebar-toast"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            className={`sidebar-toast sidebar-toast--${notify.type}`}
          >
            <span className="sidebar-toast__icon">
              {notify.type === "error"   && "⚠️"}
              {notify.type === "success" && "✅"}
              {notify.type === "info"    && "ℹ️"}
            </span>
            <span className="sidebar-toast__msg">{notify.message}</span>
            <button
              className="sidebar-toast__close"
              onClick={() => setNotify(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Sidebar;