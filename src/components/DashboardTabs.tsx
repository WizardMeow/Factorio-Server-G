import * as Tabs from '@radix-ui/react-tabs';
import { Activity, Archive, FileTerminal, LockKeyhole, SlidersHorizontal } from 'lucide-react';
import type { LogEntry, Overview } from '../api';
import { LogPanel } from './LogPanel';
import { ModPlanner } from './ModPlanner';
import { SaveManager, StartupSaveCard } from './SavePanels';
import { ServerHero } from './ServerHero';
import { VersionCard } from './VersionCard';
import { ProfileSwitcher } from './ProfileSwitcher';
import { RuntimeOverview } from './RuntimeOverview';

interface Props {
  overview: Overview;
  logs: LogEntry[];
  logStream: 'connecting' | 'live' | 'retrying';
  logHistoryLoaded: boolean;
  clearLogs(source: LogEntry['source']): void;
  refresh(): Promise<void>;
  mutate(path: string, body?: unknown, method?: string): Promise<void>;
  uploadSave(file?: File): Promise<void>;
  quickImportProfile(file?: File): Promise<void>;
}

export function DashboardTabs({ overview, logs, logStream, logHistoryLoaded, clearLogs, refresh, mutate, uploadSave, quickImportProfile }: Props) {
  const busy = Boolean(overview.operations.active);
  const tabClass = 'group min-w-[164px] justify-start border-0 bg-transparent px-[15px] py-2.5 text-[#707a74] data-[state=active]:bg-[#1a1f1c] data-[state=active]:text-[#e1e6e3] data-[state=active]:shadow-[inset_0_0_0_1px_#303632] max-[560px]:min-w-0 max-[560px]:flex-1 max-[560px]:px-[9px]';
  const tabLabelClass = 'grid gap-0.5 text-left text-xs';
  const tabHintClass = 'font-mono text-[8px] tracking-[.15em] text-[#4e5752] group-data-[state=active]:text-[#8a948e]';
  return <Tabs.Root className="flex flex-col gap-[18px]" defaultValue={overview.server.running ? 'observe' : 'configure'}>
    <Tabs.List className="flex w-max gap-1 rounded-[10px] border border-[#292e2b] bg-[#0c0f0e] p-1 max-[560px]:w-full" aria-label="服务器工作区">
      <Tabs.Trigger className={tabClass} value="configure"><SlidersHorizontal className="group-data-[state=active]:text-[var(--orange)]" size={16} /><span className={tabLabelClass}>启动配置<small className={tabHintClass}>PRE-FLIGHT</small></span></Tabs.Trigger>
      <Tabs.Trigger className={tabClass} value="saves"><Archive className="group-data-[state=active]:text-[var(--orange)]" size={16} /><span className={tabLabelClass}>存档管理<small className={tabHintClass}>RECOVERY</small></span></Tabs.Trigger>
      <Tabs.Trigger className={tabClass} value="observe"><Activity className="group-data-[state=active]:text-[var(--orange)]" size={16} /><span className={tabLabelClass}>运行观察<small className={tabHintClass}>LIVE OPS</small></span></Tabs.Trigger>
      <Tabs.Trigger className={tabClass} value="logs"><FileTerminal className="group-data-[state=active]:text-[var(--orange)]" size={16} /><span className={tabLabelClass}>日志<small className={tabHintClass}>OUTPUT</small></span></Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content className="outline-none" value="configure">
      {overview.server.running && <div className="mb-4 flex items-center gap-3 rounded-lg border border-[#49361f] bg-[#24190f] px-4 py-[13px] text-[11px] text-[#bd9b78]"><LockKeyhole className="shrink-0 text-[var(--orange)]" size={17} /><span className="grid gap-[3px]"><b className="text-[#e2c6a8]">服务器运行中，配置已锁定</b>停止服务器后可修改游戏版本与模组。</span></div>}
      <div className="grid gap-4">
        <ProfileSwitcher profiles={overview.profiles} disabled={busy || overview.server.running} onAction={mutate} onQuickImport={quickImportProfile} />
        <VersionCard current={overview.config.version} channel={overview.config.channel} busy={busy} running={overview.server.running} onApply={(version, channel) => mutate('/api/config/version', { version, channel }, 'PUT')} />
        <ModPlanner mods={overview.mods} busy={busy} running={overview.server.running} onSaved={refresh} />
      </div>
    </Tabs.Content>

    <Tabs.Content className="outline-none" value="saves">
      <div className="grid grid-cols-[310px_minmax(0,1fr)] items-start gap-4 max-[850px]:grid-cols-1">
        <StartupSaveCard save={overview.saves.selected} />
        <SaveManager saves={overview.saves} busy={busy} running={overview.server.running} onAction={mutate} onUpload={uploadSave} />
      </div>
    </Tabs.Content>

    <Tabs.Content className="outline-none" value="observe">
      <ServerHero overview={overview} busy={busy} onAction={mutate} />
      <RuntimeOverview overview={overview} />
    </Tabs.Content>

    <Tabs.Content className="outline-none" value="logs">
      <div className="mt-4 grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1">
        <LogPanel eyebrow="LIFECYCLE" title="Startup Process" logs={logs.filter(entry => entry.source === 'startup')} stream={logStream} historyLoaded={logHistoryLoaded} onClear={() => clearLogs('startup')} />
        <LogPanel eyebrow="FACTORIO OUTPUT" title="Game Logs" logs={logs.filter(entry => entry.source === 'game')} stream={logStream} historyLoaded={logHistoryLoaded} onClear={() => clearLogs('game')} />
        <LogPanel eyebrow="DOCKER COMPOSE" title="Container Operations" logs={logs.filter(entry => entry.source === 'container')} stream={logStream} historyLoaded={logHistoryLoaded} onClear={() => clearLogs('container')} />
      </div>
    </Tabs.Content>
  </Tabs.Root>;
}
