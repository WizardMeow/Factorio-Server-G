import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import type { Overview } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props { profiles: Overview['profiles']; disabled: boolean; onAction(path: string, body: unknown): void }
export function ProfileSwitcher({ profiles, disabled, onAction }: Props) {
  const [name, setName] = useState('');
  return <section className="panel compact profile-card">
    <PanelHeader eyebrow="ISOLATED WORKSPACE" title="Profile"><Users size={18} /></PanelHeader>
    <label>当前 Profile<select value={profiles.activeId} disabled={disabled} onChange={event => onAction('/api/profiles/activate', { id: event.target.value })}>{profiles.items.map(profile => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
    <div className="profile-create"><input value={name} disabled={disabled} placeholder="新 Profile 名称" onChange={event => setName(event.target.value)} /><button disabled={disabled || !name.trim()} onClick={() => { onAction('/api/profiles', { name }); setName(''); }}><Plus size={15} />创建</button></div>
    <p className="hint">每个 Profile 独立保存游戏版本、Mod、存档与下次启动选择。</p>
  </section>;
}
