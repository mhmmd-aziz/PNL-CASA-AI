import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './api.js';
import { getAuthHeader } from './auth.js';

export const DEFAULT_CALIBRATION = {
  pixel_scale: 0.8,
  fps: 30,
  fps_mode: 'auto',
  chamber_type: 'custom',
  chamber_depth: 20,
  dilution_factor: 1,
  prog_speed_threshold: 25,
  prog_linearity_threshold: 0.8,
  immotile_speed_threshold: 5,
};

export const CHAMBER_DEPTHS = { makler: 10, leja: 20, neubauer: 100 };
const CALIBRATION_URL = `${API_BASE_URL}/api/calibration`;

export function getErrorMessage(error) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((entry) => entry.msg).join('; ');
  return typeof detail === 'string' ? detail : error.message || 'Terjadi kesalahan.';
}

export function formatMotility(data, field) {
  if (data?.summary?.motility_available === false) return 'N/A';
  const value = data?.summary?.[field];
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'N/A';
}

export function formatMotion(data, field, multiplier = 1) {
  if (data?.summary?.motility_available === false) return 'N/A';
  const value = data?.motion?.[field];
  return Number.isFinite(value) ? (value * multiplier).toFixed(1) : 'N/A';
}

export function validateCalibration(calibration) {
  const positiveFields = ['pixel_scale', 'fps', 'chamber_depth', 'prog_speed_threshold'];
  for (const field of positiveFields) {
    if (!Number.isFinite(calibration[field]) || calibration[field] <= 0) {
      return `${field} harus berupa angka positif, bukan kosong atau nol.`;
    }
  }
  if (!Number.isFinite(calibration.dilution_factor) || calibration.dilution_factor < 1) {
    return 'Faktor pengenceran harus minimal 1.';
  }
  if (!Number.isFinite(calibration.prog_linearity_threshold) || calibration.prog_linearity_threshold < 0 || calibration.prog_linearity_threshold > 1) {
    return 'Ambang LIN harus berada pada rentang 0 sampai 1.';
  }
  if (!Number.isFinite(calibration.immotile_speed_threshold) || calibration.immotile_speed_threshold < 0 || calibration.immotile_speed_threshold > calibration.prog_speed_threshold) {
    return 'Ambang immotil harus antara 0 dan ambang kecepatan progresif.';
  }
  if (!['auto', 'manual'].includes(calibration.fps_mode)) return 'Mode FPS tidak valid.';
  if (!['custom', ...Object.keys(CHAMBER_DEPTHS)].includes(calibration.chamber_type)) return 'Tipe bilik tidak valid.';
  const presetDepth = CHAMBER_DEPTHS[calibration.chamber_type];
  if (presetDepth !== undefined && calibration.chamber_depth !== presetDepth) return 'Kedalaman tidak sesuai preset bilik.';
  return '';
}

export function useCalibration() {
  const [calibration, setCalibration] = useState({ ...DEFAULT_CALIBRATION });
  const [savedCalibration, setSavedCalibration] = useState(null);
  const [calibrationLoading, setCalibrationLoading] = useState(true);
  const [calibrationSaving, setCalibrationSaving] = useState(false);
  const [calibrationError, setCalibrationError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    axios.get(CALIBRATION_URL, { signal: controller.signal, headers: getAuthHeader() })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setCalibration(data);
        setSavedCalibration(data);
        setCalibrationError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCalibrationError(`Gagal memuat kalibrasi: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalibrationLoading(false);
      });
    return () => controller.abort();
  }, [reloadVersion]);

  const updateCalibration = (field, value) => {
    if (calibrationLoading || calibrationSaving) return;
    const nextValue = typeof value === 'number' && !Number.isFinite(value) ? '' : value;
    setCalibration((previous) => {
      const next = { ...previous, [field]: nextValue };
      if (field === 'chamber_type' && CHAMBER_DEPTHS[value] !== undefined) next.chamber_depth = CHAMBER_DEPTHS[value];
      if (field === 'chamber_depth' && CHAMBER_DEPTHS[next.chamber_type] !== nextValue) next.chamber_type = 'custom';
      return next;
    });
    setCalibrationError('');
  };

  const resetCalibration = () => {
    if (calibrationLoading || calibrationSaving) return;
    setCalibration({ ...DEFAULT_CALIBRATION });
    setCalibrationError('');
  };

  const ensureCalibration = () => {
    if (calibrationLoading) throw new Error('Tunggu hingga kalibrasi selesai dimuat.');
    if (!savedCalibration) throw new Error('Kalibrasi server belum dimuat. Periksa backend lalu muat ulang konfigurasi.');
    const validationError = validateCalibration(calibration);
    if (validationError) throw new Error(validationError);
  };

  const saveCalibration = async () => {
    try {
      ensureCalibration();
      setCalibrationSaving(true);
      const { data } = await axios.put(CALIBRATION_URL, calibration, { headers: getAuthHeader() });
      setCalibration(data);
      setSavedCalibration(data);
      setCalibrationError('');
      return data;
    } catch (error) {
      setCalibrationError(getErrorMessage(error));
      throw error;
    } finally {
      setCalibrationSaving(false);
    }
  };

  const appendCalibration = (formData, confidence) => {
    ensureCalibration();
    if (!Number.isFinite(confidence) || confidence <= 0 || confidence > 1) {
      throw new Error('Confidence threshold harus lebih besar dari 0 dan maksimal 1.');
    }
    formData.append('conf_thres', confidence);
    for (const [field, value] of Object.entries(calibration)) formData.append(field, value);
  };

  const reloadCalibration = () => {
    setCalibrationLoading(true);
    setReloadVersion((previous) => previous + 1);
  };

  return {
    calibration,
    updateCalibration,
    resetCalibration,
    saveCalibration,
    appendCalibration,
    reloadCalibration,
    calibrationLoading,
    calibrationSaving,
    calibrationError,
    calibrationDirty: savedCalibration !== null && JSON.stringify(calibration) !== JSON.stringify(savedCalibration),
    calibrationReady: !calibrationLoading && savedCalibration !== null && !validateCalibration(calibration),
  };
}
