# Sperm Analysis App

Aplikasi analisis sperma menggunakan model AI (YOLO/RTDETR) yang dilengkapi dengan Backend (FastAPI) dan Frontend (React & Vite).

## Struktur Repositori

- `backend/` : Berisi API menggunakan FastAPI dan endpoint untuk inferensi model.
- `frontend/` : Berisi antarmuka pengguna berbasis React + Vite.
- `train model/` : Berisi skrip pelatihan, dataset, arsitektur model, tracking, dan dependensi khusus AI.

## Prasyarat

Pastikan Anda telah menginstal:
- [Node.js](https://nodejs.org/) (versi 16 atau terbaru)
- [Python](https://www.python.org/) (versi 3.8 atau terbaru)
- Git

---

## Cara Menjalankan Proyek

Proyek ini memiliki dua komponen utama yang perlu dijalankan secara terpisah: Backend dan Frontend.

### 1. Menjalankan Backend (FastAPI & Model)

Buka terminal dan navigasi ke direktori root repositori ini.

1. Pindah ke direktori `backend`:
   ```bash
   cd backend
   ```

2. (Opsional namun disarankan) Buat dan aktifkan virtual environment:
   ```bash
   python -m venv venv
   # Di Windows:
   venv\Scripts\activate
   # Di Mac/Linux:
   source venv/bin/activate
   ```

3. Instal dependensi backend:
   ```bash
   pip install -r requirements.txt
   ```

4. Instal dependensi model AI (diperlukan oleh backend untuk inferensi):
   ```bash
   pip install -r "../train model/requirements.txt"
   ```

5. Jalankan server backend FastAPI:
   ```bash
   uvicorn main:app --reload
   ```
   *Backend sekarang berjalan di `http://localhost:8000` (Anda dapat melihat dokumentasi API di `http://localhost:8000/docs`).*

### 2. Menjalankan Frontend (React + Vite)

Buka terminal baru dan navigasi ke direktori root repositori.

1. Pindah ke direktori `frontend`:
   ```bash
   cd frontend
   ```

2. Instal dependensi:
   ```bash
   npm install
   ```

3. Jalankan server pengembangan frontend:
   ```bash
   npm run dev
   ```
   *Aplikasi frontend sekarang berjalan dan dapat diakses melalui browser:*
   - **Halaman Beranda (Home):** `http://localhost:5173/`
   - **Dashboard Medis & Admin:** `http://localhost:5173/dashboard`

---

## Tentang Model (Train Model)

Jika Anda ingin melakukan pelatihan ulang atau eksperimen dengan model, buka direktori `train model`. Anda dapat menyesuaikan konfigurasi di dalam file python terkait pelatihan maupun pada `requirements.txt` spesifik AI.

## Catatan Tambahan
Pastikan backend berjalan terlebih dahulu sebelum Anda melakukan request analisis dari frontend agar komunikasi API berjalan lancar.

## Kalibrasi Analisis

Kalibrasi diterapkan setelah deteksi YOLO/RT-DETR dan pelacakan ByteTrack, bukan untuk mengubah bobot atau melatih ulang model deteksi. Parameter menentukan konversi piksel ke mikrometer, waktu gerak, konsentrasi berdasarkan volume bidang pandang, dan klasifikasi motilitas berbasis aturan.

1. Jalankan backend dan frontend, lalu buka pengaturan kalibrasi di portal publik atau dashboard.
2. Ukur **skala piksel dalam µm/px** menggunakan mikrometer pada konfigurasi optik dan resolusi yang digunakan. Nilai awal `0.8` hanyalah contoh, bukan hasil verifikasi perangkat. Gambar yang di-resize memerlukan penyesuaian skala.
3. Pilih bilik sesuai spesifikasi aktual: Makler 10 µm, Leja 20 µm, Improved Neubauer 100 µm, atau **Custom**. Nilai awal 20 µm berlabel Custom, bukan Makler. Mengubah kedalaman preset secara manual mengalihkan tipe menjadi Custom.
4. Mode FPS **otomatis** memakai metadata video. Gunakan **manual** untuk FPS rekaman aktual bila metadata tidak tepat, misalnya video slow-motion. FPS yang sama digunakan untuk menghitung gerak dan menulis video hasil. Metadata FPS yang tidak tersedia menghasilkan pesan untuk menggunakan mode manual, bukan tebakan diam-diam.
5. Masukkan faktor pengenceran (`1` untuk tanpa pengenceran), ambang kecepatan VCL, ambang kelurusan LIN, dan ambang immotil.
6. Klik **Simpan Konfigurasi ke Server**. Konfigurasi disimpan secara atomik ke `backend/data/calibration.json`, tetap ada setelah reload/restart, dan dimuat oleh kedua halaman. Ini menyimpan parameter aplikasi, **bukan mengirim konfigurasi ke hardware mikroskop**. Perubahan formulir yang belum disimpan hanya berlaku untuk analisis yang dijalankan dari formulir tersebut.

### Perhitungan dan Validasi

- Jarak fisik = jarak piksel × skala (µm/px).
- VCL = panjang lintasan fisik / durasi lintasan; VSL = perpindahan awal–akhir / durasi; LIN = perpindahan / panjang lintasan.
- Kategori progresif memerlukan VCL dan LIN yang memenuhi kedua ambang; kategori immotil memakai ambang VCL tersendiri. VAP, STR, dan WOB tersedia sebagai estimasi eksperimental; ALH dan BCF belum dihitung.
- VAP memakai panjang lintasan setelah dua putaran penghalusan posisi interior dengan tetangga berbobot waktu, dibagi durasi. Posisi awal/akhir tetap. STR = VSL/VAP; WOB = VAP/VCL. Rasio dirata-rata per lintasan dan pembagi nol menghasilkan `null`, bukan nol. Snapshot `analysis_method` mencatat metode dan jumlah putaran; hasil tidak otomatis sebanding dengan CASA vendor lain.
- Volume bidang pandang = lebar piksel × tinggi piksel × skala² × kedalaman bilik. Konsentrasi memakai median deteksi sperma **sebelum** filter tracking pada video, atau jumlah deteksi pada citra, dikalikan faktor pengenceran. Median pecahan (misalnya 28,5) dipertahankan, bukan dibulatkan turun.
- Motilitas memakai satu segmen kontinu terpanjang per ID dengan minimal 15 pengamatan. Celah frame tidak disambung. `summary.motility_denominator` mencatat jumlah ID yang menjadi pembagi PR/NP/IM; `classification_counts` mencatat jumlah tiap kategori. Ini berbeda dari median deteksi per frame dan belum menjamin jumlah sel biologis unik.
- `quality` merekam ID yang diterima/ditolak, ID dengan celah, jumlah frame, dan proporsi deteksi yang mendapat ID. Angka ini membantu memeriksa tracking, bukan ukuran akurasi. Hasil lama harus dianalisis ulang untuk memperoleh metrik baru.
- Hanya kelas sperma individual yang dihitung/dilacak. Cluster dan debris tidak dimasukkan ke konsentrasi atau motilitas. Model tanpa label kelas sperma individual ditolak.
- Skala, FPS manual, kedalaman, dan ambang progresif harus positif dan terbatas; pengenceran minimal 1; LIN berada pada 0–1; ambang immotil tidak boleh melebihi ambang progresif. Validasi berlaku di frontend dan backend. LIN `0` dan ambang immotil `0` diperbolehkan.
- Respons analisis dan laporan JSON merekam snapshot `calibration` yang benar-benar digunakan, termasuk FPS efektif, sumber FPS, resolusi, skala, bilik, dan ambang. Laporan Markdown video juga memuat snapshot ini. Perubahan konfigurasi berikutnya tidak mengubah hasil lama.
- Citra tunggal dan video tanpa lintasan yang cukup tidak menyediakan penilaian motilitas (`motility_available: false`); antarmuka menampilkan N/A, bukan menyatakan semua sel immotil.

### API dan CLI

- `GET /api/calibration`: membaca profil tersimpan atau nilai awal jika belum ada profil.
- `PUT /api/calibration`: memvalidasi dan menyimpan profil lengkap. Frontend mengirim seluruh field profil.
- `POST /api/analyze` dan `POST /api/analyze_image`: memakai profil tersimpan untuk field yang tidak dikirim; field multipart yang dikirim menjadi override untuk analisis tersebut. Request lama yang hanya mengirim `fps` tanpa `fps_mode` diperlakukan sebagai FPS manual.
- Analisis menolak berjalan jika bobot model sperma terlatih tidak tersedia; tidak menggunakan fallback model objek generik.

Contoh pipeline mandiri, dari direktori `train model` (pipeline mandiri memakai argumen/default CLI, bukan otomatis membaca profil server):

```powershell
python pipeline.py --video "../SAMPEL TEST/TEST 1.mp4" --model "runs/train_sperma_undersampled_cepat2/weights/best.pt" --pixel-scale 0.8 --chamber-depth 20 --fps-mode auto
```

**Batas penggunaan:** konfigurasi ini mendukung pengujian teknis lokal. Nilai awal ambang bukan sertifikasi atau jaminan kepatuhan klinis WHO. Akurasi optik, model, dan hasil perlu divalidasi pada perangkat serta data laboratorium sebelum penggunaan klinis. API proyek saat ini belum mempunyai autentikasi server; jangan ekspos API atau endpoint penyimpanan kalibrasi langsung ke internet. Pemisahan hak akses antarmuka bukan pengamanan API.
