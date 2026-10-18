# Laporan Pengujian CASA-AI — 18 Oktober 2026

Pengujian fitur utama dalam tiga skenario sesuai ketentuan lomba: **positif**, **negatif**, dan **edge case**. Kode uji: [tests/test_scenarios.py](tests/test_scenarios.py).

## Lingkup dan metode

Alur yang diuji dari ujung ke ujung lewat API asli (FastAPI `TestClient`):

**Login → Registrasi (Front Office) → Terima sampel & data makroskopis (Analis) → Analisis video → Kirim ke dokter → Setujui & tanda tangan (Dokter) → Rilis laporan → Pasien melihat laporannya.**

- Setiap tes memakai database SQLite sementara yang dibuat dari **skema** database aktif. Isi baris tidak disalin, jadi tidak ada data pasien yang dipakai.
- Kalibrasi, folder upload/output, dan penyimpanan koreksi juga dibuat sementara. Data aplikasi asli tidak diubah.
- Inferensi model YOLO/RT-DETR diganti stub. Tes ini memeriksa **alur dan aturan aplikasi**, bukan akurasi model. Uji model nyata ada di `tests/smoke_inference.py` (lihat [QC.md](QC.md)).
- Pengujian ini memeriksa perilaku perangkat lunak dan **bukan validasi klinis**.

## Hasil ringkas

| Pemeriksaan | Perintah | Hasil |
| --- | --- | --- |
| Seluruh tes Python (termasuk 42 tes skenario) | `python -m unittest discover -s tests -p "test_*.py"` | **157 tes OK** (2 di antaranya *expected failure*, lihat Temuan) |
| Tes unit frontend | `cd frontend && node --test src/*.test.js` | **46 lulus**, 0 gagal |
| Lint frontend | `cd frontend && npm run lint` | Lulus (exit 0) |

## a. Skenario Positif — alur normal

| ID | Fitur | Yang diuji | Hasil |
| --- | --- | --- | --- |
| P1 | Autentikasi | Login berhasil, `/me` sesuai, logout mencabut sesi, token mentah tidak tersimpan di DB | ✅ |
| P2 | Alur lengkap | Status `REGISTERED → IN_PROGRESS → PENDING_REVIEW → APPROVED → RELEASED`; hasil analisis, snapshot kalibrasi, dan media (video sumber, video anotasi, heatmap) tersimpan; pasien melihat laporannya; log audit dan review event tercatat | ✅ |
| P3 | Dikembalikan dokter | Dokter mengembalikan sampel beserta alasan, analis menganalisis ulang dan mengirim lagi, lalu disetujui. Kedua hasil analisis tetap tersimpan | ✅ |
| P4 | Kalibrasi | Super Admin menyimpan profil, dan analisis berikutnya memakai nilai tersebut (tercatat di snapshot) | ✅ |
| P5 | Pasien lama | Registrasi ulang lewat nomor rekam medis tanpa membuat akun portal baru | ✅ |
| P6 | Kartu jadwal | API registrasi dan daftar pemeriksaan mengirim waktu mulai pantang dan waktu siap diperiksa | ✅ |
| P7 | Hapus pasien | Front Office menghapus pasien yang salah didaftarkan; jadwal, akun portal, dan sesinya ikut terhapus, antrean pasien lain dirapikan, dan tercatat di log audit | ✅ |
| P8 | Jenis kelamin | Jenis kelamin diisi otomatis sebagai laki-laki; nilai lain yang dikirim klien diabaikan | ✅ |

## b. Skenario Negatif — kesalahan input atau gangguan sistem

