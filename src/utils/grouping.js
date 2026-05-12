/**
 * grouping.js — shared helpers for the ATS list pages' Group By feature.
 *
 * 2026-05-12 ATS audit Q2 (= A: collapsible group headers stacked).
 * Pages call groupRecords(records, getKeys) which returns an ordered
 * Map<groupLabel, records[]>. Pages then iterate the map to render
 * one section per group with a collapsible header.
 *
 * getKeys returns an array of {key, label} pairs — usually one per
 * record, but for multi-value group-bys (Q4 = B, Candidates by Skill)
 * a record can return multiple keys and will appear in each group's
 * record list (intentional duplication; surfaces "give me everyone
 * with React" cleanly even when those candidates also have Node).
 */

const UNKNOWN_GROUP = { key: '__unknown__', label: 'Unknown' };

/**
 * Group an array of records into an ordered Map.
 *
 * @param {Array} records
 * @param {(record) => Array<{key: string, label: string}>} getKeys
 *   Per-record extractor. Return [] to drop the record from grouped
 *   view entirely (use carefully); return [{key: '__unknown__', label:
 *   'Unknown'}] (or just an empty key) to bucket missing values.
 * @returns {Map<string, { label: string, records: Array }>}
 */
export function groupRecords(records, getKeys) {
  const groups = new Map();
  if (!Array.isArray(records)) return groups;
  for (const r of records) {
    let keys;
    try { keys = getKeys(r); } catch (_) { keys = []; }
    if (!Array.isArray(keys) || keys.length === 0) {
      keys = [UNKNOWN_GROUP];
    }
    for (const { key, label } of keys) {
      const k = key == null || key === '' ? UNKNOWN_GROUP.key : String(key);
      const l = label || (k === UNKNOWN_GROUP.key ? UNKNOWN_GROUP.label : k);
      if (!groups.has(k)) groups.set(k, { label: l, records: [] });
      groups.get(k).records.push(r);
    }
  }
  return groups;
}

/**
 * Sort the grouped Map by count desc (largest groups first), with
 * Unknown always at the bottom. Returns an array of [key, value] pairs
 * that the page iterates for render.
 */
export function sortGroupsByCount(groups) {
  return [...groups.entries()].sort(([keyA, a], [keyB, b]) => {
    if (keyA === UNKNOWN_GROUP.key) return 1;
    if (keyB === UNKNOWN_GROUP.key) return -1;
    return b.records.length - a.records.length;
  });
}

/** Sort the grouped Map alphabetically by label, Unknown last. */
export function sortGroupsByLabel(groups) {
  return [...groups.entries()].sort(([keyA, a], [keyB, b]) => {
    if (keyA === UNKNOWN_GROUP.key) return 1;
    if (keyB === UNKNOWN_GROUP.key) return -1;
    return a.label.localeCompare(b.label);
  });
}
