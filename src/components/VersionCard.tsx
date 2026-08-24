import { ChevronRight, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PanelHeader } from './PanelHeader';

interface Props { current: string; busy: boolean; running: boolean; onApply(version: string): void }

export function VersionCard({ current, busy, running, onApply }: Props) {
  const [version, setVersion] = useState(current);
  useEffect(() => setVersion(current), [current]);
  const disabled = busy || running;
  return <section className="panel compact">
    <PanelHeader eyebrow="RUNTIME" title="Game Version"><Server size={18} /></PanelHeader>
    <div className="version-row">
      <select value={version} onChange={event => setVersion(event.target.value)} disabled={disabled}><option value="latest">latest</option><option value="stable">stable</option></select>
      <input aria-label="Factorio 精确版本" value={version} onChange={event => setVersion(event.target.value)} disabled={disabled} />
      <button className="primary square" aria-label="应用 Factorio 版本" disabled={disabled || version === current} onClick={() => onApply(version)}><ChevronRight size={17} /></button>
    </div>
    <p className="hint">Stop the server to pull and recreate with another image.</p>
  </section>;
}
