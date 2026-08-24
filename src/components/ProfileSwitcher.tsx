import { Pencil, Plus, ScanLine, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Overview } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props { profiles: Overview['profiles']; disabled: boolean; onAction(path: string, body?: unknown, method?: string): void; onQuickImport(file?: File): Promise<void> }
export function ProfileSwitcher({ profiles, disabled, onAction, onQuickImport }: Props) {
  const active = profiles.items.find(profile => profile.id === profiles.activeId);
  const [name, setName] = useState(active?.name ?? '');
  useEffect(() => setName(active?.name ?? ''), [active?.id, active?.name]);
  return <section className="panel pb-[17px] [&>div:first-child]:h-[62px]">
    <PanelHeader eyebrow="ISOLATED WORKSPACE" title="Profile"><Users size={18} /></PanelHeader>
    <label className="mt-[15px] mx-[17px] grid gap-1.5 text-[10px] text-[#7e8882]">当前 Profile<select className="h-[38px] rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#cbd2ce]" value={profiles.activeId} disabled={disabled} onChange={event => onAction('/api/profiles/activate', { id: event.target.value })}>{profiles.items.map(profile => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
    <div className="mx-[17px] mt-2.5 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-[7px]"><input className="h-[38px] rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#cbd2ce]" value={name} disabled={disabled} aria-label="Profile 名称" onChange={event => setName(event.target.value)} /><button disabled={disabled || !name.trim() || name.trim() === active?.name} onClick={() => onAction(`/api/profiles/${profiles.activeId}`, { name }, 'PATCH')}><Pencil size={14} />改名</button><button disabled={disabled || profiles.items.length < 2} onClick={() => onAction(`/api/profiles/${profiles.activeId}`, undefined, 'DELETE')}><Trash2 size={14} />删除</button></div>
    <div className="mx-[17px] mt-2.5 grid grid-cols-2 gap-[7px]"><button disabled={disabled} onClick={() => onAction('/api/profiles')}><Plus size={15} />新建下一个 Profile</button><label className={`upload h-[38px] ${disabled ? 'pointer-events-none opacity-40' : ''}`}><ScanLine size={15} />从存档快速导入<input className="hidden" type="file" accept=".zip" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onQuickImport(file); }} /></label></div>
    <p className="mx-[17px] mt-2.5 mb-0 text-[10px] leading-[1.5] text-[#68716c]">快速导入会读取存档依赖，创建并切换到一个隔离的 Profile；游戏与 Mod 在启动时下载。</p>
  </section>;
}
