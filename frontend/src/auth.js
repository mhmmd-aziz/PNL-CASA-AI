// Authentication & Role-Based Access Control (RBAC) System

export const ROLES = {
  admin: {
    id: 'admin',
    name: 'Administrator Sistem & Lab',
    user: 'Bambang Pratama, S.Kom.',
    username: 'admin',
    email: 'admin@casa.lab',
    password: 'admin123',
    badge: 'ADMIN SISTEM',
    badgeColor: '#0F172A',
    badgeTextColor: '#FFFFFF',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    description: 'Manajemen pengguna, audit log, konfigurasi server AI & database, dan pemantauan sistem laboratorium.',
    scope: 'Sistem & Manajemen Pengguna',
    permissions: {
      canRunInference: true,
      canCalibrate: true,
      canValidateDiagnosis: false,
      canSignReport: false,
      canManageUsers: true,
      canViewAuditLogs: true,
      canExportData: true
    },
    allowedFeatures: [
      'Kelola akun pengguna & peran staf',
      'Audit log aktivitas & status server AI',
      'Manajemen database & riwayat rekam pasien',
      'Ekspor laporan agregat laboratorium (CSV/Excel)'
    ],
    restrictedFeatures: [
      'Tidak memiliki wewenang klinis untuk pengesahan diagnosa medis akhir pasien'
    ]
  },
  dokter: {
    id: 'dokter',
    name: 'Dokter Spesialis Andrologi',
    user: 'Dr. Sajibur Rahman, Sp.And',
    username: 'dokter',
    email: 'dokter@casa.lab',
    password: 'dokter123',
    badge: 'DOKTER SPESIALIS',
    badgeColor: '#00AFA0',
    badgeTextColor: '#FFFFFF',
    avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&auto=format&fit=crop&q=80',
    description: 'Validasi klinis standar WHO 6th edition, inspeksi kinematika motilitas sel, pengesahan hasil lab & tanda tangan digital laporan.',
    scope: 'Validasi Klinis & Diagnosa Medis',
    permissions: {
      canRunInference: true,
      canCalibrate: false,
      canValidateDiagnosis: true,
      canSignReport: true,
      canManageUsers: false,
      canViewAuditLogs: false,
      canExportData: true
    },
    allowedFeatures: [
      'Validasi & persetujuan diagnosis klinis sperma (Approve / Reject)',
      'Penandatanganan digital laporan resmi laboratorium',
      'Input catatan evaluasi medis dokter spesialis andrologi',
      'Pemeriksaan detail kurva kinematika sperma (VCL, VSL, VAP)'
    ],
    restrictedFeatures: [
      'Tidak dapat mengubah kalibrasi teknis hardware mikroskop (dikelola analis lab)',
      'Tidak mengelola akun user sistem'
    ]
  },
  laboran: {
    id: 'laboran',
    name: 'Tenaga Medis / Analis Mikroskop',
    user: 'Nurul Hidayati, A.Md.AK',
    username: 'laboran',
    email: 'laboran@casa.lab',
    password: 'laboran123',
    badge: 'ANALIS MIKROSKOP',
    badgeColor: '#C1D72E',
    badgeTextColor: '#121F0E',
    avatar: 'https://images.unsplash.com/photo-1594824813576-431871ad2bfd?w=100&auto=format&fit=crop&q=80',
    description: 'Preparasi bilik preparat Makler/Leja, perekaman video mikroskopis, upload inferensi AI, dan kalibrasi optik mikroskop.',
    scope: 'Operasional Mikroskop & Inferensi AI',
    permissions: {
      canRunInference: true,
      canCalibrate: true,
      canValidateDiagnosis: false,
      canSignReport: false,
      canManageUsers: false,
      canViewAuditLogs: false,
      canExportData: true
    },
    allowedFeatures: [
      'Operasional analisis video mikroskopis & deteksi spermatozoa AI',
      'Kalibrasi bilik hitung preparat (Makler 10µm / Leja 20µm) & skala piksel',
      'Input data fisik semen (volume, warna, bau, pH, viskositas, likuefaksi)',
      'Monitoring inferensi frame-by-frame dan peta panas pergerakan'
    ],
    restrictedFeatures: [
      'Hasil analisa berstatus "Menunggu Verifikasi Dokter" sebelum disahkan',
      'Tidak dapat menandatangani diagnosis klinis resmi pasien'
    ]
  }
};

const STORAGE_KEY = 'casa_ai_auth_user';

export function getAccounts() {
  return Object.values(ROLES);
}

export function getCurrentUser() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.role && ROLES[parsed.role]) {
      return {
        ...ROLES[parsed.role],
        ...parsed
      };
    }
  } catch {
    // fallback
  }
  return null;
}

export function login(usernameOrEmail, password) {
  const cleanInput = (usernameOrEmail || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  const matched = Object.values(ROLES).find((r) => {
    return (
      (r.username.toLowerCase() === cleanInput || r.email.toLowerCase() === cleanInput) &&
      r.password === cleanPass
    );
  });

  if (matched) {
    const userSession = {
      role: matched.id,
      name: matched.user,
      email: matched.email,
      loginAt: new Date().toISOString()
    };
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(userSession));
    }
    return { success: true, user: matched };
  }

  return { 
    success: false, 
    error: 'Username/Email atau Password tidak cocok. Silakan gunakan akun demo yang tersedia.' 
  };
}

export function loginAsRole(roleId) {
  if (ROLES[roleId]) {
    const matched = ROLES[roleId];
    const userSession = {
      role: matched.id,
      name: matched.user,
      email: matched.email,
      loginAt: new Date().toISOString()
    };
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(userSession));
    }
    return { success: true, user: matched };
  }
  return { success: false, error: 'Role tidak ditemukan' };
}

export function logout() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
