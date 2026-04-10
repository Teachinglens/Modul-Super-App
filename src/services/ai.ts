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
  const cleanedText = text.trim();
  try {
    // Try direct parse first
    return JSON.parse(cleanedText);
  } catch (e) {
    // Find first and last possible JSON markers
    const firstBrace = cleanedText.indexOf('{');
    const lastBrace = cleanedText.lastIndexOf('}');
    const firstBracket = cleanedText.indexOf('[');
    const lastBracket = cleanedText.lastIndexOf(']');

    // Try array first if it starts before object or no object exists
    if (firstBracket !== -1 && lastBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      try {
        return JSON.parse(cleanedText.substring(firstBracket, lastBracket + 1));
      } catch (err) { /* ignore and try object */ }
    }

    // Try object
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(cleanedText.substring(firstBrace, lastBrace + 1));
      } catch (err) { /* ignore */ }
    }

    // Try array again as fallback if we haven't successfully parsed yet
    if (firstBracket !== -1 && lastBracket !== -1) {
      try {
        return JSON.parse(cleanedText.substring(firstBracket, lastBracket + 1));
      } catch (err) { /* ignore */ }
    }
    
    throw e;
  }
};

// Helper to call AI via proxy or directly with retry logic
const callAi = async (params: any, retries = 3) => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < retries; i++) {
    try {
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
          console.warn(`Direct frontend AI call attempt ${i + 1} failed:`, e.message);
          
          // If it's a 503 or 429, we should retry
          const isRetryable = e.message.includes("503") || e.message.includes("429") || e.message.includes("high demand");
          
          if (isRetryable && i < retries - 1) {
            await delay(Math.pow(2, i) * 1000);
            continue;
          }

          // If it's an auth error, we might want to try the proxy which might have a different key
          if (!e.message.includes("API_KEY_INVALID") && !e.message.includes("400") && !isRetryable) {
            throw e;
          }
        }
      }

      // 2. If we are in GAS environment, we MUST use direct client-side call
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

      // 3. Otherwise, use server proxy (e.g. on Vercel)
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
        } catch (e) {}
        
        // If it's a 503 or 429 from proxy, retry
        if ((response.status === 503 || response.status === 429 || errorMsg.includes("high demand")) && i < retries - 1) {
          await delay(Math.pow(2, i) * 1000);
          continue;
        }

        // Add helpful context for common errors
        if (response.status === 500 && errorMsg.includes("GEMINI_API_KEY")) {
          // Detailed instructions already in errorMsg
        }
        
        if (response.status === 503 || errorMsg.includes("high demand")) {
          errorMsg = "Server AI sedang sibuk (High Demand). Silakan coba klik tombol Saran AI lagi dalam beberapa detik.";
        }
        
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.message || "AI Proxy Error");
      return data;
    } catch (error: any) {
      if (i === retries - 1) throw error;
      await delay(Math.pow(2, i) * 1000);
    }
  }
  throw new Error("Gagal menghubungi AI setelah beberapa kali percobaan.");
};

export const suggestTopics = async (subject: string, level: string, phase: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `Berikan 5 saran materi pokok (topik) yang spesifik untuk mata pelajaran ${subject} di jenjang ${level} Fase ${phase} sesuai Kurikulum Merdeka. 
PENTING: Berikan HANYA format JSON array of strings, tanpa teks penjelasan lain.
Contoh: ["Topik 1", "Topik 2"]`;
  
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
  const model = "gemini-3-flash-preview";
  const loveContext = applyLoveCurriculum 
    ? "Sertakan juga pendekatan Kurikulum Berbasis Cinta (nilai kasih sayang, empati, humanis)." 
    : "";
    
  const prompt = `Berikan 3 saran Tujuan Pembelajaran (TP) yang sesuai dengan kaidah ABCD (Audience, Behavior, Condition, Degree) untuk mata pelajaran ${subject}, topik ${topic}, jenjang ${level} Fase ${phase}. 
Gunakan Model Pembelajaran: ${learningModel}.
${loveContext}
PENTING: Berikan HANYA format JSON array of strings, tanpa teks penjelasan lain.
Contoh: ["TP 1", "TP 2"]`;
  
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
  const model = "gemini-3-flash-preview";
  
  const prompt = `
Tugas: Buatlah Modul Ajar Kurikulum Merdeka yang SISTEMATIS, LOGIS, dan PROFESIONAL.
Bahasa: Indonesia (Kaidah Guru Profesional).
PENTING: Berikan HANYA format JSON yang valid. JANGAN sertakan teks penjelasan di luar JSON. JANGAN sertakan Judul BAB atau Nomor BAB (seperti "I. PROFIL PELAJAR PANCASILA", "II. SARANA PRASARANA", dll) dalam isi konten JSON, karena judul sudah ada di template UI. Langsung berikan isi kontennya saja.

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
