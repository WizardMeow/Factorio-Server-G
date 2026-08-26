import { Activity, CircleStop, Play, RefreshCw, RotateCcw } from 'lucide-react';
import type { Overview } from '../api';

interface Props {
  overview: Overview;
  busy: boolean;
  onAction(path: string): void;
}

const statusClasses: Record<string, string> = {
  ready: 'bg-[var(--green)] shadow-[0_0_0_6px_#6ee7a01a,0_0_20px_#6ee7a078]',
  failed: 'bg-[#fb7185] shadow-[0_0_0_6px_#65716a14]',
  starting: 'bg-[#facc15] shadow-[0_0_0_6px_#65716a14]',
  stopping: 'bg-[#facc15] shadow-[0_0_0_6px_#65716a14]',
  pulling: 'bg-[#facc15] shadow-[0_0_0_6px_#65716a14]',
  'installing-mods': 'bg-[#facc15] shadow-[0_0_0_6px_#65716a14]',
  recreating: 'bg-[#facc15] shadow-[0_0_0_6px_#65716a14]',
};

export function ServerHero({ overview, busy, onAction }: Props) {
  const { server, operations, config } = overview;
  const latestFailure = server.status === 'failed' && operations.history[0]?.result === 'failed' ? operations.history[0] : undefined;
  return <section className="panel relative grid min-h-[146px] grid-cols-[1fr_auto] items-center overflow-hidden px-7 py-[26px] after:absolute after:top-[-120px] after:right-[18%] after:size-[260px] after:rounded-full after:bg-[#ff86230d] after:blur-[10px] after:content-[''] max-[850px]:grid-cols-1 max-[560px]:p-[21px]">
    <div className="z-[1] flex items-center gap-[17px]">
      <span className={`size-[13px] rounded-full ${statusClasses[server.status] ?? 'bg-[#64706a] shadow-[0_0_0_6px_#65716a14]'}`} />
      <div><span className="eyebrow">FACTORIO INSTANCE</span><h2 className="mt-[3px] mb-0.5 text-[27px] capitalize max-[560px]:text-[22px]">{server.status === 'ready' ? 'Server Online' : server.status.replace('-', ' ')}</h2><p className="m-0 font-mono text-[11px] text-[#7e8882]">{server.image || `factoriotools/factorio:${config.version}`}</p></div>
    </div>
    <div className="z-[1] flex gap-[9px] max-[850px]:mt-5 max-[560px]:flex-wrap">
      {!server.running
        ? <button className="primary" disabled={busy} onClick={() => onAction('/api/server/start')}><Play size={16} />Start</button>
        : <button disabled={busy} onClick={() => onAction('/api/server/stop')}><CircleStop size={16} />Stop</button>}
      <button disabled={busy || !server.running} onClick={() => onAction('/api/server/restart')}><RefreshCw size={16} />Restart</button>
    </div>
    {operations.active && <div className="relative col-span-full mt-5 flex items-center gap-[9px] border-t border-[#242a27] pt-[17px] text-xs text-[#9ea7a2]"><Activity className="animate-[spin_1.4s_linear_infinite] text-[var(--orange)]" size={16} /><span>{operations.active.kind}</span><b className="ml-auto font-mono text-[9px] tracking-[.14em] text-[var(--orange)] uppercase">{operations.active.stage}</b><div className="absolute bottom-[-1px] left-0 h-px w-[35%] animate-[progress_2s_ease-in-out_infinite] bg-[var(--orange)] shadow-[0_0_8px_var(--orange)]" /></div>}
    {!operations.active && (latestFailure || overview.modRollbackAvailable) && <div className="col-span-full mt-[17px] flex items-center justify-between gap-3.5 border-t border-[#392326] pt-[15px] text-[11px] text-[#fb7185]">
      {latestFailure ? <span><b className="mb-[3px] block text-[9px] tracking-[.12em] uppercase">{latestFailure.kind} failed</b>{latestFailure.error || 'Inspect logs for details'}</span> : <span>Previous Mod generation available</span>}
      {overview.modRollbackAvailable && <button disabled={busy || server.running} onClick={() => onAction('/api/mods/rollback')}><RotateCcw size={15} />Rollback mods</button>}
    </div>}
  </section>;
}
