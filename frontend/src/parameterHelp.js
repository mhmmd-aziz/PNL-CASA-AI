export const PARAMETER_HELP = {
  confidence: {
    title: 'Confidence Threshold',
    purpose: 'Batas skor keyakinan model agar sebuah objek diterima sebagai deteksi. Ini bukan persentase akurasi hasil.',
    how: 'Isi angka lebih dari 0 sampai 1. Nilai lebih tinggi menyaring lebih banyak deteksi, tetapi dapat melewatkan sel. Nilai lebih rendah menerima lebih banyak objek, termasuk kemungkinan deteksi keliru.',
    example: '0,25 menerima deteksi dengan skor minimal 0,25. Bandingkan kotak deteksi dengan citra asli saat menyesuaikan nilai ini. Berlaku untuk analisis ini, tidak disimpan dalam profil kalibrasi.',
  },
  chamber_type: {
    title: 'Tipe Bilik Hitung',
    purpose: 'Menentukan preset kedalaman untuk menghitung volume bidang pandang dan estimasi konsentrasi.',
    how: 'Pilih sesuai bilik yang benar-benar dipakai. Cocokkan kedalaman dengan spesifikasi produk; gunakan Custom bila berbeda dari preset aplikasi.',
    example: 'Preset aplikasi: Makler 10 µm, Leja 20 µm, Improved Neubauer 100 µm. Mengubah kedalaman preset akan mengalihkan tipe menjadi Custom.',
  },
  chamber_depth: {
    title: 'Kedalaman Bilik (µm)',
    purpose: 'Menentukan ketebalan sampel dalam perhitungan volume. Volume lebih besar menghasilkan estimasi konsentrasi lebih rendah untuk hitungan sel yang sama.',
    how: 'Masukkan kedalaman aktual sesuai spesifikasi bilik, dalam mikrometer (µm), lebih dari 0. Ini bukan pembesaran objektif.',
    example: 'Jika kedalaman berubah dari 10 menjadi 20 µm, konsentrasi menjadi setengahnya bila hitungan, resolusi, skala, dan pengenceran tetap.',
  },
  pixel_scale: {
    title: 'Skala Piksel (µm/px)',
    purpose: 'Mengubah jarak piksel menjadi mikrometer untuk menghitung kecepatan, jarak, dan luas bidang pandang.',
    how: 'Ukur mikrometer pada optik dan resolusi rekaman yang sama. Bagi panjang sebenarnya dalam µm dengan jumlah piksel yang mewakili panjang itu. Ukur ulang bila konfigurasi optik atau ukuran gambar berubah.',
    example: 'Contoh hitung: garis 100 µm menempati 125 piksel → 100 ÷ 125 = 0,8 µm/px. Angka awal 0,8 bukan hasil pengukuran perangkat Anda.',
  },
  fps_mode: {
    title: 'Sumber FPS',
    purpose: 'Menentukan waktu antarframe untuk menghitung kecepatan gerak dan FPS video hasil.',
    how: 'Otomatis membaca FPS dari metadata video. Pilih Manual hanya bila Anda mengetahui FPS rekaman aktual yang harus digunakan, misalnya metadata slow-motion berbeda dari laju perekaman.',
    example: 'Jika metadata video menunjukkan 49 FPS, mode otomatis memakai 49, meskipun nilai cadangan FPS manual adalah 30. FPS tidak digunakan untuk citra tunggal.',
  },
  fps: {
    title: 'FPS Manual',
    purpose: 'Mengganti FPS metadata saat mode Manual dipilih. FPS lebih tinggi menghasilkan durasi lebih pendek dan kecepatan lebih tinggi untuk lintasan yang sama.',
    how: 'Isi jumlah frame per detik saat perekaman, lebih dari 0. Nilai ini diabaikan pada mode Otomatis. Lihat FPS yang benar-benar digunakan pada ringkasan hasil.',
    example: 'Mengubah 30 menjadi 60 FPS menggandakan kecepatan yang dihitung, tanpa mengubah jumlah sel atau konsentrasi.',
  },
  dilution_factor: {
    title: 'Faktor Pengenceran',
    purpose: 'Mengoreksi estimasi konsentrasi agar mewakili sampel sebelum pengenceran.',
    how: 'Isi volume total campuran dibagi volume sampel asli. Gunakan 1 bila tidak diencerkan; nilai minimal 1.',
    example: '1 bagian sampel + 4 bagian pengencer = 5 bagian total → faktor 5. Faktor ini tidak mengubah kecepatan atau persentase motilitas.',
  },
  prog_speed_threshold: {
    title: 'Ambang Progresif VCL (µm/s)',
    purpose: 'Batas minimum kecepatan sepanjang lintasan untuk kategori progresif (PR). Sel juga harus memenuhi ambang LIN.',
    how: 'Masukkan ambang dari protokol analisis yang sedang diuji, lebih dari 0. Menaikkan ambang membuat syarat PR lebih ketat; tidak mengubah kecepatan yang terukur.',
    example: 'Dengan VCL 25 dan LIN 0,8, sel dengan VCL 30 µm/s tetapi LIN 0,5 belum memenuhi kategori PR. Nilai awal bukan pengesahan standar klinis.',
  },
  prog_linearity_threshold: {
    title: 'Ambang Kelurusan LIN (0–1)',
    purpose: 'Menentukan kelurusan minimum lintasan untuk kategori progresif. LIN = perpindahan awal–akhir ÷ panjang lintasan.',
    how: 'Isi rasio 0 sampai 1, bukan persen. Nilai mendekati 1 mensyaratkan lintasan lebih lurus. Ambang VCL tetap harus terpenuhi.',
    example: '0,8 berarti 80%. LIN pada hasil adalah rata-rata rasio tiap lintasan, sehingga tidak selalu sama dengan rata-rata VSL dibagi rata-rata VCL.',
  },
  immotile_speed_threshold: {
    title: 'Ambang Immotil VCL (µm/s)',
    purpose: 'Sel dengan VCL di bawah ambang ini masuk kategori immotil (IM). Sel lainnya yang tidak memenuhi PR masuk non-progresif (NP).',
    how: 'Isi angka mulai 0 dan tidak melebihi ambang progresif VCL. Aturan memakai tanda kurang dari (<), bukan kurang dari atau sama dengan.',
    example: 'Dengan ambang 5 µm/s, VCL 4,9 masuk IM; VCL tepat 5 tidak masuk IM. Ambang 0 berarti tidak ada kecepatan non-negatif yang masuk IM melalui aturan ini.',
  },
  save: {
    title: 'Simpan Konfigurasi ke Server',
    purpose: 'Menyimpan profil kalibrasi agar dapat dimuat kembali setelah halaman atau backend dimulai ulang.',
    how: 'Periksa semua parameter lalu klik Simpan. Perubahan yang belum disimpan tetap dipakai bila analisis dijalankan dari formulir ini. Profil tidak mengubah hasil analisis lama.',
    example: 'Yang disimpan adalah parameter aplikasi. Tombol ini tidak mengirim pengaturan ke mikroskop atau kamera. Confidence diatur terpisah untuk setiap analisis.',
  },
  reset: {
    title: 'Reset Default',
    purpose: 'Mengembalikan formulir ke nilai awal contoh aplikasi.',
    how: 'Klik Reset untuk mengubah formulir, lalu periksa kembali skala dan bilik. Klik Simpan hanya bila nilai tersebut memang ingin dijadikan profil tersimpan.',
    example: 'Reset tidak mengukur mikroskop secara otomatis dan tidak langsung menimpa profil server.',
  },
  analyze: {
    title: 'Jalankan Analisis AI',
    purpose: 'Mendeteksi sel pada media yang diunggah. Video juga digunakan untuk melacak lintasan dan menghitung motilitas.',
    how: 'Unggah media, periksa kalibrasi dan confidence, lalu jalankan. Hasil merekam parameter yang benar-benar digunakan. Jalankan ulang bila ingin memakai pengaturan berbeda.',
    example: 'Citra tunggal hanya mendukung hitungan dan konsentrasi. Motilitas memakai segmen kontinu terpanjang per ID dengan minimal 15 pengamatan. Hitungan deteksi dan jumlah lintasan yang dinilai ditampilkan terpisah.',
  },
  unavailable: {
    title: 'Mengapa ada metrik belum tersedia?',
    purpose: 'Membedakan angka yang benar-benar diukur dari parameter yang belum dihitung atau tidak dapat diukur pada media ini.',
    how: 'VCL, VSL, LIN, serta estimasi VAP/STR/WOB dihitung dari lintasan video yang cukup. Hasil lama perlu dianalisis ulang untuk memperoleh metrik baru. ALH dan BCF belum dihitung.',
    example: 'Citra tunggal atau video tanpa lintasan valid tidak dapat dinilai motilitasnya. STR = VSL/VAP dan WOB = VAP/VCL; jika pembaginya nol, rasionya tidak tersedia. Nilai tidak tersedia tidak diganti angka nol.',
  },
  motion_method: {
    title: 'VAP, STR, WOB dan dasar perhitungannya',
    purpose: 'VAP memperkirakan kecepatan pada lintasan yang diperhalus. STR membandingkan VSL dengan VAP; WOB membandingkan VAP dengan VCL.',
    how: 'Aplikasi meratakan posisi interior dengan posisi tetangga berbobot waktu sebanyak dua kali. Titik awal dan akhir tetap. Panjang lintasan hasil penghalusan dibagi durasi menghasilkan estimasi VAP. Ini metode eksperimental, bukan pengesahan klinis.',
    example: 'STR dan WOB ditampilkan dalam persen, dirata-rata per lintasan yang pembaginya tidak nol. Klasifikasi PR/NP/IM tetap memakai VCL dan LIN. Nilai VAP dipengaruhi metode penghalusan; hasil dari perangkat lain tidak otomatis sebanding.',
  },
};

