import { Toaster } from 'sonner';
import { AppFooter, AppHeader } from './components/AppHeader';
import { LogPanel } from './components/LogPanel';
import { ModPlanner } from './components/ModPlanner';
import { MainSaveCard, SaveManager } from './components/SavePanels';
import { ServerHero } from './components/ServerHero';
import { VersionCard } from './components/VersionCard';
import { useServerDashboard } from './hooks/useServerDashboard';

export function App() {
  const { overview, logs, clearLogs, mutate, upload } = useServerDashboard();
  const busy = Boolean(overview.operations.active);
  return <div className="shell">
    <Toaster theme="dark" richColors />
    <AppHeader />
    <main>
      <ServerHero overview={overview} busy={busy} onAction={mutate} />
      <div className="dashboard-grid">
        <LogPanel logs={logs} onClear={clearLogs} />
        <aside>
          <VersionCard current={overview.config.version} busy={busy} running={overview.server.running} onApply={version => mutate('/api/config/version', { version }, 'PUT')} />
          <MainSaveCard save={overview.saves.main} busy={busy} onBackup={() => mutate('/api/saves/backup')} />
        </aside>
      </div>
      <SaveManager saves={overview.saves} busy={busy} running={overview.server.running} onAction={mutate} onUpload={upload} />
      <ModPlanner busy={busy} running={overview.server.running} onApply={planId => mutate('/api/mods/apply', { planId })} />
    </main>
    <AppFooter />
  </div>;
}
