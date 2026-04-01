# Petunjuk Penggunaan GuruAI

Aplikasi ini adalah platform profesional untuk membuat Modul Ajar Kurikulum Merdeka secara otomatis.

## Fitur Utama
1. **Login Eksklusif**: Sistem akun untuk pembeli (Admin & Guru).
2. **AI Generator**: Menghasilkan modul lengkap (Identitas, Pendahuluan, Inti 4C, Penutup, Asesmen).
3. **Export PDF**: Download hasil modul langsung ke format PDF siap cetak.
4. **Integrasi Spreadsheet**: Support untuk penyimpanan data eksternal via Google Apps Script.

## Cara Setup Akun (Server)
Secara default, akun berikut sudah tersedia:
- **Email**: `admin@guruai.id` | **Password**: `admin123`
- **Email**: `guru@sekolah.id` | **Password**: `guru123`

Anda dapat menambah akun di file `users.json` pada root direktori.

## Cara Integrasi Google Sheets
1. Buka Google Sheets baru.
2. Klik **Extensions** > **Apps Script**.
3. Hapus kode yang ada dan tempelkan isi dari file `code.gs` yang tersedia di proyek ini.
4. Klik **Save** dan jalankan fungsi `setupDatabase` untuk membuat tabel.
5. Klik **Deploy** > **New Deployment** > **Web App**.
6. Set "Who has access" ke "Anyone".
7. Salin URL Web App tersebut untuk digunakan di aplikasi jika ingin sinkronisasi data.

## Teknologi
- **Frontend**: React 19, Tailwind CSS 4, Framer Motion.
- **Backend**: Node.js Express.
- **AI**: Google Gemini 3 Flash.
- **PDF**: jsPDF & html2canvas.