export function analysisSummary(data) {
  if (data?.summary?.motility_available === false) return 'Motilitas tidak dapat dinilai dari media ini';
  const progressive = data?.summary?.progressive_percent;
  if (!Number.isFinite(progressive)) return 'Hasil motilitas belum tersedia';
  return `Motilitas progresif (PR) terukur: ${progressive.toFixed(1)}%`;
}

export function motionUnavailableReason(data) {
  if (data?.summary?.is_image) return 'Citra tunggal tidak merekam perpindahan antarframe. Gunakan video untuk menilai motilitas.';
  if (data?.summary?.motility_available === false) return 'Belum ada segmen lintasan kontinu yang lolos minimum 15 titik pengamatan. Periksa durasi, fokus, deteksi sel, dan kestabilan rekaman.';
  if (!Number.isFinite(data?.motion?.average_path_speed)) return 'VAP/STR/WOB belum tercatat pada hasil ini. Jalankan analisis ulang dengan versi terbaru. ALH dan BCF belum dihitung.';
  return 'VAP/STR/WOB adalah estimasi dari lintasan yang diperhalus. STR/WOB tidak tersedia jika pembaginya nol. ALH dan BCF belum dihitung.';
}

export function trackingSummary(data) {
  const summary = data?.summary;
  if (summary?.count_method === 'single_image_detections') return `${summary.total_sperm} deteksi pada citra tunggal; motilitas tidak dinilai.`;
  if (summary?.count_method !== 'median_detections_per_frame') return '';
  return `Median ${summary.total_sperm} deteksi per frame untuk konsentrasi. Persentase PR/NP/IM dihitung dari ${summary.motility_denominator} ID lintasan valid, bukan dari median deteksi.`;
}