| ID | Kondisi | Perilaku yang diharapkan | Hasil |
| --- | --- | --- | --- |
| N1 | Password salah / email tidak terdaftar | 401 dengan pesan yang sama (tidak membocorkan akun), tercatat `LOGIN_FAILED` | ✅ |
| N2 | Tanpa token, token palsu, format header salah | 401 | ✅ |
| N3 | Peran melampaui hak (analis menyetujui, FO menerima sampel, dokter registrasi, Super Admin menandatangani, analis mengubah kalibrasi, FO membuka log audit) | 403, status pemeriksaan tidak berubah | ✅ |
| N4 | Registrasi tidak valid (nama kosong, email salah, jadwal lewat, jam bukan kelipatan 15 menit, tanggal lahir di masa depan, RM tidak ada, data pantang tidak lengkap) | 422/404, tidak ada data tersimpan | ✅ |
| N5 | Data makroskopis atau kalibrasi tidak valid (volume ≤ 0, pH 15, viskositas tidak dikenal, skala piksel 0, pengenceran < 1, LIN > 1) | 422, data dan profil sebelumnya tetap | ✅ |
| N6 | Urutan alur dilompati (analisis sebelum diterima, analisis sebelum makroskopis, kirim tanpa analisis, setujui sebelum dikirim) | 409 | ✅ |
| N7 | Persetujuan tanpa centang tanda tangan, tanda tangan bukan PNG, interpretasi terlalu pendek, dokter tanpa SIP | 422/409, laporan tidak dibuat | ✅ |
| N8 | Pipeline analisis gagal (video tidak dapat didekode) | Tugas berstatus gagal dengan pesan jelas, **tidak ada hasil palsu** tersimpan, dan sampel tidak bisa dikirim ke dokter | ✅ |
| N9 | Bobot model tidak ada / file kalibrasi rusak | 503 / 500 dengan pesan eksplisit, tidak ada hasil tersimpan | ✅ |
| N10 | Parameter analisis tidak valid (`conf_thres` 0 atau 1,5, skala negatif, FPS NaN, tipe bilik tidak dikenal) | 422 | ✅ |
| N11 | Hapus pasien yang sampelnya sudah diterima lab, dihapus oleh analis atau Super Admin, atau ID tidak ada | 409 / 403 / 404, data pasien dan pemeriksaan tetap utuh | ✅ |

## c. Skenario Edge Case — kondisi jarang atau tidak terduga

| ID | Kondisi | Perilaku yang diharapkan | Hasil |
| --- | --- | --- | --- |
| E1 | Nilai batas makroskopis: pH 0/14/14,01; volume 0,01/20/20,01; likuefaksi 0/180/181 | Batas diterima, nilai di luar batas ditolak | ✅ |
| E2 | Lama pantang 47/48/168/169 jam | Hanya 48–168 jam yang diterima | ✅ |
| E3 | Sampel diterima sebelum masa pantang selesai | 409, status tetap `REGISTERED` | ✅ |
| E4 | Slot jadwal penuh (kapasitas 4) | Pendaftar ke-5 ditolak 409 | ✅ |
| E5 | Pasien dijadwalkan dua kali pada hari yang sama | 409 `SAME_DAY_EXAM`; pemaksaan wajib disertai alasan ≥ 10 karakter dan tercatat di audit | ✅ |
| E6 | Pasien baru kembar (nama + tanggal lahir sama) / email sudah dipakai | 409 | ✅ |
| E7 | Analis kedua mencoba mengambil atau mengubah sampel milik analis lain | 409 untuk terima, makroskopis, analisis, dan kirim | ✅ |
| E8 | Analis lain melihat progres tugas / ID tugas tidak ada | 404 | ✅ |
| E9 | Mengubah laporan yang sudah dirilis (rilis ulang, setujui ulang, kembalikan, ubah makroskopis) | 409, laporan tetap satu dan *read-only* | ✅ |
| E10 | Pasien membuka laporan pasien lain atau laporan yang belum dirilis; pasien membuka data internal | 404 / 403 (isolasi data antarpasien) | ✅ |
| E11 | Motilitas tidak tersedia atau persentase di luar 0–100 | Disimpan sebagai `null`, **bukan 0** | ✅ |
| E11b | Metrik non-finite (∞) | Analisis gagal secara eksplisit, tidak ada hasil tersimpan | ✅ |
| E12 | Sesi kedaluwarsa / akun dinonaktifkan | 401; login akun nonaktif 403 | ✅ |
| E13 | Nama file upload berisi *path traversal* (`../../../backend/main.mp4`) | File disimpan dengan nama UUID di folder upload | ✅ |
| E14 | Super Admin menonaktifkan akun Super Admin terakhir | 409 | ✅ |

