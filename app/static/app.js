const state = {
  files: [],
  selectedId: null,
  view: "grid",
  filter: "all",
  query: "",
  poll: null,
};

const el = {
  fileInput: document.querySelector("#fileInput"),
  filesView: document.querySelector("#filesView"),
  emptyState: document.querySelector("#emptyState"),
  uploadStatus: document.querySelector("#uploadStatus"),
  searchInput: document.querySelector("#searchInput"),
  detailPanel: document.querySelector("#detailPanel"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailContent: document.querySelector("#detailContent"),
  closePanel: document.querySelector("#closePanel"),
  refreshBtn: document.querySelector("#refreshBtn"),
  gridBtn: document.querySelector("#gridBtn"),
  listBtn: document.querySelector("#listBtn"),
  fileCount: document.querySelector("#fileCount"),
  sectionTitle: document.querySelector("#sectionTitle"),
  dropZone: document.querySelector("#dropZone"),
};

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function highlight(text = "", query = state.query) {
  const safe = escapeHtml(text);
  if (!query.trim()) return safe;
  const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(q, "ig"), match => `<mark>${match}</mark>`);
}

function fileKind(file) {
  if (file.mime_type.startsWith("image/")) return "IMG";
  if (file.mime_type === "application/pdf") return "PDF";
  if (file.original_name.toLowerCase().endsWith(".docx")) return "DOC";
  if (file.original_name.toLowerCase().endsWith(".xlsx")) return "XLS";
  return "FILE";
}

