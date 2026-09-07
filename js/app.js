import {
  addMedia, updateMedia, deleteMedia, getAllMedia, getMedia,
  getTopTags, getSetting, setSetting, estimateStorage, requestPersistentStorage,
} from "./db.js";
import { uuid, isVideoFile, isImageFile, processImage, processVideo, formatBytes, formatDuration } from "./media.js";

const BROLL_PRESETS = [
  "Nature", "Ville", "Intérieur", "Extérieur", "Mains", "Détail",
  "Portrait", "Paysage", "Transition", "Ciel / Météo", "Nourriture",
  "Mouvement", "Calme", "Texture", "Coucher de soleil", "Nuit",
];

const state = {
  all: [],
  filter: "all",
  activeTags: new Set(),
  query: "",
  aiEnabled: false,
  currentDetailId: null,
  thumbUrls: new Map(), // id -> object URL, pour éviter de recréer sans arrêt
};

const el = (id) => document.getElementById(id);
const gallery = el("gallery");
const searchInput = el("searchInput");
const filterChips = el("filterChips");
const tagChipsWrap = el("tagChips");
const emptyState = el("emptyState");
const mediaCountEl = el("mediaCount");
const fileInput = el("fileInput");
const importOverlay = el("importOverlay");
const importStatus = el("importStatus");
const importProgressBar = el("importProgressBar");
const importSub = el("importSub");
const toastEl = el("toast");

// ---------- Toast ----------
let toastTimer = null;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

// ---------- Chargement initial ----------
async function boot() {
  state.aiEnabled = await getSetting("aiEnabled", false);
  el("aiToggle").checked = state.aiEnabled;

  state.all = await getAllMedia();
  renderTagChips();
  renderGallery();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}
boot();

// ---------- Rendu ----------
function objectUrlFor(mediaId, blob) {
  if (state.thumbUrls.has(mediaId)) return state.thumbUrls.get(mediaId);
  const url = URL.createObjectURL(blob);
  state.thumbUrls.set(mediaId, url);
  return url;
}

function matchesFilters(item) {
  if (state.filter === "photo" && item.type !== "photo") return false;
  if (state.filter === "video" && item.type !== "video") return false;
  if (state.filter === "favorite" && !item.favorite) return false;
  if (state.filter === "broll" && !item.broll) return false;

  if (state.activeTags.size) {
    const itemTags = new Set(item.tags || []);
    let matchesAny = false;
    for (const t of state.activeTags) {
      if (itemTags.has(t)) { matchesAny = true; break; }
    }
    if (!matchesAny) return false;
  }

  if (state.query) {
    const q = state.query.toLowerCase();
    const haystack = [item.name, ...(item.tags || [])].join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function renderGallery() {
  const items = state.all.filter(matchesFilters);
  gallery.innerHTML = "";
  emptyState.hidden = state.all.length > 0;

  const totalCount = state.all.length;
  mediaCountEl.textContent = totalCount === 0
    ? "Aucun média pour l'instant"
    : `${totalCount} média${totalCount > 1 ? "s" : ""} · ${items.length} affiché${items.length > 1 ? "s" : ""}`;

  for (const item of items) {
    const cell = document.createElement("div");
    cell.className = "thumb";
    cell.dataset.id = item.id;

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = objectUrlFor(item.id, item.thumbnail);
    img.alt = item.name || "";
    cell.appendChild(img);

    const flagWrap = document.createElement("div");
    flagWrap.className = "flag";
    if (item.favorite) flagWrap.innerHTML += "<span>★</span>";
    if (item.broll) flagWrap.innerHTML += "<span>🎞️</span>";
    if (flagWrap.innerHTML) cell.appendChild(flagWrap);

    if (item.type === "video") {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = `🎬 ${formatDuration(item.duration)}`;
      cell.appendChild(badge);
    }

    cell.addEventListener("click", () => openDetail(item.id));
    gallery.appendChild(cell);
  }
}

async function renderTagChips() {
  const top = await getTopTags(16);
  tagChipsWrap.innerHTML = "";
  tagChipsWrap.hidden = top.length === 0;
  for (const { tag } of top) {
    const chip = document.createElement("button");
    chip.className = "chip tag-chip" + (state.activeTags.has(tag) ? " active" : "");
    chip.textContent = "#" + tag;
    chip.addEventListener("click", () => {
      if (state.activeTags.has(tag)) state.activeTags.delete(tag);
      else state.activeTags.add(tag);
      renderTagChips();
      renderGallery();
    });
    tagChipsWrap.appendChild(chip);
  }
}

// ---------- Filtres / recherche ----------
filterChips.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filterChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  state.filter = btn.dataset.filter;
  renderGallery();
});

let searchDebounce = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.query = searchInput.value.trim();
    renderGallery();
  }, 150);
});

// ---------- Import ----------
const folderInput = el("folderInput");
const importMenu = el("importMenu");
const importFolderBtn = el("importFolderBtn");

