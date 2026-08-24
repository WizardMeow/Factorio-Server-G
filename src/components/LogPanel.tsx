import { Pause, Play, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelHeader } from './PanelHeader';

export function LogPanel({ title, eyebrow, logs, stream, historyLoaded, onClear }: { title: string; eyebrow: string; logs: string[]; stream: 'connecting' | 'live' | 'retrying'; historyLoaded: boolean; onClear(): void }) {
  const [filter, setFilter] = useState('');
  const [following, setFollowing] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const liveScrolling = useRef(false);
  const visibleLogs = useMemo(() => logs.filter(line => line.toLowerCase().includes(filter.toLowerCase())), [logs, filter]);

  useEffect(() => {
    if (following) end.current?.scrollIntoView({ behavior: liveScrolling.current ? 'smooth' : 'auto' });
    if (historyLoaded) liveScrolling.current = true;
  }, [logs, following, historyLoaded]);

  return <section className="panel logs-panel">
    <PanelHeader eyebrow={eyebrow} title={title}>
      <div className="log-tools">
        <span className={`stream-state ${stream}`}><i />{stream}</span>
        <label><Search size={14} /><input aria-label="过滤日志" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter logs…" /></label>
        <button className="icon" aria-label={following ? '暂停日志跟随' : '恢复日志跟随'} onClick={() => setFollowing(value => !value)}>{following ? <Pause size={15} /> : <Play size={15} />}</button>
        <button className="ghost" onClick={onClear}>Clear</button>
      </div>
    </PanelHeader>
    <div className="terminal" onScroll={event => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight > 24) setFollowing(false); }}>
      {visibleLogs.length ? visibleLogs.map((line, index) => <div key={`${index}-${line}`}><span>{String(index + 1).padStart(3, '0')}</span>{line}</div>) : <div className="empty-log">Waiting for {title.toLowerCase()}…</div>}
      <div ref={end} />
    </div>
  </section>;
}
