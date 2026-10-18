// Rekomendasi pada laporan pasien ditulis sebagai daftar bernomor, satu saran per baris
export function numberedList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}