function statusLabel(status) {
  return {
    indexed: "Indexed",
    queued: "Queued",
    processing: "Processing",
    error: "Index error",
    unsupported: "Download only",
  }[status] || status;
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function loadFiles() {
  const endpoint = state.query.trim()
    ? `/api/search?q=${encodeURIComponent(state.query.trim())}`
    : `/api/files?filter=${encodeURIComponent(state.filter === "recent" ? "all" : state.filter)}`;
  const data = await api(endpoint);
  state.files = state.filter === "recent" && !state.query ? data.files.slice(0, 12) : data.files;
  render();
  maybePoll();
}

function render() {
  el.filesView.className = state.view === "list" ? "files-grid list" : "files-grid";
  el.gridBtn.classList.toggle("active", state.view === "grid");
  el.listBtn.classList.toggle("active", state.view === "list");
  el.fileCount.textContent = `${state.files.length} ${state.files.length === 1 ? "file" : "files"}`;
  el.sectionTitle.textContent = state.query ? `Search results for “${state.query}”` :
    state.filter === "indexed" ? "OCR indexed" :
    state.filter === "recent" ? "Recent" : "All files";
  el.emptyState.classList.toggle("hidden", state.files.length > 0);
  el.filesView.innerHTML = state.files.map(fileCard).join("");
  el.filesView.querySelectorAll(".file-card").forEach(card => {
    card.addEventListener("click", () => selectFile(card.dataset.id));
  });
  renderDetail();
}

function fileCard(file) {
  const listClass = state.view === "list" ? " list" : "";
  const selected = file.id === state.selectedId ? " selected" : "";
  const snippet = file.snippet ? `<div class="file-meta">${highlight(file.snippet)}</div>` : "";
  return `
    <article class="file-card${listClass}${selected}" data-id="${file.id}">
      <div class="file-icon">${fileKind(file)}</div>
      <div>
        <div class="file-name">${highlight(file.original_name)}</div>
        <div class="file-meta">${fmtSize(file.size)} · ${fmtDate(file.created_at)}</div>
        ${snippet}
      </div>
      <span class="badge ${file.ocr_status}">${statusLabel(file.ocr_status)}</span>
    </article>
  `;
}

function selectFile(id) {
  state.selectedId = id;
  render();
  el.detailPanel.classList.add("open");
}

function selectedFile() {
  return state.files.find(file => file.id === state.selectedId) || null;
}

function renderDetail() {
  const file = selectedFile();
  el.detailEmpty.classList.toggle("hidden", !!file);
  el.detailContent.classList.toggle("hidden", !file);
  if (!file) return;
  const text = file.extracted_text || "";
  el.detailContent.innerHTML = `
    <div class="detail-title">
      <div class="file-icon">${fileKind(file)}</div>
      <h2>${escapeHtml(file.original_name)}</h2>
      <span class="badge ${file.ocr_status}">${statusLabel(file.ocr_status)}</span>
    </div>
    <div class="detail-actions">
      <a class="primary button-link" href="${file.download_url}"><button class="primary">Download</button></a>
      <button data-action="ocr">Re-index</button>
      <button class="danger" data-action="delete">Delete</button>
    </div>
    <div class="kv">
      <span>Size</span><strong>${fmtSize(file.size)}</strong>
      <span>Uploaded</span><strong>${fmtDate(file.created_at)}</strong>
      <span>Type</span><strong>${escapeHtml(file.mime_type)}</strong>
      <span>Status</span><strong>${statusLabel(file.ocr_status)}</strong>
    </div>
    ${file.ocr_error ? `<div class="ocr-box"><h3>OCR message</h3><div class="ocr-text">${escapeHtml(file.ocr_error)}</div></div>` : ""}
    <div class="ocr-box">
      <h3>Extracted text</h3>
      <div class="ocr-text">${text ? highlight(text) : "No OCR text available yet."}</div>
    </div>
  `;
  el.detailContent.querySelector('[data-action="ocr"]').addEventListener("click", () => rerunOcr(file.id));
  el.detailContent.querySelector('[data-action="delete"]').addEventListener("click", () => deleteFile(file.id));
}

async function uploadFiles(files) {
  if (!files.length) return;
  el.uploadStatus.textContent = `Uploading ${files.length}...`;
  const form = new FormData();
  Array.from(files).forEach(file => form.append("files", file));
  try {
    await api("/api/files", { method: "POST", body: form });
    el.uploadStatus.textContent = "Upload complete";
    await loadFiles();
  } catch (err) {
    el.uploadStatus.textContent = "Upload failed";
    alert(err.message);
  }
}

async function rerunOcr(id) {
  el.uploadStatus.textContent = "Indexing queued";
  await api(`/api/files/${id}/ocr`, { method: "POST" });
  await loadFiles();
}

async function deleteFile(id) {
  if (!confirm("Delete this local file and its OCR index?")) return;
  await api(`/api/files/${id}`, { method: "DELETE" });
  state.selectedId = null;
  await loadFiles();
}

function maybePoll() {
  const active = state.files.some(file => ["queued", "processing"].includes(file.ocr_status));
  if (active && !state.poll) {
    state.poll = setInterval(loadFiles, 1800);
  }
  if (!active && state.poll) {
    clearInterval(state.poll);
    state.poll = null;
  }
}

let searchTimer;
el.searchInput.addEventListener("input", event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = event.target.value;
    loadFiles();
  }, 180);
});

el.fileInput.addEventListener("change", event => uploadFiles(event.target.files));
el.refreshBtn.addEventListener("click", loadFiles);
el.gridBtn.addEventListener("click", () => { state.view = "grid"; render(); });
el.listBtn.addEventListener("click", () => { state.view = "list"; render(); });
el.closePanel.addEventListener("click", () => el.detailPanel.classList.remove("open"));

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    state.query = "";
    el.searchInput.value = "";
    loadFiles();
  });
});

["dragenter", "dragover"].forEach(name => {
  el.dropZone.addEventListener(name, event => {
    event.preventDefault();
    el.dropZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach(name => {
  el.dropZone.addEventListener(name, event => {
    event.preventDefault();
    el.dropZone.classList.remove("dragging");
  });
});
el.dropZone.addEventListener("drop", event => uploadFiles(event.dataTransfer.files));

loadFiles().catch(err => {
  el.uploadStatus.textContent = "Could not load files";
  console.error(err);
});
