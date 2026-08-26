import { Pause, Play, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../api';
import { PanelHeader } from './PanelHeader';

const levelClasses: Record<LogEntry['level'], string> = {
  info: 'text-[#a8b1ac]', success: 'text-[#87cfa4]', warning: 'text-[#f2c178]', error: 'text-[#fb8b95]',
};

export function LogPanel({ title, eyebrow, logs, stream, historyLoaded, onClear }: { title: string; eyebrow: string; logs: LogEntry[]; stream: 'connecting' | 'live' | 'retrying'; historyLoaded: boolean; onClear(): void }) {
  const [filter, setFilter] = useState('');
  const [following, setFollowing] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const liveScrolling = useRef(false);
  const visibleLogs = useMemo(() => logs.filter(entry => entry.line.toLowerCase().includes(filter.toLowerCase())), [logs, filter]);

  useEffect(() => {
    if (following) end.current?.scrollIntoView({ behavior: liveScrolling.current ? 'smooth' : 'auto' });
    if (historyLoaded) liveScrolling.current = true;
  }, [logs, following, historyLoaded]);

  const dotClass = stream === 'live' ? 'bg-[var(--green)] shadow-[0_0_8px_var(--green)]' : stream === 'retrying' ? 'bg-[#facc15]' : 'bg-[#777]';
  return <section className="panel min-h-[485px] overflow-hidden">
    <PanelHeader eyebrow={eyebrow} title={title}>
      <div className="flex items-center gap-1.5">
        <span className="mr-[3px] flex items-center gap-1.5 font-mono text-[8px] tracking-[.12em] text-[#77817b] uppercase max-[560px]:hidden"><i className={`size-1.5 rounded-full ${dotClass}`} />{stream}</span>
        <label className="flex h-[34px] w-[190px] items-center rounded-md border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#59625d] max-[850px]:w-[130px] max-[560px]:hidden"><Search size={14} /><input className="w-full border-0 bg-transparent pl-[7px] font-mono text-[11px] text-[#ccd3cf] outline-0" aria-label="过滤日志" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter logs…" /></label>
        <button className="icon" aria-label={following ? '暂停日志跟随' : '恢复日志跟随'} onClick={() => setFollowing(value => !value)}>{following ? <Pause size={15} /> : <Play size={15} />}</button>
        <button className="ghost" onClick={onClear}>Clear</button>
      </div>
    </PanelHeader>
    <div className="h-[418px] overflow-auto bg-[#090c0b] pt-3.5 pb-[18px] font-mono text-[11px] leading-[1.75] text-[#a8b1ac]" onScroll={event => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight > 24) setFollowing(false); }}>
      {visibleLogs.length ? visibleLogs.map((entry, index) => <div className={`px-4 whitespace-pre-wrap break-words hover:bg-[#131715] ${levelClasses[entry.level]}`} key={`${index}-${entry.line}`}><span className="inline-block w-[42px] text-[#3f4843] select-none">{String(index + 1).padStart(3, '0')}</span><span className="mr-2 inline-block w-[39px] text-[8px] tracking-[.08em] opacity-70">{entry.level}</span>{entry.line}</div>) : <div className="grid h-full place-items-center text-[#4d5651]">Waiting for {title.toLowerCase()}…</div>}
      <div ref={end} />
    </div>
  </section>;
}
