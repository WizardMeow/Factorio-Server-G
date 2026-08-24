import { Activity, CircleStop, Play, RefreshCw, RotateCcw } from 'lucide-react';
import type { Overview } from '../api';

interface Props {
  overview: Overview;
  busy: boolean;
  onAction(path: string): void;
}

export function ServerHero({ overview, busy, onAction }: Props) {
  const { server, operations, config } = overview;
  const lastFailure = operations.history.find(item => item.result === 'failed');
  return <section className="hero panel">
    <div className="server-title">
      <span className={`status-dot ${server.status}`} />
      <div><span className="eyebrow">FACTORIO INSTANCE</span><h2>{server.status === 'ready' ? 'Server Online' : server.status.replace('-', ' ')}</h2><p>{server.image || `factoriotools/factorio:${config.version}`}</p></div>
    </div>
    <div className="actions">
      {!server.running
        ? <button className="primary" disabled={busy} onClick={() => onAction('/api/server/start')}><Play size={16} />Start</button>
        : <button disabled={busy} onClick={() => onAction('/api/server/stop')}><CircleStop size={16} />Stop</button>}
      <button disabled={busy || !server.running} onClick={() => onAction('/api/server/restart')}><RefreshCw size={16} />Restart</button>
    </div>
    {operations.active && <div className="operation"><Activity size={16} /><span>{operations.active.kind}</span><b>{operations.active.stage}</b><div className="operation-line" /></div>}
    {!operations.active && lastFailure && <div className="failure">
      <span><b>{lastFailure.kind} failed</b>{lastFailure.error || 'Inspect logs for details'}</span>
      {overview.modRollbackAvailable && <button disabled={busy || server.running} onClick={() => onAction('/api/mods/rollback')}><RotateCcw size={15} />Rollback mods</button>}
    </div>}
  </section>;
}
