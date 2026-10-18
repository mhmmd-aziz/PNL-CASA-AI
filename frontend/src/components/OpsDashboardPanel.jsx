import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, CalendarRange, FileDown, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';
import {
  PRESETS,
  SERIES,
  STATUS_OPTIONS,
  exportFileName,
  formatBucket,
  formatNumber,
  hasAnyActivity,
  presetRange,
  validateRange,
  xLabelIndexes,
  yTicks
} from '../opsDashboard.js';

async function errorMessage(error) {
  let detail = error.response?.data?.detail;
  // Unduhan memakai responseType blob, jadi pesan galat perlu dibaca dari blob
  if (!detail && error.response?.data instanceof Blob) {
    try {
      detail = JSON.parse(await error.response.data.text()).detail;
    } catch {
      detail = null;
    }
  }
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server.';
  return 'Permintaan gagal. Coba lagi.';
}

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function StatTile({ label, value, note, hero }) {
  return (
    <div className="viz-tile">
      <div className="viz-tile-label">{label}</div>
      <div className={hero ? 'viz-tile-value viz-hero' : 'viz-tile-value'}>{value}</div>
      {note && <div className="viz-tile-note">{note}</div>}
    </div>
  );
}

function Legend() {
  return (
    <div className="viz-legend" aria-hidden="true">
      {SERIES.map((series) => (
        <span key={series.key} className="viz-legend-item">
          <span className="viz-legend-key" style={{ background: series.color }} />
          {series.label}
        </span>
      ))}
    </div>
  );
}

const MARGIN = { top: 12, right: 16, bottom: 28, left: 40 };
const HEIGHT = 240;

