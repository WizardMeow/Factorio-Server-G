import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { LogEntry, Overview } from '../api';
import { logEntrySchema, operationSnapshotSchema, overviewSchema, profileQuickImportResultSchema, request, saveUploadResultSchema } from '../api';

const EMPTY: Overview = { server: { status: 'stopped', running: false }, operations: { history: [] }, saves: { selected: null, autosaves: [], imports: [], backups: [], nextLaunch: { kind: 'autosaves', name: '_autosave1.zip' } }, mods: { roots: [], resolved: [], installed: [], pending: false }, profiles: { activeId: 'p1', items: [{ id: 'p1', name: 'P1' }] }, connection: { address: null, configured: false }, config: { version: '2.0.77', channel: 'stable' }, settings: null };

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

  async function uploadSave(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    try {
      const response = await fetch('/api/saves/import', { method: 'POST', body: form });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : response.statusText);
      const imported = saveUploadResultSchema.parse(payload);
      await refresh(); toast.success(`已将 ${imported.name} 放入当前 Profile 的导入槽，启动配置未改变。`);
    } catch (error) { toast.error(String(error)); }
  }

  async function quickImportProfile(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    try {
      const response = await fetch('/api/profiles/quick-import', { method: 'POST', body: form });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : response.statusText);
      const imported = profileQuickImportResultSchema.parse(payload);
      await refresh();
      toast.warning(`已创建并切换到 ${imported.profile.name}：Factorio ${imported.factorioVersion}、${imported.mods.length} 个 Mod，存档 ${imported.save.name}。${imported.warning}`, { duration: 10_000 });
    } catch (error) { toast.error(String(error)); }
  }

  return { overview, loaded, logs, logStream, logHistoryLoaded, clearLogs: (source: LogEntry['source']) => setLogs(values => values.filter(value => value.source !== source)), mutate, uploadSave, quickImportProfile };
}
