import { Box, Download, Pencil, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ModPlan, Overview } from '../api';
import { request } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props { mods: Overview['mods']; busy: boolean; running: boolean; onApply(planId: string): void }
type PendingChange = { label: string; allowOptional: boolean; run(optional?: string[]): Promise<ModPlan> };

export function ModPlanner({ mods, busy, running, onApply }: Props) {
  const [input, setInput] = useState('');
  const [version, setVersion] = useState('');
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<ModPlan | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const disabled = busy || running || planning;

  async function resolveChange(change: PendingChange, optional: string[] = []) {
    setPlanning(true);
    try {
      const next = await change.run(optional);
      setPending(change); setPlan(next); setSelectedOptional(optional);
    } catch (error) { toast.error(String(error)); }
    finally { setPlanning(false); }
  }

  const add = (): PendingChange => ({
    label: `Add ${input}`, allowOptional: true,
    run: optional => request<ModPlan>('/api/mods/plan', { method: 'POST', body: JSON.stringify({ input, version: version || undefined, optional }) }),
  });
  const change = (label: string, body: unknown): PendingChange => ({
    label, allowOptional: false,
    run: () => request<ModPlan>('/api/mods/change-plan', { method: 'POST', body: JSON.stringify(body) }),
  });

  return <section className="panel mods">
    <PanelHeader eyebrow="MOD PORTAL" title="Mod Management"><Box size={18} /></PanelHeader>
    <div className="mod-builder">
      <CurrentMods mods={mods} versions={versions} disabled={disabled} onVersion={(name, value) => setVersions(current => ({ ...current, [name]: value }))} onChange={next => void resolveChange(next)} makeChange={change} />
      <div className="mod-inputs">
        <label>Mod name or official URL<input value={input} onChange={event => { setInput(event.target.value); setPlan(null); }} placeholder="https://mods.factorio.com/mod/ParallelBeltBuilder" /></label>
        <label>Root release<input value={version} onChange={event => { setVersion(event.target.value); setPlan(null); }} placeholder="latest compatible" /></label>
        <button className="primary" disabled={disabled || !input} onClick={() => void resolveChange(add())}>{planning ? <RefreshCw className="spinner" size={15} /> : <Search size={15} />}Add & resolve</button>
      </div>
      {running && <p className="warning">Stop Factorio before planning and applying mod changes.</p>}
      {plan && pending && <PlanPreview plan={plan} label={pending.label} busy={busy} running={running} selectedOptional={selectedOptional} onApply={onApply} onOptionalChange={pending.allowOptional ? next => void resolveChange(pending, next) : undefined} />}
    </div>
  </section>;
}

function CurrentMods({ mods, versions, disabled, onVersion, onChange, makeChange }: {
  mods: Overview['mods']; versions: Record<string, string>; disabled: boolean;
  onVersion(name: string, value: string): void; onChange(change: PendingChange): void;
  makeChange(label: string, body: unknown): PendingChange;
}) {
  const installed = new Map(mods.installed.map(mod => [mod.name, mod]));
  return <div className="current-mods">
    <div className="current-mods-head"><div><b>Configured roots</b><span>{mods.roots.length} declared · {mods.installed.length} resolved archives</span></div></div>
    {mods.roots.length ? <div className="mod-root-list">{mods.roots.map(mod => {
      const resolved = installed.get(mod.name);
      const requested = versions[mod.name] ?? mod.version ?? '';
      return <div className={`mod-root ${mod.enabled ? '' : 'disabled'}`} key={mod.name}>
        <div className="mod-identity"><Power size={14} /><span><b>{mod.name}</b><small>{resolved ? `installed ${resolved.version}` : mod.enabled ? 'not installed' : 'disabled'}</small></span></div>
        <input aria-label={`${mod.name} 目标版本`} value={requested} onChange={event => onVersion(mod.name, event.target.value)} placeholder="latest" disabled={disabled} />
        <button aria-label={`更新 ${mod.name}`} title="Resolve selected version" disabled={disabled || requested === (mod.version ?? '')} onClick={() => onChange(makeChange(`Update ${mod.name}`, { action: 'update', name: mod.name, version: requested || undefined }))}><Pencil size={14} /></button>
        <button aria-label={`${mod.enabled ? '禁用' : '启用'} ${mod.name}`} title={mod.enabled ? 'Disable' : 'Enable'} disabled={disabled} onClick={() => onChange(makeChange(`${mod.enabled ? 'Disable' : 'Enable'} ${mod.name}`, { action: 'set-enabled', name: mod.name, enabled: !mod.enabled }))}><Power size={14} /></button>
        <button className="danger-icon" aria-label={`删除 ${mod.name}`} title="Remove" disabled={disabled} onClick={() => onChange(makeChange(`Remove ${mod.name}`, { action: 'remove', name: mod.name }))}><Trash2 size={14} /></button>
      </div>;
    })}</div> : <div className="empty-mods">No configured mods. Add a Mod Portal URL or name below.</div>}
    {mods.installed.some(mod => !mod.explicit) && <div className="dependency-summary"><b>Managed dependencies</b><span>{mods.installed.filter(mod => !mod.explicit).map(mod => `${mod.name}@${mod.version}`).join(' · ')}</span></div>}
  </div>;
}

function PlanPreview({ plan, label, busy, running, selectedOptional, onApply, onOptionalChange }: { plan: ModPlan; label: string; busy: boolean; running: boolean; selectedOptional: string[]; onApply(id: string): void; onOptionalChange?(value: string[]): void }) {
  return <div className="plan">
    <div className="plan-head"><div><b>{label}</b><span>{plan.roots.filter(root => root.enabled).length} roots · {plan.selections.length} archives · Factorio {plan.factorioVersion}</span></div><button className="primary" disabled={busy || running} onClick={() => onApply(plan.id)}><Download size={15} />Confirm & apply</button></div>
    <div className="resolved">{plan.selections.map(item => <div key={item.name}><span className={item.explicit ? 'root-mod' : ''}>{item.name}</span><b>{item.version}</b><em>{item.explicit ? 'root' : 'dependency'}</em></div>)}</div>
    {plan.selections.length === 0 && <div className="empty-mods">This change will leave no external mods installed.</div>}
    {plan.optional.length > 0 && <div className="optional"><h4>Optional dependencies</h4>{plan.optional.map(item => <label key={`${item.from}-${item.dependency.raw}`}>
      {onOptionalChange && <input type="checkbox" checked={selectedOptional.includes(item.dependency.name)} onChange={event => onOptionalChange(event.target.checked ? [...selectedOptional, item.dependency.name] : selectedOptional.filter(name => name !== item.dependency.name))} />}
      <span>{item.dependency.name}</span><small>requested by {item.from}{onOptionalChange ? ' · select explicitly' : ''}</small>
    </label>)}</div>}
  </div>;
}
