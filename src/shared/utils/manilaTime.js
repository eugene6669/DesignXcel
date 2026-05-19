/**
 * Manila (Asia/Manila, GMT+8) in 12-hour clock.
 * Plain `YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DDTHH:mm:ss` from SQL (no timezone) = **Manila wall time**, not browser local.
 */

const MANILA_TZ = 'Asia/Manila';
const MANILA_ISO_OFFSET = '+08:00';

/** True if string ends with Z or ±HH:MM offset (absolute instant). */
function hasExplicitTimeZone(str) {
  const t = String(str).trim();
  return /[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t) || /[+-]\d{4}$/.test(t);
}

/**
 * Parse API / DB values into a Date.
 * - Plain datetime without zone → Manila wall clock (+08:00).
 * - ISO with Z or offset → standard parse.
 * - Unix seconds / ms (number or numeric string).
 */
function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const inst = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(inst.getTime()) ? null : inst;
  }

  const s = String(value).trim();
  if (!s) return null;

  if (/^\d{10}$/.test(s)) {
    const inst = new Date(parseInt(s, 10) * 1000);
    return Number.isNaN(inst.getTime()) ? null : inst;
  }
  if (/^\d{13}$/.test(s)) {
    const inst = new Date(parseInt(s, 10));
    return Number.isNaN(inst.getTime()) ? null : inst;
  }

  let normalized = s.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2');

  if (!hasExplicitTimeZone(normalized)) {
    const m = normalized.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
    );
    if (m) {
      const [, y, mo, da, h, mi, sec, frac] = m;
      let iso = `${y}-${mo}-${da}T${h}:${mi}:${sec || '00'}`;
      if (frac != null && frac !== '') {
        iso += `.${String(frac).padEnd(3, '0').slice(0, 3)}`;
      }
      iso += MANILA_ISO_OFFSET;
      const inst = new Date(iso);
      return Number.isNaN(inst.getTime()) ? null : inst;
    }
  }

  const inst = new Date(normalized);
  return Number.isNaN(inst.getTime()) ? null : inst;
}

function formatManila12h(value) {
  const inst = toDate(value);
  if (!inst) return '';
  const out = new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(inst);
  return out.replace(/\bAM\b/g, 'am').replace(/\bPM\b/g, 'pm');
}

/** Chat / compact: Manila date + 12h time (no extra suffix). */
export function formatManilaTimeShort(value) {
  try {
    return formatManila12h(value);
  } catch {
    return '';
  }
}

/** Notifications / audit: same as {@link formatManilaTimeShort} plus explicit GMT+8 label. */
export function formatManilaDateTimeShort(value) {
  const core = formatManila12h(value);
  return core ? `${core} (GMT+8)` : '';
}
