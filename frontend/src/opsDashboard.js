// Logika murni dashboard operasional Super Admin: rentang tanggal, skala sumbu, dan label.
// Tanggal dihitung dalam WIB karena backend mengelompokkan data per hari WIB.

const WIB_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
export const MAX_RANGE_DAYS = 366 * 5;

export const PRESETS = [
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: '90d', label: '90 hari' },
  { id: 'month', label: 'Bulan ini' },
  { id: 'year', label: 'Tahun ini' }
];

export const SERIES = [
  { key: 'registered', label: 'Pemeriksaan terdaftar', color: 'var(--viz-series-1)' },
  { key: 'analyzed', label: 'Analisis selesai', color: 'var(--viz-series-2)' },
  { key: 'released', label: 'Laporan dirilis', color: 'var(--viz-series-3)' }
];

export const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'REGISTERED', label: 'Terdaftar' },
  { value: 'IN_PROGRESS', label: 'Sedang diperiksa' },
  { value: 'PENDING_REVIEW', label: 'Menunggu tinjauan dokter' },
  { value: 'RETURNED_FOR_CORRECTION', label: 'Dikembalikan untuk koreksi' },
  { value: 'APPROVED', label: 'Disetujui dokter' },
  { value: 'RELEASED', label: 'Laporan dirilis' },
  { value: 'CANCELLED', label: 'Dibatalkan' }
];

export function todayWib(now = Date.now()) {
  return new Date(now + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function presetRange(preset, today = todayWib()) {
  switch (preset) {
    case '7d': return { start: addDays(today, -6), end: today };
    case '30d': return { start: addDays(today, -29), end: today };
    case '90d': return { start: addDays(today, -89), end: today };
    case 'month': return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'year': return { start: `${today.slice(0, 4)}-01-01`, end: today };
    default: throw new Error(`Preset tidak dikenal: ${preset}`);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Mengembalikan pesan kesalahan, atau string kosong jika rentang valid.
export function validateRange(start, end) {
  if (!ISO_DATE.test(start || '') || !ISO_DATE.test(end || '')) return 'Isi tanggal awal dan akhir.';
  if (Number.isNaN(Date.parse(`${start}T00:00:00Z`)) || Number.isNaN(Date.parse(`${end}T00:00:00Z`))) return 'Tanggal tidak valid.';
  if (end < start) return 'Tanggal akhir tidak boleh sebelum tanggal awal.';
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) return 'Rentang tanggal maksimal 5 tahun.';
  return '';
}

// Batas atas sumbu Y yang bulat (1, 2, 5 x 10^n) dan tidak pernah nol.
export function niceMax(value) {
  if (!(value > 0)) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value);
  const result = step * magnitude;
  return result < 4 && Number.isInteger(value) ? 4 : result;
}

export function yTicks(max, count = 4) {
  const top = niceMax(max);
  return Array.from({ length: count + 1 }, (_, i) => Number(((top / count) * i).toFixed(2)));
}

// Indeks label sumbu X yang ditampilkan agar tidak bertumpuk; titik terakhir selalu ikut.
export function xLabelIndexes(length, maxLabels = 6) {
  if (length <= 0) return [];
  if (length <= maxLabels) return Array.from({ length }, (_, i) => i);
  const step = Math.ceil((length - 1) / (maxLabels - 1));
  const indexes = [];
  for (let i = 0; i < length - 1; i += step) indexes.push(i);
  if (length - 1 - indexes[indexes.length - 1] < step / 2) indexes.pop();
  indexes.push(length - 1);
  return indexes;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatBucket(bucket, granularity) {
  const [year, month, day] = bucket.split('-');
  const name = MONTHS[Number(month) - 1];
  return granularity === 'month' ? `${name} ${year}` : `${Number(day)} ${name}`;
}

export function formatNumber(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
}

export function exportFileName(start, end, format) {
  return `laporan-casa-ai_${start}_${end}.${format}`;
}

export function hasAnyActivity(data) {
  if (!data) return false;
  const { registered, analyzed, released } = data.summary;
  return registered + analyzed + released + data.security.audit_events > 0;
}