## d. Jejak audit

Setiap tindakan penting harus tercatat di log audit dan terlihat oleh Super Admin lewat API log audit. Kelas `AuditScenarios` menguji hal ini pada database terisolasi.

| ID | Yang diuji | Hasil |
| --- | --- | --- |
| A1 | Unggah video dan analisis tercatat (`UPLOAD_MEDIA`, `RUN_ANALYSIS` dengan model, ambang, dan kalibrasi); keduanya muncul di `/api/admin/audit-logs` atas nama analis | ✅ |
| A2 | Analisis yang gagal tercatat sebagai `FAILURE` beserta pesan galatnya | ✅ |
| A3 | Perubahan kalibrasi mencatat nilai sebelum dan sesudah, dan permintaan yang ditolak validasi tidak meninggalkan catatan | ✅ |
| A4 | Pengisian data makroskopis mencatat perubahan nilai angka dan pilihan; teks bebas tidak disalin ke log | ✅ |
| A5 | Nama berkas asli dari klien (yang bisa memuat nama pasien) tidak masuk log | ✅ |
| A6 | Analisis gambar tunggal tercatat, baik berhasil maupun gagal | ✅ |

Simpan koreksi deteksi (`SAVE_DETECTION_CORRECTION`) dan perubahan kalibrasi juga diperiksa di tes `CorrectionAPI` dan `ApiQC`. Tes lama itu kini mengisolasi pencatatan audit supaya tidak menulis ke database lokal.

Tampilan jam di panel Log Audit diuji di `frontend/src/formatTime.test.js`: waktu dari SQLite tanpa zona diperlakukan sebagai UTC dan ditampilkan dalam WIB.

## e. Koreksi deteksi: hapus kotak merambat ke frame lain

Menghapus kotak di editor koreksi juga menghapus objek yang sama di frame sebelum dan sesudahnya, memakai pencocokan tampilan dan aturan jeda yang sama dengan pelacakan kotak baru. Diuji pada video sintetis di `tests/test_deletion_propagation.py`.

| Yang diuji | Hasil |
| --- | --- |
| Objek yang dihapus hilang di semua frame, objek lain tetap | ✅ |
| Frame tanpa kotak yang cocok tidak diubah | ✅ |
| Jeda sampai 3 frame dijembatani, jeda lebih dari 3 frame menghentikan pencarian | ✅ |
| Objek berkontras rendah hanya dihapus di frame saat ini, dengan pesan yang jelas | ✅ |
| Nomor frame atau kotak tidak valid ditolak (422); sesi citra tunggal ditolak | ✅ |
| Kotak berlabel "bukan sperma" ikut merambat | ✅ |
| Permintaan lama tanpa data hapus berjalan seperti sebelumnya | ✅ |
| **Regresi jalur tambah:** kotak baru tetap dilacak ke seluruh frame | ✅ |

Pengujian di tampilan (editor dengan API tiruan): satu kali tekan Hapus kotak menghasilkan satu permintaan, frame lain ikut terhapus, satu kali Undo mengembalikan semuanya, dan menghapus kotak yang baru ditambahkan (belum disimpan) tidak mencari deteksi AI di frame lain. Tes dirusak secara sengaja (mutasi) untuk memastikan tes benar-benar bisa gagal.

## f. Rekomendasi untuk pasien

Kolom Rekomendasi pada laporan dibaca pasien, jadi isinya harus berupa saran praktis untuk pasien, bukan catatan teknis untuk analis dan dokter. Saran aturan sekarang terpisah: `recommendations` (untuk pasien, masuk ke laporan) dan `review_notes` (untuk peninjau, tidak masuk ke laporan). Diuji di `tests/test_clinical_interpretation.py` dan skenario P9.

