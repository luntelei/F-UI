/** Next CF daily reset = UTC midnight = Beijing 08:00 */
export function getNextResetUtc() {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  };
}

export function formatNumber(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString();
}

export function usagePercent(used, quota) {
  const u = Number(used);
  const q = Number(quota);
  if (!q || q <= 0 || Number.isNaN(u)) return 0;
  return Math.min(100, (u / q) * 100);
}

/** @param {number} percent */
export function formatUsagePercent(percent) {
  const p = Number(percent);
  if (Number.isNaN(p) || p <= 0) return '0%';
  if (p < 1) return '<1%';
  if (p >= 100) return '100%';
  return `${p.toFixed(1)}%`;
}

/** Semi-circle arc length for gauge SVG (r=48). */
export const GAUGE_ARC_LEN = Math.PI * 48;
