import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import type { Overview } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props { profiles: Overview['profiles']; disabled: boolean; onAction(path: string, body: unknown): void }
export function ProfileSwitcher({ profiles, disabled, onAction }: Props) {
  const [name, setName] = useState('');
  return <section className="panel pb-[17px] [&>div:first-child]:h-[62px]">
    <PanelHeader eyebrow="ISOLATED WORKSPACE" title="Profile"><Users size={18} /></PanelHeader>
    <label className="mt-[15px] mx-[17px] grid gap-1.5 text-[10px] text-[#7e8882]">当前 Profile<select className="h-[38px] rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#cbd2ce]" value={profiles.activeId} disabled={disabled} onChange={event => onAction('/api/profiles/activate', { id: event.target.value })}>{profiles.items.map(profile => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
    <div className="mx-[17px] mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-[7px]"><input className="h-[38px] rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[9px] text-[#cbd2ce]" value={name} disabled={disabled} placeholder="新 Profile 名称" onChange={event => setName(event.target.value)} /><button disabled={disabled || !name.trim()} onClick={() => { onAction('/api/profiles', { name }); setName(''); }}><Plus size={15} />创建</button></div>
    <p className="mx-[17px] mt-2.5 mb-0 text-[10px] leading-[1.5] text-[#68716c]">每个 Profile 独立保存游戏版本、Mod、存档与下次启动选择。</p>
  </section>;
}