| Yang diuji | Hasil |
| --- | --- |
| Jumlah sperma di bawah batas acuan: saran gaya hidup, hindari panas pada testis, pemeriksaan ulang sekitar 3 bulan, dan konsultasi ke dokter urologi atau andrologi | ✅ |
| Gerak sperma di bawah batas acuan dan volume sampel di bawah batas acuan mendapat saran masing-masing | ✅ |
| Semua parameter dalam rentang: saran singkat untuk menjaga kesehatan, tanpa saran pemeriksaan ulang | ✅ |
| Masa pantang di luar 2–7 hari menambah petunjuk pengambilan sampel berikutnya | ✅ |
| Hasil tidak tersedia: hanya dua baris umum, tanpa saran yang dikarang | ✅ |
| Saran tidak memuat istilah teknis (kalibrasi, heatmap, tracking, koreksi analis), resep, dosis, vitamin, atau vonis seperti mandul | ✅ |
| Kasus terburuk muat di kolom Rekomendasi (1.728 dari 2.000 karakter) | ✅ |
| Catatan teknis (kalibrasi, kualitas tracking, koreksi manual, tinjauan video) masuk ke `review_notes`; endpoint tinjauan hanya untuk dokter | ✅ |
| Perintah untuk draf AI meminta saran pasien tanpa catatan teknis, obat, atau dosis | ✅ |

Saran untuk pasien bersifat umum dan dibuat otomatis dari angka hasil. Dokter wajib menyesuaikannya dengan riwayat pasien sebelum menyetujui, dan isinya belum ditinjau oleh tenaga ahli andrologi.

## Temuan terbuka

Dua perilaku yang seharusnya terjadi ditulis sebagai tes `expectedFailure` di kelas `KnownDefects`. Keduanya **belum diperbaiki**. Setelah diperbaiki, hapus tanda `@unittest.expectedFailure`.

| ID | Temuan | Dampak | Usulan perbaikan |
| --- | --- | --- | --- |
| D1 | `/api/analyze` menerima file kosong, `.exe`, dan `.txt` (HTTP 200) tanpa validasi tipe atau ukuran | Melanggar ketentuan keamanan upload (CLAUDE.md §8). File sembarang tersimpan di server dan pipeline baru gagal belakangan | Validasi ekstensi dan *magic bytes* video, tolak file 0 byte, dan batasi ukuran maksimum sebelum file disimpan |
| D2 | Di `process_video_task`, `persist_video_analysis` meng-*commit* hasil sebelum `register_analysis` dijalankan. Jika `register_analysis` gagal, analis melihat "gagal", tetapi hasil berstatus COMPLETED sudah ada di DB dan sampel **bisa dikirim ke dokter** | Status di UI dan database tidak konsisten. Dokter bisa meninjau hasil yang oleh analis dianggap gagal | Jalankan `register_analysis` sebelum hasil di-*commit*, atau tandai run sebagai gagal/hapus saat langkah berikutnya gagal |

## Perubahan pada tes lama

Delapan tes di `tests/test_qc.py` (kelas `ApiQC`) gagal dengan 401 karena endpoint kalibrasi dan analisis kini mewajibkan login, sementara tes tersebut belum diperbarui. Tes kini memakai pengguna terautentikasi (analis, atau Super Admin untuk menyimpan kalibrasi) dan folder koreksi sementara. Isi pemeriksaannya tidak diubah, dan kode aplikasi juga tidak diubah.

## Keterbatasan

- Inferensi model diganti stub. Akurasi deteksi, pelacakan, dan konsentrasi tidak diuji di sini.
- Ambang motilitas (PR/NP/IM), rentang pantang, dan batas makroskopis diuji sesuai **nilai yang dikonfigurasi di aplikasi**. Nilai-nilai ini masih perlu diverifikasi oleh tenaga ahli sebelum dianggap valid secara klinis.
- Belum ada uji antarmuka browser end-to-end untuk alur lengkap. Yang ada baru tes unit frontend dan `tests/editor_browser_smoke.mjs`.
