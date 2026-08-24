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

export function StartupSaveCard({ save }: { save: SaveEntry | null }) {
  return <section className="panel pb-[17px] [&>div:first-child]:h-[62px]">
    <PanelHeader eyebrow="NEXT START" title="Startup Save"><Archive size={18} /></PanelHeader>
    <div className="mx-[17px] mt-[15px] flex min-h-[61px] items-center gap-[11px] rounded-lg border border-[#2d332f] bg-[#0d100f] p-2.5">{save ? <><div className="grid size-[38px] place-items-center rounded-md border border-[#454c48] font-mono text-[9px] text-[var(--orange)]">ZIP</div><div><b className="block overflow-hidden font-mono text-[11px] text-[#d8dedb] text-ellipsis">{save.name}</b><span className="mt-1 block text-[9px] text-[#606964]">{formatSize(save.size)} · {new Date(save.modifiedAt).toLocaleString()}</span></div></> : <div className="px-1 py-[13px] text-[11px] text-[#555e59]">Selected startup save is unavailable</div>}</div>
  </section>;
}

export function SaveManager({ saves, busy, running, onAction, onUpload }: Props) {
  const restoreDisabled = busy || running;
  return <section className="panel mt-4 overflow-hidden">
    <PanelHeader eyebrow="RECOVERY" title="Saves & Backups">
      <label className="upload h-[34px]"><Upload size={15} />普通导入<input className="hidden" type="file" accept=".zip" onChange={event => { onUpload(event.target.files?.[0]); event.target.value = ''; }} /></label>
    </PanelHeader>
    <div className="grid grid-cols-3 max-[850px]:grid-cols-1 [&>div]:min-w-0 [&>div]:px-[19px] [&>div]:pt-[17px] [&>div]:pb-[21px] [&>div+div]:border-l [&>div+div]:border-[#242a27] max-[850px]:[&>div+div]:border-t max-[850px]:[&>div+div]:border-l-0">
      <SaveList kind="imports" title="Imports" entries={saves.imports} selected={saves.nextLaunch.kind === 'imports' ? saves.nextLaunch.name : undefined} onAction={onAction} disabled={restoreDisabled} removable />
      <SaveList kind="autosaves" title="Autosaves" entries={saves.autosaves} selected={saves.nextLaunch.kind === 'autosaves' ? saves.nextLaunch.name : undefined} onAction={onAction} disabled={restoreDisabled} />
      <SaveList kind="backups" title="Backups" entries={saves.backups} selected={saves.nextLaunch.kind === 'backups' ? saves.nextLaunch.name : undefined} onAction={onAction} disabled={restoreDisabled} removable />
    </div>
  </section>;
}

function SaveList({ kind, title, entries, onAction, disabled, selected, removable }: { kind: 'autosaves' | 'imports' | 'backups'; title: string; entries: SaveEntry[]; onAction(path: string, body: unknown): void; disabled?: boolean; selected?: string; removable?: boolean }) {
  const actionClass = 'grid size-[27px] place-items-center rounded-[5px] border border-[#303633] bg-[#171b19] p-0 text-[#929b96]';
  return <div><h4 className="mt-0 mb-[11px] text-[11px] tracking-[.08em] text-[#8c9690] uppercase">{title}<span className="float-right rounded-[9px] bg-[#252a27] px-1.5 py-px font-mono text-[9px]">{entries.length}</span></h4><div className="flex flex-col gap-[7px]">
    {entries.length ? entries.map(entry => <div className="flex h-[54px] items-center justify-between gap-1.5 rounded-[7px] border border-[#282e2b] bg-[#0c0f0e] px-[9px] py-2" key={entry.name}>
      <div className="min-w-0"><b className="block overflow-hidden font-mono text-[11px] text-[#d8dedb] text-ellipsis">{entry.name}{entry.name === selected && <em className="ml-1.5 font-mono text-[8px] text-[var(--orange)] uppercase">next launch</em>}</b><span className="mt-1 block text-[9px] text-[#606964]">{formatSize(entry.size)} · modified {new Date(entry.modifiedAt).toLocaleString()}</span></div>
      <div className="flex gap-1"><a className={actionClass} aria-label={`下载 ${entry.name}`} href={`/api/saves/${kind}/${encodeURIComponent(entry.name)}/download`} download><Download size={14} /></a>
        <button className={actionClass} aria-label={`备份 ${entry.name}`} disabled={disabled} onClick={() => onAction('/api/saves/backup-entry', { kind, name: entry.name })}><Archive size={14} /></button>
        {removable && <button className={actionClass} aria-label={`删除 ${entry.name}`} disabled={disabled || entry.name === selected} onClick={() => onAction('/api/saves/delete', { kind, name: entry.name })}><Trash2 size={14} /></button>}
        <button className={actionClass} aria-label={`下次启动使用 ${entry.name}`} disabled={disabled || entry.name === selected} onClick={() => onAction('/api/saves/next-launch', { kind, name: entry.name })}><Play size={14} /></button></div>
    </div>) : <div className="px-1 py-[13px] text-[11px] text-[#555e59]">Nothing here yet</div>}
  </div></div>;
}

function formatSize(bytes: number) { return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
