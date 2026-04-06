export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  package: "basic" | "premium";
  downloadCount: number;
  password?: string;
  nip?: string;
}

export interface ModuleData {
  teacherName: string;
  nip: string;
  subject: string;
  level: string;
  className: string;
  phase: string;
  year: string;
  topic: string;
  learningObjectives: string;
  model: string;
  characters: string[];
  schoolName: string;
  allocation: string;
  location: string;
  date: string;
  principalName: string;
  principalNip: string;
  isNipLocked: boolean;
  isPrincipalLocked: boolean;
  isSchoolLocked?: boolean;
  isSubjectLocked?: boolean;
  isLevelLocked?: boolean;
  isClassLocked?: boolean;
  isYearLocked?: boolean;
  isLocationLocked?: boolean;
  isAllocationLocked?: boolean;
  applyLoveCurriculum: boolean;
}

export interface GeneratedModule {
  identitas: string;
  profilPancasila: string;
  saranaPrasarana: string;
  targetPesertaDidik: string;
  modelMetode: string;
  tujuanPembelajaran: string;
  pemahamanBermakna: string;
  pertanyaanPemantik: string;
  kegiatanPembelajaran: string;
  asesmenDiagnostik: string;
  asesmenFormatif: string;
  asesmenSumatif: string;
  pengayaanRemedial: string;
  refleksi: string;
  lampiran: string;
  lkpd: string;
}
