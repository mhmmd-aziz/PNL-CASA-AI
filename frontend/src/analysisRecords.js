export function formatMeasurement(value, unit = '', digits = 1) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}` : 'Tidak tersedia';
}

export function createAnalysisRecord(result, metadata = {}) {
  if (!result?.data?.summary || result.isDemo || result.is_demo) {
    throw new Error('Hanya hasil inferensi aktual yang dapat disimpan.');
  }
  return {
    id: `SMP_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    patientName: metadata.patientName?.trim() || null,
    clinic: metadata.clinic?.trim() || null,
    sourceFile: metadata.sourceFile || null,
    data: structuredClone(result.data),
    videoUrl: result.video_url || null,
    heatmapUrl: result.heatmap_url || null,
    isImage: Boolean(result.isImage),
  };
}

export function exportAnalysisRecords(records) {
  if (!records.length) return;
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hasil-analisis-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
