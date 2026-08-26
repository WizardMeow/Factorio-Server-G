import { Pause, Play, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../api';
import { PanelHeader } from './PanelHeader';

const levelClasses: Record<LogEntry['level'], string> = {
  info: 'border-[#55605a] text-[#b8c0bc]', success: 'border-[#5fb77d] text-[#99dfb1]', warning: 'border-[#e5a94f] text-[#f0c57d]', error: 'border-[#e36a73] text-[#ffabb1]',
};
const levelLabels: Record<LogEntry['level'], string> = { info: '信息', success: '成功', warning: '警告', error: '错误' };
type LevelFilter = 'all' | LogEntry['level'];

function displayTime(timestamp?: string) {
  if (!timestamp) return 'LIVE';
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return 'LIVE';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(value);
}

export function LogPanel({ title, eyebrow, logs, stream, historyLoaded, onClear, compact = false }: { title: string; eyebrow: string; logs: LogEntry[]; stream: 'connecting' | 'live' | 'retrying'; historyLoaded: boolean; onClear(): void; compact?: boolean }) {
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [following, setFollowing] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const liveScrolling = useRef(false);
  const visibleLogs = useMemo(() => logs.filter(entry => (levelFilter === 'all' || entry.level === levelFilter) && entry.line.toLowerCase().includes(filter.toLowerCase())), [logs, filter, levelFilter]);
  const counts = useMemo(() => logs.reduce<Record<LevelFilter, number>>((result, entry) => ({ ...result, [entry.level]: result[entry.level] + 1, all: result.all + 1 }), { all: 0, info: 0, success: 0, warning: 0, error: 0 }), [logs]);

  useEffect(() => {
    if (following) end.current?.scrollIntoView({ behavior: liveScrolling.current ? 'smooth' : 'auto' });
    if (historyLoaded) liveScrolling.current = true;
  }, [visibleLogs, following, historyLoaded]);

  const dotClass = stream === 'live' ? 'bg-[var(--green)] shadow-[0_0_8px_var(--green)]' : stream === 'retrying' ? 'bg-[#facc15]' : 'bg-[#777]';
  return <section className={`panel overflow-hidden ${compact ? 'min-h-[385px]' : 'min-h-[520px]'}`}>
    <PanelHeader eyebrow={eyebrow} title={title}>
      <div className="flex items-center gap-1.5">
        <span className="mr-[3px] flex items-center gap-1.5 font-mono text-[8px] tracking-[.12em] text-[#77817b] uppercase max-[700px]:hidden"><i className={`size-1.5 rounded-full ${dotClass}`} />{stream}</span>
        <label className="flex h-[34px] w-[210px] items-center rounded-md border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#59625d] max-[850px]:w-[150px] max-[700px]:hidden"><Search size={14} /><input className="w-full border-0 bg-transparent pl-[7px] font-mono text-[11px] text-[#ccd3cf] outline-0" aria-label="过滤日志" value={filter} onChange={event => setFilter(event.target.value)} placeholder="搜索日志…" /></label>
        <button className="icon" aria-label={following ? '暂停日志跟随' : '恢复日志跟随'} onClick={() => setFollowing(value => !value)}>{following ? <Pause size={15} /> : <Play size={15} />}</button>
        <button className="ghost" onClick={onClear}>Clear</button>
      </div>
    </PanelHeader>
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[#252b28] bg-[#0c100e] px-4 py-2.5">
      {(['all', 'info', 'success', 'warning', 'error'] as LevelFilter[]).map(level => <button key={level} type="button" onClick={() => setLevelFilter(level)} className={`rounded border px-2 py-1 font-mono text-[9px] tracking-[.06em] transition-colors ${levelFilter === level ? 'border-[var(--orange)] bg-[#2c2114] text-[#f4bf7c]' : 'border-[#303632] bg-[#111512] text-[#78827c] hover:text-[#b8c0bc]'}`}>{level === 'all' ? '全部' : levelLabels[level]} <span className="opacity-70">{counts[level]}</span></button>)}
      <span className="ml-auto font-mono text-[9px] tracking-[.08em] text-[#58615c]">{following ? 'FOLLOWING' : 'PAUSED'} · {visibleLogs.length} EVENTS</span>
    </div>
    <div className={`${compact ? 'h-[318px]' : 'h-[420px]'} overflow-auto bg-[#090c0b] py-2 font-mono text-[11px] leading-[1.65] text-[#a8b1ac]`} onScroll={event => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight > 24) setFollowing(false); }}>
      {visibleLogs.length ? visibleLogs.map((entry, index) => <div className="grid grid-cols-[9px_60px_58px_minmax(0,1fr)] gap-x-2 border-l-2 border-transparent px-4 py-[7px] hover:bg-[#131715] max-[560px]:grid-cols-[8px_48px_minmax(0,1fr)]" key={`${entry.timestamp ?? 'live'}-${index}-${entry.line}`}><i className={`mt-[5px] size-1.5 rounded-full border ${levelClasses[entry.level]}`} /><time className="text-[9px] tracking-[.04em] text-[#65706a]">{displayTime(entry.timestamp)}</time><span className={`text-[8px] tracking-[.08em] ${levelClasses[entry.level]} max-[560px]:hidden`}>{levelLabels[entry.level]}</span><span className={`min-w-0 whitespace-pre-wrap break-words ${levelClasses[entry.level]}`}>{entry.line}</span></div>) : <div className="grid h-full place-items-center text-[#4d5651]">Waiting for {title.toLowerCase()}…</div>}
      <div ref={end} />
    </div>
  </section>;
}
