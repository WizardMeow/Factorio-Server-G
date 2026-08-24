import { Toaster } from 'sonner';
import { AppFooter, AppHeader } from './components/AppHeader';
import { DashboardTabs } from './components/DashboardTabs';
import { useServerDashboard } from './hooks/useServerDashboard';

export function App() {
  const { overview, loaded, logs, logStream, logHistoryLoaded, clearLogs, mutate, upload } = useServerDashboard();
  return <div className="shell">
    <Toaster theme="dark" richColors />
    <AppHeader address={overview.connection.address} />
    <main>{loaded ? <DashboardTabs overview={overview} logs={logs} logStream={logStream} logHistoryLoaded={logHistoryLoaded} clearLogs={clearLogs} mutate={mutate} upload={upload} /> : <div className="loading-panel panel">Loading server state…</div>}</main>
    <AppFooter />
  </div>;
}
