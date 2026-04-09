import { GoogleGenAI } from "@google/genai";
import { ModuleData } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

// Initialize AI client for frontend use if key is available
let frontendAi: any = null;
if (apiKey) {
  try {
    frontendAi = new GoogleGenAI({ apiKey: apiKey.trim() });
  } catch (e) {
    console.error("Failed to initialize frontend AI:", e);
  }
}

// Helper to extract JSON from a string that might contain extra text
const extractJson = (text: string) => {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch (e) {
    // Try to find JSON block
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = text.substring(start, end + 1);
      try {
        return JSON.parse(jsonStr);
      } catch (innerError) {
        // If it's an array
        const startArr = text.indexOf('[');
        const endArr = text.lastIndexOf(']');
        if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
          const jsonArrStr = text.substring(startArr, endArr + 1);
          return JSON.parse(jsonArrStr);
        }
        throw innerError;
      }
    }
    throw e;
  }
};

// Helper to call AI via proxy or directly
const callAi = async (params: any) => {
  // 1. Try direct frontend call first if key is available (Recommended by SKILL.md)
  if (frontendAi) {
    try {
      const response = await frontendAi.models.generateContent({
        model: params.model || "gemini-3-flash-preview",
        contents: params.contents,
        config: params.config
      });
      if (response && response.text) {
        return { success: true, text: response.text };
      }
    } catch (e: any) {
      console.warn("Direct frontend AI call failed, falling back to proxy/GAS:", e.message);
      // If it's an auth error, we might want to try the proxy which might have a different key
      if (!e.message.includes("API_KEY_INVALID") && !e.message.includes("400")) {
        throw e;
      }
    }
  }

  // 2. If we are in GAS environment, we MUST use direct client-side call
  // because the server proxy won't be available.
  // @ts-ignore
  const isGas = typeof google !== 'undefined' && google.script && google.script.run;
  
  if (isGas) {
    if (!apiKey) throw new Error("GEMINI_API_KEY tidak ditemukan. Pastikan sudah diatur di Script Properties.");
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: params.model || "gemini-3-flash-preview",
      contents: params.contents,
      config: params.config
    });
    return { success: true, text: response.text };
  }

  // 3. Otherwise, use server proxy for better reliability and security (e.g. on Vercel)
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMsg = `Server error (${response.status}).`;
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorMsg;
    } catch (e) {
      // Fallback if not JSON
    }
    
    // Add helpful context for common errors
    if (response.status === 500 && errorMsg.includes("GEMINI_API_KEY")) {
      // The server now provides detailed instructions in errorMsg
    }
    
    console.error("AI Proxy Error:", errorMsg);
    throw new Error(errorMsg);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.message || "AI Proxy Error");
  return data;
};

export const suggestTopics = async (subject: string, level: string, phase: string) => {
  const model = "gemini-flash-latest";
  const prompt = `Berikan 5 saran materi pokok (topik) yang spesifik untuk mata pelajaran ${subject} di jenjang ${level} Fase ${phase} sesuai Kurikulum Merdeka. Berikan dalam format JSON array of strings.`;
  
  try {
    const response = await callAi({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    return extractJson(response.text);
  } catch (error) {
    console.error("Error in suggestTopics:", error);
    throw error;
  }
};

export const suggestObjectives = async (
  subject: string, 
  topic: string, 
  level: string, 
  phase: string,
  learningModel: string,
  applyLoveCurriculum: boolean
) => {
  const model = "gemini-flash-latest";
  const loveContext = applyLoveCurriculum 
    ? "Sertakan juga pendekatan Kurikulum Berbasis Cinta (nilai kasih sayang, empati, humanis)." 
    : "";
    
  const prompt = `Berikan 3 saran Tujuan Pembelajaran (TP) yang sesuai dengan kaidah ABCD (Audience, Behavior, Condition, Degree) untuk mata pelajaran ${subject}, topik ${topic}, jenjang ${level} Fase ${phase}. 
Gunakan Model Pembelajaran: ${learningModel}.
${loveContext}
Berikan dalam format JSON array of strings.`;
  
  try {
    const response = await callAi({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    return extractJson(response.text);
  } catch (error) {
    console.error("Error in suggestObjectives:", error);
    throw error;
  }
};

export const generateModulAjar = async (data: ModuleData) => {
  const model = "gemini-flash-latest";
  
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
10. ASESMEN: Dari Diagnostik, Formatif, dan Sumatif.
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
  
  try {
    const response = await callAi({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    return extractJson(response.text);
  } catch (error) {
    console.error("Error in generateModulAjar:", error);
    throw error;
  }
};
