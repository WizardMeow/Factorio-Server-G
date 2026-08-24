import { ChevronRight, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { request, versionOptionsSchema, type VersionOptions } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props { current: string; channel?: 'latest' | 'stable'; busy: boolean; running: boolean; onApply(version: string, channel?: 'latest' | 'stable'): void }

export function VersionCard({ current, channel, busy, running, onApply }: Props) {
  const [version, setVersion] = useState(current);
  const [selectedChannel, setSelectedChannel] = useState<'latest' | 'stable' | 'exact'>(channel ?? 'exact');
  const [options, setOptions] = useState<VersionOptions>();
  useEffect(() => setVersion(current), [current]);
  useEffect(() => { void request<VersionOptions>('/api/config/version-options', undefined, versionOptionsSchema).then(setOptions); }, []);
  const disabled = busy || running;
  const choose = (value: 'latest' | 'stable' | 'exact') => {
    setSelectedChannel(value);
    if (value !== 'exact' && options) setVersion(options[value]);
  };
  return <section className="panel pb-[17px] [&>div:first-child]:h-[62px]">
    <PanelHeader eyebrow="RUNTIME" title="Game Version"><Server size={18} /></PanelHeader>
    <div className="flex gap-[7px] px-[17px] pt-[15px]">
      <select className="h-[38px] w-[170px] min-w-0 rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#cbd2ce]" value={selectedChannel} onChange={event => choose(event.target.value as 'latest' | 'stable' | 'exact')} disabled={disabled || !options}>
        {options && <><option value="latest">{options.latest} (latest)</option><option value="stable">{options.stable} (stable)</option></>}
        <option value="exact">精确版本</option>
      </select>
      <input className="h-[38px] min-w-0 flex-1 rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#cbd2ce]" aria-label="Factorio 精确版本" value={version} onChange={event => { setVersion(event.target.value); setSelectedChannel('exact'); }} disabled={disabled} />
      <button className="primary square" aria-label="保存 Factorio 版本" disabled={disabled || !/^\d+\.\d+\.\d+$/.test(version) || version === current && selectedChannel === (channel ?? 'exact')} onClick={() => onApply(version, selectedChannel === 'exact' ? undefined : selectedChannel)}><ChevronRight size={17} /></button>
    </div>
    <p className="mx-[17px] mt-2.5 mb-0 text-[10px] leading-[1.5] text-[#68716c]">这里只保存精确版本；镜像会在下次点击启动时下载。</p>
  </section>;
}
