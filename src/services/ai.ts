import { ModuleData } from "../types";

// Helper to extract JSON from a string that might contain extra text or markdown fences
const extractJson = (text: string) => {
  let cleanedText = text.trim();
  
  // Remove markdown code fence if present
  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

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

// Helper to call AI via backend server proxy with retry logic
const callAi = async (params: { model?: string; contents: string; config?: any }, retries = 3) => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Default to gemini-3.6-flash
  const payload = {
    model: params.model || "gemini-3.6-flash",
    contents: params.contents,
    config: params.config
  };

  for (let i = 0; i < retries; i++) {
    try {
      // 1. Google Apps Script client environment check (only if inside GAS iframe)
      // @ts-ignore
      const isGas = typeof google !== 'undefined' && google?.script?.run;
      if (isGas) {
        // In standalone GAS HTML export, call GAS server script if available
        return await new Promise<{ success: boolean; text: string }>((resolve, reject) => {
          // @ts-ignore
          google.script.run
            .withSuccessHandler((text: string) => resolve({ success: true, text }))
            .withFailureHandler((err: any) => reject(new Error(err?.message || "GAS AI call failed")))
            .generateContentFromGas(payload);
        });
      }

      // 2. Standard Web & AI Studio environment: Use server-side proxy
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMsg = `Server error (${response.status}).`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (e) {
          // Fallback to text
          try {
            const text = await response.text();
            if (text) errorMsg = text;
          } catch (_) {}
        }
        
        // If it's a 503 or 429 from proxy, retry with exponential backoff
        const isRetryable = response.status === 503 || response.status === 429 || errorMsg.includes("high demand") || errorMsg.includes("RESOURCE_EXHAUSTED");
        if (isRetryable && i < retries - 1) {
          await delay(Math.pow(2, i) * 1000);
          continue;
        }
        
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Gagal mendapatkan respon dari AI");
      }
      return data;
    } catch (error: any) {
      if (i === retries - 1) {
        throw error;
      }
      await delay(Math.pow(2, i) * 1000);
    }
  }
  throw new Error("Gagal menghubungi AI setelah beberapa kali percobaan.");
};

export const suggestTopics = async (subject: string, level: string, phase: string) => {
  const model = "gemini-3.6-flash";
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
  const model = "gemini-3.6-flash";
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
  const model = "gemini-3.6-flash";
  
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

