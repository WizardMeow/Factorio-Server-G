import type { ReactNode } from 'react';
import { Archive, Download, RotateCcw, Upload } from 'lucide-react';
import type { Overview, SaveEntry } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props {
  saves: Overview['saves'];
  busy: boolean;
  running: boolean;
  onAction(path: string, body?: unknown): void;
  onUpload(file?: File): void;
}

export function MainSaveCard({ save, busy, onBackup }: { save: SaveEntry | null; busy: boolean; onBackup(): void }) {
  return <section className="panel compact">
    <PanelHeader eyebrow="ACTIVE WORLD" title="Main Save"><Archive size={18} /></PanelHeader>
    <div className="save-card">{save ? <><div className="file-icon">ZIP</div><div><b>{save.name}</b><span>{formatSize(save.size)} · {new Date(save.modifiedAt).toLocaleString()}</span></div></> : <div className="empty">No save.zip imported yet</div>}</div>
    <button className="wide" disabled={busy || !save} onClick={onBackup}><Archive size={15} />Create consistent backup</button>
  </section>;
}

export function SaveManager({ saves, busy, running, onAction, onUpload }: Props) {
  const restoreDisabled = busy || running;
  return <section className="panel saves">
    <PanelHeader eyebrow="RECOVERY" title="Saves & Backups">
      <label className="upload"><Upload size={15} />Import .zip<input type="file" accept=".zip" onChange={event => onUpload(event.target.files?.[0])} /></label>
    </PanelHeader>
    <div className="save-columns">
      <SaveList title="Imports" entries={saves.imports} action={entry => onAction('/api/saves/promote', { kind: 'imports', name: entry.name })} actionIcon={<RotateCcw size={14} />} disabled={restoreDisabled} />
      <SaveList title="Autosaves" entries={saves.autosaves} />
      <SaveList title="Backups" entries={saves.backups} action={entry => onAction('/api/saves/promote', { kind: 'backups', name: entry.name })} actionIcon={<RotateCcw size={14} />} download disabled={restoreDisabled} />
    </div>
  </section>;
}

function SaveList({ title, entries, action, actionIcon, download, disabled }: { title: string; entries: SaveEntry[]; action?: (entry: SaveEntry) => void; actionIcon?: ReactNode; download?: boolean; disabled?: boolean }) {
  return <div><h4>{title}<span>{entries.length}</span></h4><div className="save-list">
    {entries.length ? entries.map(entry => <div className="save-row" key={entry.name}>
      <div><b>{entry.name}</b><span>{formatSize(entry.size)} · {new Date(entry.modifiedAt).toLocaleDateString()}</span></div>
      <div>{download && <a aria-label={`下载 ${entry.name}`} href={`/api/saves/backups/${encodeURIComponent(entry.name)}`}><Download size={14} /></a>}{action && <button aria-label={`恢复 ${entry.name}`} disabled={disabled} onClick={() => action(entry)}>{actionIcon}</button>}</div>
    </div>) : <div className="empty">Nothing here yet</div>}
  </div></div>;
}

function formatSize(bytes: number) { return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
