import { Archive, Download, Play, Trash2, Upload } from 'lucide-react';
import type { Overview, SaveEntry } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props {
  saves: Overview['saves'];
  busy: boolean;
  running: boolean;
  onAction(path: string, body?: unknown): void;
  onUpload(file?: File): void;
}

export function MainSaveCard({ save }: { save: SaveEntry | null }) {
  return <section className="panel compact">
    <PanelHeader eyebrow="NEXT START" title="Startup Save"><Archive size={18} /></PanelHeader>
    <div className="save-card">{save ? <><div className="file-icon">ZIP</div><div><b>{save.name}</b><span>{formatSize(save.size)} · {new Date(save.modifiedAt).toLocaleString()}</span></div></> : <div className="empty">Selected startup save is unavailable</div>}</div>
  </section>;
}

export function SaveManager({ saves, busy, running, onAction, onUpload }: Props) {
  const restoreDisabled = busy || running;
  return <section className="panel saves">
    <PanelHeader eyebrow="RECOVERY" title="Saves & Backups">
      <label className="upload"><Upload size={15} />Import .zip<input type="file" accept=".zip" onChange={event => onUpload(event.target.files?.[0])} /></label>
    </PanelHeader>
    <div className="save-columns">
      <SaveList kind="imports" title="Imports" entries={saves.imports} selected={saves.nextLaunch.kind === 'imports' ? saves.nextLaunch.name : undefined} onAction={onAction} disabled={restoreDisabled} removable />
      <SaveList kind="autosaves" title="Autosaves" entries={saves.autosaves} selected={saves.nextLaunch.kind === 'autosaves' ? saves.nextLaunch.name : undefined} onAction={onAction} disabled={restoreDisabled} />
      <SaveList kind="backups" title="Backups" entries={saves.backups} selected={saves.nextLaunch.kind === 'backups' ? saves.nextLaunch.name : undefined} onAction={onAction} download disabled={restoreDisabled} removable />
    </div>
  </section>;
}

function SaveList({ kind, title, entries, onAction, download, disabled, selected, removable }: { kind: 'autosaves' | 'imports' | 'backups'; title: string; entries: SaveEntry[]; onAction(path: string, body: unknown): void; download?: boolean; disabled?: boolean; selected?: string; removable?: boolean }) {
  return <div><h4>{title}<span>{entries.length}</span></h4><div className="save-list">
    {entries.length ? entries.map(entry => <div className="save-row" key={entry.name}>
      <div><b>{entry.name}{entry.name === selected && <em className="active-save">next launch</em>}</b><span>{formatSize(entry.size)} · modified {new Date(entry.modifiedAt).toLocaleString()}</span></div>
      <div>{download && <a aria-label={`下载 ${entry.name}`} href={`/api/saves/backups/${encodeURIComponent(entry.name)}`}><Download size={14} /></a>}
        <button aria-label={`备份 ${entry.name}`} disabled={disabled} onClick={() => onAction('/api/saves/backup-entry', { kind, name: entry.name })}><Archive size={14} /></button>
        {removable && <button aria-label={`删除 ${entry.name}`} disabled={disabled || entry.name === selected} onClick={() => onAction('/api/saves/delete', { kind, name: entry.name })}><Trash2 size={14} /></button>}
        <button aria-label={`下次启动使用 ${entry.name}`} disabled={disabled || entry.name === selected} onClick={() => onAction('/api/saves/next-launch', { kind, name: entry.name })}><Play size={14} /></button></div>
    </div>) : <div className="empty">Nothing here yet</div>}
  </div></div>;
}

function formatSize(bytes: number) { return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
