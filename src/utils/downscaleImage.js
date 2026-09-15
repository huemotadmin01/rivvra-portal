/**
 * Downscale a user-picked image before upload (2026-09-15).
 *
 * Profile photos are stored inline on the user document, which auth reads on
 * every request — one rep's 1.6 MB photo made every one of her requests take
 * ~17s. The server now caps uploads at 500 KB and keeps the blob off the
 * request path; this trims the file in the browser so a phone photo still
 * works instead of bouncing off that cap.
 *
 * Returns a JPEG File no larger than `maxBytes`, or the original file when it
 * is already small enough or cannot be decoded (the server cap still applies).
 */
const MAX_EDGE = 512;
const MAX_BYTES = 400 * 1024; // under the server's 500 KB, leaving headroom

export async function downscaleImage(file, { maxEdge = MAX_EDGE, maxBytes = MAX_BYTES } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;
  // GIFs may be animated — re-encoding would drop the animation; let the
  // server cap decide instead of silently flattening them.
  if (file.type === 'image/gif') return file;
  if (file.size <= maxBytes) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // undecodable here; server will reject if too big
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close?.(); return file; }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // Step the JPEG quality down until it fits.
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) break;
    if (blob.size <= maxBytes) {
      const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], name, { type: 'image/jpeg' });
    }
  }
  return file;
}

export default downscaleImage;