// Un navigateur ne peut jamais accéder à "toute la galerie" sans que la personne choisisse
// des fichiers (sécurité du système). Le plus proche d'un "tout importer" en un geste :
// choisir un dossier entier (ex. Camera/DCIM) plutôt que des fichiers un par un — supporté
// surtout sur Android/desktop, pas sur le sélecteur Photos d'iPhone.
const supportsDirectoryPicker = "webkitdirectory" in document.createElement("input");
if (supportsDirectoryPicker) importFolderBtn.hidden = false;

function openImportMenu() {
  importMenu.hidden = false;
}
function closeImportMenu() {
  importMenu.hidden = true;
}

el("fabImport").addEventListener("click", () => {
  if (importMenu.hidden) openImportMenu();
  else closeImportMenu();
});
el("emptyImportBtn").addEventListener("click", openImportMenu);

document.addEventListener("click", (e) => {
  if (importMenu.hidden) return;
  if (importMenu.contains(e.target) || e.target === el("fabImport") || e.target === el("emptyImportBtn")) return;
  closeImportMenu();
});

el("importPickBtn").addEventListener("click", () => {
  closeImportMenu();
  fileInput.click();
});
importFolderBtn.addEventListener("click", () => {
  closeImportMenu();
  folderInput.click();
});

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = "";
  if (!files.length) return;
  await importFiles(files);
});

folderInput.addEventListener("change", async () => {
  const files = Array.from(folderInput.files || []).filter(
    (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
  );
  folderInput.value = "";
  if (!files.length) {
    toast("Aucune photo/vidéo trouvée dans ce dossier");
    return;
  }
  await importFiles(files);
});

async function importFiles(files) {
  importOverlay.hidden = false;
  importProgressBar.style.width = "0%";

  let classifierMod = null;
  if (state.aiEnabled) {
    try {
      classifierMod = await import("./classifier.js");
    } catch {
      classifierMod = null;
    }
  }

  let done = 0;
  for (const file of files) {
    done++;
    importStatus.textContent = `Import en cours… (${done}/${files.length})`;
    importSub.textContent = file.name;
    importProgressBar.style.width = `${Math.round((done / files.length) * 100)}%`;

    try {
      await importOneFile(file, classifierMod);
    } catch (err) {
      console.error("Échec d'import :", file.name, err);
      toast(`Impossible d'importer « ${file.name} »`);
    }
  }

  importOverlay.hidden = true;
  state.all = await getAllMedia();
  await renderTagChips();
  renderGallery();
  toast(`${done} média${done > 1 ? "s" : ""} importé${done > 1 ? "s" : ""}`);
}

async function importOneFile(file, classifierMod) {
  const type = isVideoFile(file) ? "video" : isImageFile(file) ? "photo" : null;
  if (!type) return;

  const processed = type === "photo" ? await processImage(file) : await processVideo(file);

  let autoTags = [];
  if (classifierMod) {
    try {
      autoTags = await classifierMod.suggestTags(processed.thumbCanvasEl);
    } catch {
      autoTags = [];
    }
  }

  const record = {
    id: uuid(),
    type,
    blob: file,
    thumbnail: processed.thumbnail,
    name: file.name,
    mimeType: file.type,
    width: processed.width,
    height: processed.height,
    orientation: processed.orientation,
    duration: processed.duration,
    sizeBytes: file.size,
    dominantColor: processed.dominantColor,
    createdAt: file.lastModified || Date.now(),
    addedAt: Date.now(),
    tags: [],
    autoTags,
    favorite: false,
    broll: false,
  };

  await addMedia(record);
}

// ---------- Détail / édition ----------
const detailModal = el("detailModal");
const detailPreview = el("detailPreview");
const detailMeta = el("detailMeta");
const presetChipsEl = el("presetChips");
const currentTagsEl = el("currentTags");
const suggestedTagsWrap = el("suggestedTagsWrap");
const suggestedTagsEl = el("suggestedTags");

function closeDetail() {
  detailModal.hidden = true;
  detailPreview.innerHTML = "";
  state.currentDetailId = null;
}
el("closeModal").addEventListener("click", closeDetail);
el("modalBackdrop").addEventListener("click", closeDetail);

async function openDetail(id) {
  const item = await getMedia(id);
  if (!item) return;
  state.currentDetailId = id;
  detailModal.hidden = false;

  detailPreview.innerHTML = "";
  const url = objectUrlFor(item.id + "-full", item.blob);
  if (item.type === "photo") {
    const img = document.createElement("img");
    img.src = url;
    detailPreview.appendChild(img);
  } else {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    detailPreview.appendChild(video);
  }

  const date = new Date(item.createdAt).toLocaleString("fr-FR");
  detailMeta.innerHTML = `
    ${item.name || "Sans nom"}<br />
    ${item.width}×${item.height} · ${item.orientation}${item.type === "video" ? " · " + formatDuration(item.duration) : ""} · ${formatBytes(item.sizeBytes)}<br />
    Ajouté le ${date}
  `;

  renderPresetChips(item);
  renderCurrentTags(item);
  renderSuggestedTags(item);

  el("toggleFavorite").classList.toggle("active-fav", !!item.favorite);
  el("toggleBroll").classList.toggle("active-broll", !!item.broll);
}

function renderPresetChips(item) {
  presetChipsEl.innerHTML = "";
  const current = new Set(item.tags || []);
  for (const preset of BROLL_PRESETS) {
    const key = preset.toLowerCase();
    const chip = document.createElement("button");
    chip.className = "chip tag-chip" + (current.has(key) ? " active" : "");
    chip.textContent = preset;
    chip.addEventListener("click", () => toggleTag(item.id, key));
    presetChipsEl.appendChild(chip);
  }
}

function renderCurrentTags(item) {
  currentTagsEl.innerHTML = "";
  const tags = item.tags || [];
  if (!tags.length) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "Aucun tag pour l'instant.";
    currentTagsEl.appendChild(span);
    return;
  }
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "chip tag-chip active removable";
    chip.innerHTML = `#${tag} <span class="x">✕</span>`;
    chip.addEventListener("click", () => toggleTag(item.id, tag));
    currentTagsEl.appendChild(chip);
  }
}

