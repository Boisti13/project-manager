// Label helpers. No React in here.

export function buildLabelIndex(labels = []) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  return {
    list: labels,
    byId,
    /** The task's labels, sorted by name (unknown ids skipped). */
    of: (task) =>
      (task.label_ids || [])
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    nameOf: (id) => byId.get(id)?.name || '',
  };
}

/** Black or white text, whichever reads better on `hex`. */
export function labelTextColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.4 ? '#1a1a1a' : '#fff';
}
