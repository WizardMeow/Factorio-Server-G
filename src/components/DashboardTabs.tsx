import * as Tabs from '@radix-ui/react-tabs';
import { Activity, LockKeyhole, SlidersHorizontal } from 'lucide-react';
import type { Overview } from '../api';
import { LogPanel } from './LogPanel';
import { ModPlanner } from './ModPlanner';
import { MainSaveCard, SaveManager } from './SavePanels';
import { ServerHero } from './ServerHero';
import { VersionCard } from './VersionCard';

interface Props {
  overview: Overview;
  logs: string[];
  logStream: 'connecting' | 'live' | 'retrying';
  clearLogs(): void;
  mutate(path: string, body?: unknown, method?: string): Promise<void>;
  upload(file?: File): Promise<void>;
}

export function DashboardTabs({ overview, logs, logStream, clearLogs, mutate, upload }: Props) {
  const busy = Boolean(overview.operations.active);
  return <Tabs.Root className="workspace-tabs" defaultValue={overview.server.running ? 'observe' : 'configure'}>
    <Tabs.List className="tab-list" aria-label="服务器工作区">
      <Tabs.Trigger className="tab-trigger" value="configure"><SlidersHorizontal size={16} /><span>启动配置<small>PRE-FLIGHT</small></span></Tabs.Trigger>
      <Tabs.Trigger className="tab-trigger" value="observe"><Activity size={16} /><span>运行观察<small>LIVE OPS</small></span></Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content className="tab-content" value="configure">
      {overview.server.running && <div className="configuration-lock"><LockKeyhole size={17} /><span><b>服务器运行中，配置已锁定</b>停止服务器后可修改游戏版本、模组与启动存档。</span></div>}
      <div className="configuration-grid">
        <VersionCard current={overview.config.version} busy={busy} running={overview.server.running} onApply={version => mutate('/api/config/version', { version }, 'PUT')} />
        <SaveManager saves={overview.saves} busy={busy} running={overview.server.running} onAction={mutate} onUpload={upload} />
        <ModPlanner busy={busy} running={overview.server.running} onApply={planId => mutate('/api/mods/apply', { planId })} />
      </div>
    </Tabs.Content>

    <Tabs.Content className="tab-content" value="observe">
      <ServerHero overview={overview} busy={busy} onAction={mutate} />
      <div className="dashboard-grid">
        <LogPanel logs={logs} stream={logStream} onClear={clearLogs} />
        <aside><MainSaveCard save={overview.saves.main} busy={busy} onBackup={() => mutate('/api/saves/backup')} /></aside>
      </div>
    </Tabs.Content>
  </Tabs.Root>;
}
