import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Overview } from '../api';
import { request } from '../api';

const EMPTY: Overview = { server: { status: 'stopped', running: false }, operations: { history: [] }, saves: { main: null, autosaves: [], imports: [], backups: [] }, mods: { roots: [], installed: [] }, config: { version: 'latest' }, settings: null };

export function useServerDashboard() {
  const [overview, setOverview] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logStream, setLogStream] = useState<'connecting' | 'live' | 'retrying'>('connecting');
  const [logHistoryLoaded, setLogHistoryLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try { setOverview(await request<Overview>('/api/overview')); setLoaded(true); }
    catch (error) { toast.error(String(error)); }
  }, []);

  useEffect(() => {
    void refresh();
    const source = new EventSource('/api/events');
    source.addEventListener('open', () => setLogStream('live'));
    source.addEventListener('error', () => setLogStream('retrying'));
    source.addEventListener('history-complete', () => setLogHistoryLoaded(true));
    source.addEventListener('log', event => { const value = JSON.parse((event as MessageEvent).data) as { line: string }; setLogs(lines => [...lines.slice(-1999), value.line]); });
    source.addEventListener('operation', event => { const operations = JSON.parse((event as MessageEvent).data) as Overview['operations']; setOverview(value => ({ ...value, operations })); if (!operations.active) void refresh(); });
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
      if (!response.ok) throw new Error((await response.json()).error);
      await refresh(); toast.success('存档已导入');
    } catch (error) { toast.error(String(error)); }
  }

  return { overview, loaded, logs, logStream, logHistoryLoaded, clearLogs: () => setLogs([]), mutate, upload };
}
