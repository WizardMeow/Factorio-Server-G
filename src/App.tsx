import { Toaster } from 'sonner';
import { AppFooter, AppHeader } from './components/AppHeader';
import { DashboardTabs } from './components/DashboardTabs';
import { useServerDashboard } from './hooks/useServerDashboard';

export function App() {
  const { overview, loaded, logs, logStream, logHistoryLoaded, clearLogs, mutate, upload } = useServerDashboard();
  return <div className="min-h-screen">
    <Toaster theme="dark" richColors />
    <AppHeader address={overview.connection.address} />
    <main className="mx-auto max-w-[1240px] px-6 pt-8 pb-[50px] max-[560px]:px-3 max-[560px]:pt-5">{loaded ? <DashboardTabs overview={overview} logs={logs} logStream={logStream} logHistoryLoaded={logHistoryLoaded} clearLogs={clearLogs} mutate={mutate} upload={upload} /> : <div className="panel p-8 font-mono text-[11px] text-[#7d8781]">Loading server state…</div>}</main>
    <AppFooter />
  </div>;
}
