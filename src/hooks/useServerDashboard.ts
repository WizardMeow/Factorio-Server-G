import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { LogEntry, Overview } from '../api';
import { logEntrySchema, operationSnapshotSchema, overviewSchema, request, saveImportResultSchema } from '../api';

const EMPTY: Overview = { server: { status: 'stopped', running: false }, operations: { history: [] }, saves: { selected: null, autosaves: [], imports: [], backups: [], nextLaunch: { kind: 'autosaves', name: '_autosave1.zip' } }, mods: { roots: [], resolved: [], installed: [], pending: false }, profiles: { activeId: 'default', items: [{ id: 'default', name: 'Default' }] }, connection: { address: null, configured: false }, config: { version: '2.0.77', channel: 'stable' }, settings: null };

export function useServerDashboard() {
  const [overview, setOverview] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logStream, setLogStream] = useState<'connecting' | 'live' | 'retrying'>('connecting');
  const [logHistoryLoaded, setLogHistoryLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try { setOverview(await request<Overview>('/api/overview', undefined, overviewSchema)); setLoaded(true); }
    catch (error) { toast.error(String(error)); }
  }, []);

  useEffect(() => {
    void refresh();
    const source = new EventSource('/api/events');
    source.addEventListener('open', () => setLogStream('live'));
    source.addEventListener('error', () => setLogStream('retrying'));
    source.addEventListener('history-complete', () => setLogHistoryLoaded(true));
    source.addEventListener('log', event => { const value = logEntrySchema.safeParse(JSON.parse((event as MessageEvent).data)); if (value.success) setLogs(lines => [...lines.slice(-1999), value.data]); });
    source.addEventListener('operation', event => { const parsed = operationSnapshotSchema.safeParse(JSON.parse((event as MessageEvent).data)); if (!parsed.success) return; setOverview(value => ({ ...value, operations: parsed.data })); if (!parsed.data.active) void refresh(); });
    return () => source.close();
  }, [refresh]);

  async function mutate(path: string, body?: unknown, method = 'POST') {
    try { await request(path, { method, body: body ? JSON.stringify(body) : undefined }); await refresh(); toast.success('操作已开始'); }
    catch (error) { toast.error(String(error)); }
  }

  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    try {
      const response = await fetch('/api/saves/import', { method: 'POST', body: form });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : response.statusText);
      const imported = saveImportResultSchema.parse(payload);
      await refresh(); toast.warning(`已导入 ${imported.name}，下次启动将使用 ${imported.factorioVersion} 与 ${imported.mods.length} 个 Mod。${imported.warning}`, { duration: 10_000 });
    } catch (error) { toast.error(String(error)); }
  }

  return { overview, loaded, logs, logStream, logHistoryLoaded, clearLogs: (source: LogEntry['source']) => setLogs(values => values.filter(value => value.source !== source)), mutate, upload };
}
