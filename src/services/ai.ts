import { GoogleGenAI } from "@google/genai";
import { ModuleData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const suggestTopics = async (subject: string, level: string, phase: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `Berikan 5 saran materi pokok (topik) yang spesifik untuk mata pelajaran ${subject} di jenjang ${level} Fase ${phase} sesuai Kurikulum Merdeka. Berikan dalam format JSON array of strings.`;
  
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text);
};

export const suggestObjectives = async (subject: string, topic: string, level: string, phase: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `Berikan 3 saran Tujuan Pembelajaran (TP) yang sesuai dengan kaidah ABCD (Audience, Behavior, Condition, Degree) untuk mata pelajaran ${subject}, topik ${topic}, jenjang ${level} Fase ${phase}. Berikan dalam format JSON array of strings.`;
  
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text);
};

export const generateModulAjar = async (data: ModuleData) => {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
Tugas: Buatlah Modul Ajar Kurikulum Merdeka yang SISTEMATIS, LOGIS, dan PROFESIONAL.
Bahasa: Indonesia (Kaidah Guru Profesional).
PENTING: JANGAN sertakan Judul BAB atau Nomor BAB (seperti "I. PROFIL PELAJAR PANCASILA", "II. SARANA PRASARANA", dll) dalam isi konten JSON, karena judul sudah ada di template UI. Langsung berikan isi kontennya saja.

DATA INPUT:
- Nama Guru: ${data.teacherName}
- NIP: ${data.nip}
- Mata Pelajaran: ${data.subject}
- Jenjang: ${data.level}
- Kelas: ${data.className}
- Fase: ${data.phase}
- Tahun Pelajaran: ${data.year}
- Materi Pokok: ${data.topic}
- Tujuan Pembelajaran: ${data.learningObjectives}
- Model Pembelajaran: ${data.model}
- Karakter (Profil Pelajar Pancasila): ${data.characters.join(", ")}
- Nama Sekolah: ${data.schoolName}
- Alokasi Waktu: ${data.allocation}
- Terapkan Kurikulum Berbasis Cinta: ${data.applyLoveCurriculum ? "YA (Sertakan nilai-nilai kasih sayang, empati, dan pendekatan humanis dalam setiap langkah pembelajaran)" : "TIDAK"}

STRUKTUR WAJIB (STRICT FORMAT):
1. IDENTITAS MODUL: Sertakan Nama Sekolah, Nama Guru (NIP), Mapel, Kelas, Fase, Topik, Alokasi Waktu.
2. PROFIL PELAJAR PANCASILA: Fokus pada karakter: ${data.characters.join(", ")}.
3. SARANA & PRASARANA: Daftar alat dan bahan yang dibutuhkan.
4. TARGET PESERTA DIDIK: Deskripsi target siswa.
5. MODEL & METODE PEMBELAJARAN: Menggunakan model ${data.model}.
6. TUJUAN PEMBELAJARAN: Gunakan Tujuan Pembelajaran yang diberikan: ${data.learningObjectives}.
7. PEMAHAMAN BERMAKNA.
8. PERTANYAAN PEMANTIK.
9. KEGIATAN PEMBELAJARAN (Sistematis & 4C):
   - Format: List Terstruktur (A. Pendahuluan, B. Kegiatan Inti, C. Kegiatan Penutup).
   - WAJIB: Sertakan Alokasi Waktu di setiap sub-judul kegiatan (Contoh: A. Kegiatan Pendahuluan (10 Menit)).
   - INTI: Langkah-langkah model ${data.model} (Sintaks), Integrasi 4C (Critical Thinking, Collaboration, Creativity, Communication).
   - Jika "Kurikulum Berbasis Cinta" diaktifkan, pastikan langkah-langkahnya mencerminkan pendekatan tersebut.
10. ASESMEN: Diagnostik, Formatif, dan Sumatif.
11. PENGAYAAN & REMEDIAL.
12. REFLEKSI GURU & PESERTA DIDIK.
13. LAMPIRAN: Bahan Bacaan, Glosarium, Daftar Pustaka.
14. LEMBAR KERJA PESERTA DIDIK (LKPD): Buatlah LKPD yang interaktif dan sesuai dengan materi pokok.
15. HINDARI PENGGUNAAN TABEL: Sajikan semua informasi dalam format teks naratif atau daftar (list) terstruktur, jangan gunakan tabel di bagian manapun terutama di Lampiran dan LKPD.

FORMAT OUTPUT: JSON STRICT (Hanya JSON, tanpa teks lain)
{
  "identitas": "String Markdown",
  "profilPancasila": "String Markdown",
  "saranaPrasarana": "String Markdown",
  "targetPesertaDidik": "String Markdown",
  "modelMetode": "String Markdown",
  "tujuanPembelajaran": "String Markdown",
  "pemahamanBermakna": "String Markdown",
  "pertanyaanPemantik": "String Markdown",
  "kegiatanPembelajaran": "String Markdown (Format List Terstruktur dengan Alokasi Waktu)",
  "asesmenDiagnostik": "String Markdown",
  "asesmenFormatif": "String Markdown",
  "asesmenSumatif": "String Markdown",
  "pengayaanRemedial": "String Markdown",
  "refleksi": "String Markdown",
  "lampiran": "String Markdown",
  "lkpd": "String Markdown (Lembar Kerja Peserta Didik)"
}
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text);
};
