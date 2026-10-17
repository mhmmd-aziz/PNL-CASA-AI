// Role-Based Access Control (RBAC): definisi peran, menu, dan izin per peran.
// Catatan: pembatasan ini baru di sisi UI; otorisasi tetap wajib diterapkan di server/API.

export const ROLES = {
  frontoffice: {
    id: 'frontoffice',
    name: 'Petugas Front Office / Admin Laboratorium',
    badge: 'FRONT OFFICE',
    badgeColor: '#2563EB',
    badgeTextColor: '#FFFFFF',
    description: 'Mendaftarkan pasien/pemeriksaan, mengelola detail registrasi, mencatat serah terima sampel, dan mencetak label/kode batang sampel.',
    scope: 'Registrasi Pasien & Sampel',
    tabs: ['Registration'],
    permissions: { registerPatients: true },
    restrictedFeatures: ['Tidak dapat mengubah atau merilis hasil medis']
  },
  analis: {
    id: 'analis',
    name: 'Analis Laboratorium / ATLM',
    badge: 'ANALIS / ATLM',
    badgeColor: '#C1D72E',
    badgeTextColor: '#121F0E',
    description: 'Memasukkan data makroskopis, memilih profil kalibrasi yang diizinkan, mengunggah media, menjalankan analisis, meninjau deteksi, dan mengirim hasil untuk ditinjau dokter.',
    scope: 'Pemeriksaan & Analisis Sampel',
    tabs: ['Overview', 'Analysis Lab', 'Patient Records', 'Quality Control'],
    permissions: { runAnalysis: true, viewResults: true, submitForReview: true },
    restrictedFeatures: ['Tidak dapat merilis laporan akhir', 'Tidak dapat mengubah preset kalibrasi']
  },
  dokter: {
    id: 'dokter',
    name: 'Dokter Penanggung Jawab',
    badge: 'DOKTER PJ',
    badgeColor: '#00AFA0',
    badgeTextColor: '#FFFFFF',
    description: 'Meninjau hasil yang dikirim, memasukkan/menyetujui interpretasi klinis, menandatangani secara digital, mengembalikan kasus untuk diperbaiki, dan merilis laporan.',
    scope: 'Validasi Klinis & Rilis Laporan',
    tabs: ['Overview', 'Perlu Validasi', 'Patient Records', 'Lab Reports'],
    permissions: { viewResults: true, reviewResults: true, signReports: true, releaseReports: true },
    restrictedFeatures: ['Tidak dapat mengubah preset kalibrasi', 'Tidak mengelola akun pengguna']
  },
  pasien: {
    id: 'pasien',
    name: 'Pasien',
    badge: 'PASIEN',
    badgeColor: '#64748B',
    badgeTextColor: '#FFFFFF',
    description: 'Melihat dan mengunduh laporan miliknya sendiri yang telah dirilis.',
    scope: 'Laporan Pribadi',
    tabs: ['My Reports'],
    permissions: { viewOwnReports: true },
    restrictedFeatures: ['Tidak dapat mengakses video mentah atau data analisis internal']
  },
  superadmin: {
    id: 'superadmin',
    name: 'Super Admin / Kepala Laboratorium',
    badge: 'SUPER ADMIN',
    badgeColor: '#0F172A',
    badgeTextColor: '#FFFFFF',
    description: 'Mengelola pengguna dan peran, memantau log audit, mengonfigurasi/mengunci preset kalibrasi yang disetujui, serta mengelola pengaturan sistem.',
    scope: 'Pengguna, Audit & Pengaturan Sistem',
    tabs: ['User Management', 'Server Logs', 'Calibration', 'Quality Control'],
    permissions: { manageUsers: true, viewAuditLogs: true, editCalibration: true },
    restrictedFeatures: ['Hak administratif tidak memberi izin mengubah atau menandatangani hasil klinis']
  }
};

export function hasPermission(roleId, permission) {
  return Boolean(ROLES[roleId]?.permissions[permission]);
}

export function canAccessTab(roleId, tabId) {
  return Boolean(ROLES[roleId]?.tabs.includes(tabId));
}

const STORAGE_KEY = 'casa_ai_auth_user';
const ROLE_MODE_KEY = 'casa_ai_role_mode';

function getStorage() {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
}

export function getAccounts() {
  return Object.values(ROLES);
}

// Autentikasi server belum tersedia, sehingga tidak ada sesi akun yang dianggap sah.
export function getCurrentUser() {
  return null;
}

export function login() {
  return {
    success: false,
    error: 'Autentikasi akun belum tersedia. Gunakan mode peran untuk mengakses dashboard.'
  };
}

// Mode peran hanya mengatur tampilan dashboard, bukan identitas pengguna.
export function getRoleMode() {
  try {
    const roleId = getStorage()?.getItem(ROLE_MODE_KEY);
    return ROLES[roleId] ? roleId : null;
  } catch {
    return null;
  }
}

export function setRoleMode(roleId) {
  if (!ROLES[roleId]) return false;
  getStorage()?.setItem(ROLE_MODE_KEY, roleId);
  return true;
}

export function logout() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(ROLE_MODE_KEY);
  storage.removeItem(STORAGE_KEY);
}
