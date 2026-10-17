import { useId, useState } from 'react';
import { PARAMETER_HELP } from '../parameterHelp';
import '../parameter-help.css';

export default function ParameterHelp({ name }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const help = PARAMETER_HELP[name];
  if (!help) return null;
  return (
    <div className="parameter-help">
      <button type="button" className="parameter-help-button" aria-label={`Bantuan ${help.title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">?</span> {open ? 'Tutup bantuan' : 'Fungsi & cara pakai'}
      </button>
      {open && <div id={id} className="parameter-help-panel">
        <strong>{help.title}</strong>
        <p><b>Untuk apa:</b> {help.purpose}</p>
        <p><b>Cara pakai:</b> {help.how}</p>
        <p><b>Contoh / catatan:</b> {help.example}</p>
      </div>}
    </div>
  );
}
