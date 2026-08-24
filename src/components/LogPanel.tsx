import { Pause, Play, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelHeader } from './PanelHeader';

export function LogPanel({ logs, onClear }: { logs: string[]; onClear(): void }) {
  const [filter, setFilter] = useState('');
  const [following, setFollowing] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const visibleLogs = useMemo(() => logs.filter(line => line.toLowerCase().includes(filter.toLowerCase())), [logs, filter]);

  useEffect(() => { if (following) end.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs, following]);

  return <section className="panel logs-panel">
    <PanelHeader eyebrow="LIVE OUTPUT" title="Docker Logs">
      <div className="log-tools">
        <label><Search size={14} /><input aria-label="过滤日志" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter logs…" /></label>
        <button className="icon" aria-label={following ? '暂停日志跟随' : '恢复日志跟随'} onClick={() => setFollowing(value => !value)}>{following ? <Pause size={15} /> : <Play size={15} />}</button>
        <button className="ghost" onClick={onClear}>Clear</button>
      </div>
    </PanelHeader>
    <div className="terminal" onScroll={event => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight > 24) setFollowing(false); }}>
      {visibleLogs.length ? visibleLogs.map((line, index) => <div key={`${index}-${line}`}><span>{String(index + 1).padStart(3, '0')}</span>{line}</div>) : <div className="empty-log">Waiting for Factorio output…</div>}
      <div ref={end} />
    </div>
  </section>;
}
