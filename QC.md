# Catatan QC — 17 Oktober 2026

## Pembaruan tanpa training ulang

- Hitungan video sekarang memakai deteksi sebelum penyaringan ID ByteTrack, termasuk objek yang belum mendapat ID. Median pecahan tidak dibulatkan turun.
- Gerak dihitung dari satu segmen kontinu terpanjang per ID, minimal 15 pengamatan. Jeda frame tidak disambung untuk perhitungan motilitas.
- VAP memakai dua putaran rata-rata posisi tetangga berbobot waktu dengan titik ujung tetap. STR = VSL/VAP, WOB = VAP/VCL. Rasio dengan pembagi nol disimpan sebagai null dan tidak masuk rata-rata. Metode ini eksperimental dan tercatat pada hasil, bukan validasi klinis/vendor CASA.
- Halaman analisis, portal publik, modal hasil, rekam medis, serta laporan membawa metrik baru dan membedakan median deteksi dari pembagi persentase motilitas. Bantuan pengaturan ikut diperbarui.
- `quality` menampilkan ID diterima/ditolak, celah frame, jumlah frame, dan proporsi deteksi yang mendapat ID. Belum ada jaminan ID = sel biologis unik; pergantian ID tetap memerlukan validasi terhadap anotasi.
- **19 tes Python dan 11 tes frontend lulus; lint bersih dan build produksi lulus.** Uji model nyata pada gambar serta video 30 frame lulus untuk FPS otomatis/manual. Hash SHA-256 bobot sebelum/sesudah inferensi sama.
- Backend dimuat ulang dengan pemantauan direktori backend dan pipeline. Uji API pada cuplikan serta **TEST 1.mp4 utuh (1.470 frame)** berhasil; video/heatmap hasil dapat diakses HTTP 200, metrik versi `trajectory-v2` tersedia, dan profil kalibrasi server tidak berubah. FE dan endpoint kalibrasi BE juga merespons HTTP 200.
- Cuplikan uji terbaru: median **28,5 deteksi/frame**, **24 ID valid dari 68 ID**, PR **37,5%**, VAP **63,16 µm/s**, STR **67,75%**, WOB **85,35%** pada FPS metadata 49. Nilai ini berbeda dari putaran sebelumnya karena basis hitungan serta pemilihan segmen diperbaiki; bukan bukti peningkatan akurasi klinis.
- ALH/BCF, validasi pada data baru yang independen, dan validasi laboratorium masih belum tersedia. Dataset dan bobot tidak dilatih ulang atau dibagi ulang pada perubahan ini.

Perintah frontend terbaru: `node --test src/calibration.test.js src/parameterHelp.test.js`.

## Riwayat pemeriksaan sebelumnya

Lingkup: perubahan kalibrasi, API analisis, perhitungan gerak/konsentrasi, dan konsistensi laporan. Pemeriksaan ini menguji perilaku perangkat lunak, bukan akurasi klinis model.

## Perbaikan dalam putaran ini

- Laporan Markdown menampilkan N/A untuk PR, NP, dan IM jika motilitas tidak tersedia; sebelumnya menampilkan 0.00%.
- Laporan dashboard tidak lagi mengartikan N/A sebagai motilitas menurun atau memberi kategori kinematika positif secara tetap. Hasil numerik membutuhkan validasi, sementara nilai yang tidak tersedia ditandai tidak dapat dinilai.
- Laporan tidak lagi mengisi warna, likuefaksi, atau pH yang belum tercatat. Status pending tidak memunculkan kesimpulan diagnosis otomatis.
- Klaim akreditasi dan pengesahan kriptografis, nama dokter cadangan, nomor SIP tetap, serta tanggal cetak tetap dihapus dari laporan. Penanggung jawab mengikuti catatan pemeriksaan.
- Sebelas impor frontend yang tidak digunakan dibersihkan.

## Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| Regresi Python | 12 tes lulus, termasuk variasi input multipart kedua endpoint |
| Regresi frontend | 5 tes lulus |
| Lint frontend | Lulus tanpa peringatan |
| Build produksi frontend | Lulus |
| Whitespace diff | Lulus |
| Inferensi gambar nyata | Lulus; 31 sel terdeteksi, motilitas tidak tersedia |
| Inferensi video FPS otomatis | Lulus; metadata 49 FPS, median 27 sel, 24 lintasan valid |
| Inferensi video FPS manual | Lulus; 60 FPS, hitungan sel sama, kecepatan berubah dengan rasio 60/49 |
| Keluaran inferensi | WebM dapat didekode, heatmap dapat dibaca, snapshot JSON sesuai parameter efektif |

Uji inferensi memakai satu frame dan cuplikan 30 frame dari `SAMPEL TEST/TEST 1.mp4`, dengan bobot lokal `train model/runs/train_sperma_undersampled_cepat2/weights/best.pt`. Cuplikan video dikodekan ulang menjadi MJPG tanpa mengubah resolusi. Sampel sumber dan profil kalibrasi pengguna tidak diubah. Hasil pengujian tersimpan di `.tmp/qc-inference/` dan log di `.tmp/qc-inference.log`.

Tes API memakai file kalibrasi serta upload sementara yang terisolasi. Inferensi pada tes API diganti stub untuk memeriksa kontrak request; skrip smoke menguji pipeline dengan model nyata secara terpisah.

## Menjalankan ulang

Dari root repositori, gunakan Python dengan dependensi backend/model dan `httpx` terpasang:

```powershell
python tests/test_qc.py
python tests/smoke_inference.py
```

Dari direktori `frontend`:

```powershell
node --test src/calibration.test.js
npm.cmd run lint
npm.cmd run build
```

## Batas pemeriksaan

- Pemeriksaan visual/browser dan pratinjau cetak belum dilakukan: alat browser sesi ini mengembalikan `unsupported call: js`. Build dan tes fungsi frontend lulus, tetapi tidak menggantikan uji interaksi UI.
- Video panjang, beberapa analisis bersamaan, dan validasi akurasi terhadap anotasi laboratorium belum diuji pada putaran ini.
- OpenCV mengeluarkan peringatan tag codec VP8/WebM. Penulisan file tetap berhasil; keluaran diverifikasi dapat didekode dan FPS sesuai.