function renderSuggestedTags(item) {
  const current = new Set(item.tags || []);
  const suggestions = (item.autoTags || []).filter((t) => !current.has(t));
  suggestedTagsWrap.hidden = suggestions.length === 0;
  suggestedTagsEl.innerHTML = "";
  for (const tag of suggestions) {
    const chip = document.createElement("button");
    chip.className = "chip tag-chip";
    chip.textContent = "+ " + tag;
    chip.addEventListener("click", () => toggleTag(item.id, tag));
    suggestedTagsEl.appendChild(chip);
  }
}

async function toggleTag(id, tag) {
  const item = await getMedia(id);
  if (!item) return;
  const tags = new Set(item.tags || []);
  if (tags.has(tag)) tags.delete(tag);
  else tags.add(tag);
  item.tags = Array.from(tags);
  await updateMedia(item);
  if (tags.has(tag)) {
    const { bumpTags } = await import("./db.js");
    await bumpTags([tag]);
  }
  syncMediaInMemory(item);
  renderPresetChips(item);
  renderCurrentTags(item);
  renderSuggestedTags(item);
  renderTagChips();
}

el("addTagForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = el("addTagInput");
  const raw = input.value.trim();
  input.value = "";
  if (!raw || !state.currentDetailId) return;
  const tag = raw.toLowerCase();
  await toggleTag(state.currentDetailId, tag);
});

el("toggleFavorite").addEventListener("click", async () => {
  const item = await getMedia(state.currentDetailId);
  if (!item) return;
  item.favorite = !item.favorite;
  await updateMedia(item);
  syncMediaInMemory(item);
  el("toggleFavorite").classList.toggle("active-fav", item.favorite);
  renderGallery();
});

el("toggleBroll").addEventListener("click", async () => {
  const item = await getMedia(state.currentDetailId);
  if (!item) return;
  item.broll = !item.broll;
  await updateMedia(item);
  syncMediaInMemory(item);
  el("toggleBroll").classList.toggle("active-broll", item.broll);
  renderGallery();
});

el("deleteMedia").addEventListener("click", async () => {
  if (!state.currentDetailId) return;
  if (!confirm("Supprimer ce média de la galerie ? Cette action est irréversible.")) return;
  const deletedId = state.currentDetailId;
  await deleteMedia(deletedId);
  state.all = state.all.filter((m) => m.id !== deletedId);
  for (const key of [deletedId, deletedId + "-full"]) {
    const url = state.thumbUrls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      state.thumbUrls.delete(key);
    }
  }
  closeDetail();
  renderGallery();
  renderTagChips();
  toast("Média supprimé");
});

function syncMediaInMemory(updated) {
  const idx = state.all.findIndex((m) => m.id === updated.id);
  if (idx >= 0) state.all[idx] = updated;
}

// ---------- Réglages ----------
const settingsModal = el("settingsModal");
el("settingsBtn").addEventListener("click", async () => {
  settingsModal.hidden = false;
  await refreshStorageInfo();
});
el("closeSettings").addEventListener("click", () => (settingsModal.hidden = true));
el("settingsBackdrop").addEventListener("click", () => (settingsModal.hidden = true));

el("aiToggle").addEventListener("change", async (e) => {
  state.aiEnabled = e.target.checked;
  await setSetting("aiEnabled", state.aiEnabled);
  if (state.aiEnabled) toast("Les prochains imports auront des suggestions IA");
});

el("persistBtn").addEventListener("click", async () => {
  const granted = await requestPersistentStorage();
  toast(granted ? "Stockage protégé ✅" : "Le navigateur n'a pas accordé cette protection");
});

async function refreshStorageInfo() {
  const estimate = await estimateStorage();
  if (!estimate) {
    el("storageText").textContent = "Estimation indisponible sur ce navigateur.";
    return;
  }
  const usage = estimate.usage || 0;
  const quota = estimate.quota || 0;
  const pct = quota ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
  el("storageText").textContent = `${formatBytes(usage)} utilisés sur ${formatBytes(quota)} disponibles (${pct}%)`;
  el("storageBar").style.width = pct + "%";
}
