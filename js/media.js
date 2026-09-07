// media.js — lecture des fichiers importés : miniatures, métadonnées, couleur dominante.

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function isVideoFile(file) {
  return file.type.startsWith("video/");
}

export function isImageFile(file) {
  return file.type.startsWith("image/");
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.82) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function drawContainCanvas(source, sw, sh, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function orientationOf(w, h) {
  if (w === h) return "square";
  return w > h ? "landscape" : "portrait";
}

export async function processImage(file, { maxThumb = 480 } = {}) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let width, height, thumbCanvas;
  if (bitmap) {
    width = bitmap.width;
    height = bitmap.height;
    thumbCanvas = drawContainCanvas(bitmap, width, height, maxThumb);
    bitmap.close && bitmap.close();
  } else {
    // Fallback via <img> (Safari plus ancien).
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    width = img.naturalWidth;
    height = img.naturalHeight;
    thumbCanvas = drawContainCanvas(img, width, height, maxThumb);
    URL.revokeObjectURL(url);
  }
  const thumbnail = await canvasToBlob(thumbCanvas, "image/jpeg", 0.82);
  const dominantColor = sampleDominantColor(thumbCanvas);
  return {
    width,
    height,
    orientation: orientationOf(width, height),
    thumbnail,
    thumbCanvasEl: thumbCanvas,
    duration: null,
    dominantColor,
  };
}

export async function processVideo(file, { maxThumb = 480, seekTo = 0.15 } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  const duration = video.duration || 0;
  const width = video.videoWidth;
  const height = video.videoHeight;

  await new Promise((resolve) => {
    const target = Math.min(duration * seekTo, Math.max(duration - 0.1, 0));
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    try {
      video.currentTime = isFinite(target) && target > 0 ? target : 0;
    } catch {
      resolve();
    }
  });

  const thumbCanvas = drawContainCanvas(video, width, height, maxThumb);
  const thumbnail = await canvasToBlob(thumbCanvas, "image/jpeg", 0.82);
  const dominantColor = sampleDominantColor(thumbCanvas);

  URL.revokeObjectURL(url);

  return {
    width,
    height,
    orientation: orientationOf(width, height),
    thumbnail,
    thumbCanvasEl: thumbCanvas,
    duration,
    dominantColor,
  };
}

// Couleur dominante approximative : moyenne des pixels d'une miniature réduite.
function sampleDominantColor(canvas) {
  try {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const step = Math.max(1, Math.floor(Math.min(w, h) / 24));
    const data = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
    if (!n) return null;
    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

export function formatBytes(bytes) {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}