function TrendChart({ series, granularity }) {
  const [wrapRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const peak = Math.max(0, ...series.flatMap((item) => SERIES.map((s) => item[s.key])));
  const ticks = yTicks(peak);
  const top = ticks[ticks.length - 1];
  const x = (i) => MARGIN.left + (series.length === 1 ? plotWidth / 2 : (i / (series.length - 1)) * plotWidth);
  const y = (v) => MARGIN.top + plotHeight - (v / top) * plotHeight;
  const labelIndexes = xLabelIndexes(series.length, Math.max(2, Math.floor(plotWidth / 80)));

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left - MARGIN.left;
    const index = series.length === 1 ? 0 : Math.round((px / plotWidth) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, index)));
  };

  const active = hover == null ? null : series[hover];
  const tooltipLeft = hover == null ? 0 : Math.min(Math.max(x(hover) + 12, 0), Math.max(width - 190, 0));

  return (
    <div ref={wrapRef} className="viz-plot" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Grafik tren pemeriksaan, analisis, dan laporan. Data lengkap tersedia di tabel data."
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'viz-baseline' : 'viz-grid'} />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="viz-axis">{formatNumber(tick)}</text>
            </g>
          ))}
          {labelIndexes.map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 && series.length > 1 ? 'start' : i === series.length - 1 && series.length > 1 ? 'end' : 'middle'} className="viz-axis">
              {formatBucket(series[i].bucket, granularity)}
            </text>
          ))}
          {active && <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} className="viz-crosshair" />}
          {SERIES.map((s) => (
            <g key={s.key}>
              {series.length > 1 && (
                <polyline
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={series.map((item, i) => `${x(i)},${y(item[s.key])}`).join(' ')}
                />
              )}
              {(series.length === 1 || active) && (
                <circle
                  cx={x(hover ?? 0)}
                  cy={y((active || series[0])[s.key])}
                  r="4"
                  fill={s.color}
                  stroke="var(--viz-surface)"
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
          <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} fill="transparent" />
        </svg>
      )}
      {active && (
        <div className="viz-tooltip" style={{ left: tooltipLeft, top: 8 }} role="status">
          <div className="viz-tooltip-title">{formatBucket(active.bucket, granularity)}</div>
          {SERIES.map((s) => (
            <div key={s.key} className="viz-tooltip-row">
              <span className="viz-legend-key" style={{ background: s.color }} />
              <span>{s.label}</span>
              <strong>{formatNumber(active[s.key])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBars({ rows }) {
  const [hover, setHover] = useState(null);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p className="viz-empty">Tidak ada pemeriksaan pada rentang ini.</p>;
  return (
    <div className="viz-bars">
      {rows.map((row) => (
        <div
          key={row.status}
          className="viz-bar-row"
          onMouseEnter={() => setHover(row.status)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="viz-bar-label">{row.label}</span>
          <span className="viz-bar-track">
            <span className="viz-bar" style={{ width: `${(row.count / max) * 100}%` }} />
            {hover === row.status && (
              <span className="viz-tooltip viz-bar-tooltip" role="status">
                {row.label}: {formatNumber(row.count)} ({formatNumber((row.count / total) * 100)}%)
              </span>
            )}
          </span>
          <span className="viz-bar-value">{formatNumber(row.count)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OpsDashboardPanel() {
  const initial = presetRange('30d');
  const [preset, setPreset] = useState('30d');
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [showTable, setShowTable] = useState(false);
  const rangeError = validateRange(start, end);

  const load = useCallback(async () => {
    if (validateRange(start, end)) return;
    setLoading(true);
    setError('');
    try {
      const { data: result } = await axios.get(`${API_BASE_URL}/api/admin/dashboard`, {
        params: { start, end, ...(status ? { status } : {}) },
        headers: getAuthHeader()
      });
      setData(result);
    } catch (err) {
      setError(await errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [start, end, status]);

  useEffect(() => { load(); }, [load]);

  const choosePreset = (id) => {
    const range = presetRange(id);
    setPreset(id);
    setStart(range.start);
    setEnd(range.end);
  };

  const download = async (format) => {
    setDownloading(format);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/dashboard/export`, {
        params: { format, start, end, ...(status ? { status } : {}) },
        headers: getAuthHeader(),
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(start, end, format);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(await errorMessage(err));
    } finally {
      setDownloading('');
    }
  };

  const summary = data?.summary;
  const granularity = data?.range.granularity;

  return (
    <div className="viz-root" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Dashboard operasional</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--viz-text-secondary)' }}>
          Ringkasan laboratorium per tanggal WIB. Laporan tidak memuat identitas pasien dan bukan hasil klinis.
        </p>
      </div>

      <div className="viz-filters" role="group" aria-label="Filter dashboard">
        <div className="viz-presets">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`viz-chip ${preset === item.id ? 'active' : ''}`}
              aria-pressed={preset === item.id}
              onClick={() => choosePreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="viz-field">
          <span><CalendarRange size={13} /> Dari</span>
          <input type="date" className="search-box" value={start} max={end || undefined} onChange={(e) => { setStart(e.target.value); setPreset('custom'); }} />
        </label>
        <label className="viz-field">
          <span>Sampai</span>
          <input type="date" className="search-box" value={end} min={start || undefined} onChange={(e) => { setEnd(e.target.value); setPreset('custom'); }} />
        </label>
        <label className="viz-field">
          <span>Status</span>
          <select className="search-box" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="viz-actions">
          <button type="button" className="action-pill-btn secondary" onClick={load} disabled={loading || !!rangeError} title="Muat ulang">
            <RefreshCw size={13} /> Muat ulang
          </button>
          <button type="button" className="action-pill-btn secondary" onClick={() => download('pdf')} disabled={!!downloading || !!rangeError}>
            <FileDown size={13} /> {downloading === 'pdf' ? 'Menyiapkan…' : 'Unduh PDF'}
          </button>
          <button type="button" className="action-pill-btn secondary" onClick={() => download('xlsx')} disabled={!!downloading || !!rangeError}>
            <FileSpreadsheet size={13} /> {downloading === 'xlsx' ? 'Menyiapkan…' : 'Unduh Excel'}
          </button>
        </div>
      </div>

      {(rangeError || error) && (
        <p role="alert" className="viz-error"><AlertCircle size={14} /> {rangeError || error}</p>
      )}

      {loading && !data && <p className="viz-empty">Memuat dashboard…</p>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          <div className="viz-tiles">
            <StatTile hero label="Pemeriksaan terdaftar" value={formatNumber(summary.registered)} note={data.filters.status_label} />
            <StatTile label="Analisis selesai" value={formatNumber(summary.analyzed)} />
            <StatTile label="Laporan dirilis" value={formatNumber(summary.released)} />
            <StatTile
              label="Rata-rata registrasi sampai rilis"
              value={summary.avg_turnaround_hours == null ? '—' : `${formatNumber(summary.avg_turnaround_hours)} jam`}
              note={`dari ${formatNumber(summary.turnaround_samples)} laporan`}
            />
            <StatTile label="Login gagal" value={formatNumber(data.security.login_failed)} note="semua status" />
            <StatTile label="Pemaksaan (override)" value={formatNumber(data.security.overrides)} note="semua status" />
          </div>

          {!hasAnyActivity(data) ? (
            <p className="viz-empty">Belum ada aktivitas pada {data.range.start} s.d. {data.range.end}. Coba perluas rentang tanggal.</p>
          ) : (
            <>
              <section className="viz-card">
                <div className="viz-card-head">
                  <div>
                    <h3>Tren per {granularity === 'day' ? 'hari' : 'bulan'}</h3>
                    <p>{data.range.start} s.d. {data.range.end} · {data.range.timezone}</p>
                  </div>
                  <button type="button" className="action-pill-btn secondary" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
                    {showTable ? 'Sembunyikan tabel' : 'Lihat tabel data'}
                  </button>
                </div>
                <Legend />
                <TrendChart series={data.series} granularity={granularity} />
                {showTable && (
                  <div className="viz-table-wrap">
                    <table className="casa-table" style={{ fontSize: '0.78rem' }}>
                      <thead>
                        <tr><th>{granularity === 'day' ? 'Tanggal' : 'Bulan'}</th>{SERIES.map((s) => <th key={s.key}>{s.label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {data.series.map((item) => (
                          <tr key={item.bucket}>
                            <td>{formatBucket(item.bucket, granularity)}</td>
                            {SERIES.map((s) => <td key={s.key} className="viz-num">{formatNumber(item[s.key])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <div className="viz-two-col">
                <section className="viz-card">
                  <div className="viz-card-head"><div><h3>Status pemeriksaan</h3><p>Pemeriksaan yang terdaftar pada rentang ini</p></div></div>
                  <StatusBars rows={data.status_distribution} />
                </section>
                <section className="viz-card">
                  <div className="viz-card-head"><div><h3>Aktivitas audit teratas</h3><p>{formatNumber(data.security.audit_events)} kejadian · {formatNumber(data.security.failed_actions)} gagal</p></div></div>
                  {data.security.top_actions.length ? (
                    <div className="viz-table-wrap">
                      <table className="casa-table" style={{ fontSize: '0.78rem' }}>
                        <thead><tr><th>Aksi</th><th>Jumlah</th><th>Gagal</th></tr></thead>
                        <tbody>
                          {data.security.top_actions.map((item) => (
                            <tr key={item.action_type}>
                              <td>{item.action_type}</td>
                              <td className="viz-num">{formatNumber(item.count)}</td>
                              <td className="viz-num">{formatNumber(item.failures)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="viz-empty">Tidak ada aktivitas audit.</p>}
                </section>
              </div>

              <section className="viz-card">
                <div className="viz-card-head">
                  <div>
                    <h3>Daftar pemeriksaan</h3>
                    <p>{data.examinations_truncated ? `Menampilkan ${data.examinations.length} terbaru; unduhan memuat lebih banyak.` : `${data.examinations.length} pemeriksaan`}</p>
                  </div>
                </div>
                {data.examinations.length ? (
                  <div className="viz-table-wrap">
                    <table className="casa-table" style={{ fontSize: '0.78rem' }}>
                      <thead><tr><th>Kode sampel</th><th>Status</th><th>Terdaftar (WIB)</th><th>Dirilis (WIB)</th></tr></thead>
                      <tbody>
                        {data.examinations.map((item) => (
                          <tr key={item.sample_code}>
                            <td className="sample-id-cell">{item.sample_code}</td>
                            <td>{item.status_label}</td>
                            <td className="viz-num">{item.registered_at}</td>
                            <td className="viz-num">{item.released_at || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="viz-empty">Tidak ada pemeriksaan pada rentang ini.</p>}
              </section>
            </>
          )}
          <p style={{ fontSize: '0.7rem', color: 'var(--viz-text-muted)' }}>Diperbarui {data.generated_at}. Filter status tidak berlaku untuk data login dan audit.</p>
        </div>
      )}
    </div>
  );
}
