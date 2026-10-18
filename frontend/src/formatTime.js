// Waktu dari server disimpan dalam UTC. SQLite (datetime('now')) tidak menyertakan zona, jadi
// teks tanpa zona dianggap UTC dan ditampilkan dalam WIB agar cocok dengan jam di sekitar pengguna.
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export function formatWib(value) {
  if (!value) return '—';
  const text = String(value).trim().replace(' ', 'T');
  const date = new Date(HAS_ZONE.test(text) ? text : `${text}Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  const formatted = date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  return `${formatted} WIB`;
}
