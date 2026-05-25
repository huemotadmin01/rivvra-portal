// ─────────────────────────────────────────────────────────────────────────────
// fileIcon — single source of truth for "what icon do I show for this file?"
//
// The Documents app previously rendered everything as a generic FileText page
// icon (DocumentsList knew about image/zip; DocumentDetail knew nothing). Pull
// the mapping out here so both pages — plus any future surface — get the same
// MIME-aware iconography for free. Add new MIME branches at the bottom.
// 2026-05-25 health-check F-P2 (Documents).
// ─────────────────────────────────────────────────────────────────────────────
import {
  FileText, Image as ImageIcon, FileArchive, FileSpreadsheet,
  FileVideo, FileAudio, FileCode, Presentation, FileType,
} from 'lucide-react';

/**
 * Resolve a lucide icon component for a given MIME type. Always returns a
 * component (FileText as the catch-all) so callers can `<Icon …/>` without
 * a null check.
 */
export function fileIconFor(mime) {
  if (!mime) return FileText;
  const m = String(mime).toLowerCase();
  if (m.startsWith('image/')) return ImageIcon;
  if (m.startsWith('video/')) return FileVideo;
  if (m.startsWith('audio/')) return FileAudio;
  if (m === 'application/pdf') return FileType;
  if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar') || m.includes('gzip')) return FileArchive;
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return FileSpreadsheet;
  if (m.includes('word') || m.includes('document') || m === 'application/rtf') return FileText;
  if (m.includes('presentation') || m.includes('powerpoint')) return Presentation;
  if (m.includes('javascript') || m.includes('json') || m.includes('html') || m.includes('xml') || m.startsWith('text/x-')) return FileCode;
  return FileText;
}

/**
 * Resolve a short colour-coded accent class so PDFs read red, sheets read
 * green, etc. Returns a Tailwind text-color class (e.g. "text-rose-400").
 * Falls back to muted dark-400 for generic files.
 */
export function fileIconColorFor(mime) {
  if (!mime) return 'text-dark-400';
  const m = String(mime).toLowerCase();
  if (m === 'application/pdf') return 'text-rose-400';
  if (m.startsWith('image/')) return 'text-violet-400';
  if (m.startsWith('video/')) return 'text-fuchsia-400';
  if (m.startsWith('audio/')) return 'text-cyan-400';
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'text-emerald-400';
  if (m.includes('word') || m.includes('document')) return 'text-sky-400';
  if (m.includes('presentation') || m.includes('powerpoint')) return 'text-amber-400';
  if (m.includes('zip') || m.includes('rar') || m.includes('tar') || m.includes('gzip')) return 'text-orange-400';
  if (m.includes('javascript') || m.includes('json') || m.includes('html') || m.includes('xml')) return 'text-lime-400';
  return 'text-dark-400';
}

/**
 * Short human label for grouping/badging ("PDF", "Image", "Spreadsheet"…).
 * Mirrors the categories above so the grid grouping and the chip stay in sync.
 */
export function fileTypeLabelFor(mime) {
  if (!mime) return 'File';
  const m = String(mime).toLowerCase();
  if (m === 'application/pdf') return 'PDF';
  if (m.startsWith('image/')) return 'Image';
  if (m.startsWith('video/')) return 'Video';
  if (m.startsWith('audio/')) return 'Audio';
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'Spreadsheet';
  if (m.includes('word') || m.includes('document')) return 'Word doc';
  if (m.includes('presentation') || m.includes('powerpoint')) return 'Slides';
  if (m.includes('zip') || m.includes('rar') || m.includes('tar') || m.includes('gzip')) return 'Archive';
  if (m.includes('javascript') || m.includes('json') || m.includes('html') || m.includes('xml')) return 'Code';
  return 'File';
}
