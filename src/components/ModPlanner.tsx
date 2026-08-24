import { Box, ClipboardCheck, Pencil, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ModPlan, Overview } from '../api';
import { modPlanSchema, request } from '../api';
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
    run: optional => request<ModPlan>('/api/mods/plan', { method: 'POST', body: JSON.stringify({ input, version: version || undefined, optional }) }, modPlanSchema),
  });
  const change = (label: string, body: unknown): PendingChange => ({
    label, allowOptional: false,
    run: () => request<ModPlan>('/api/mods/change-plan', { method: 'POST', body: JSON.stringify(body) }, modPlanSchema),
  });

  return <section className="panel mt-4 overflow-hidden">
    <PanelHeader eyebrow="MOD PORTAL" title="Mod Management"><Box size={18} /></PanelHeader>
    <div className="px-[19px] pt-[18px] pb-[22px]">
      <CurrentMods mods={mods} versions={versions} disabled={disabled} onVersion={(name, value) => setVersions(current => ({ ...current, [name]: value }))} onChange={next => void resolveChange(next)} makeChange={change} />
      {mods.pending && <p className="mt-[-7px] mb-3.5 rounded-[7px] border border-[#4c3b22] bg-[#22190f] px-[11px] py-[9px] text-[10px] text-[#e5ad72]">Mod 目标配置已锁定，将在下次启动时下载并应用。</p>}
      <div className="grid grid-cols-[minmax(240px,1fr)_180px_auto] items-end gap-[9px] max-[850px]:grid-cols-1">
        <label className="text-[10px] text-[#737d77]">Mod name or official URL<input className="mt-[7px] block h-[38px] w-full rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[11px] text-[#d6dcd8]" value={input} onChange={event => { setInput(event.target.value); setPlan(null); }} placeholder="https://mods.factorio.com/mod/ParallelBeltBuilder" /></label>
        <label className="text-[10px] text-[#737d77]">Root release<input className="mt-[7px] block h-[38px] w-full rounded-[7px] border border-[#303633] bg-[#0b0e0d] px-[11px] text-[#d6dcd8]" value={version} onChange={event => { setVersion(event.target.value); setPlan(null); }} placeholder="latest compatible" /></label>
        <button className="primary" disabled={disabled || !input} onClick={() => void resolveChange(add())}>{planning ? <RefreshCw className="spinner" size={15} /> : <Search size={15} />}Add & resolve</button>
      </div>
      {running && <p className="mt-3 mb-0 text-[10px] text-[#fbbf24]">Stop Factorio before planning and applying mod changes.</p>}
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
  return <div className="mx-[-19px] mt-[-18px] mb-[18px] border-b border-[#252a27]">
    <div className="flex min-h-[58px] items-center justify-between px-[18px] py-[13px]"><div><b className="block text-xs">Configured roots</b><span className="font-mono text-[9px] text-[#65706a]">{mods.roots.length} declared · {mods.resolved.length} resolved · {mods.installed.length} installed</span></div></div>
    {mods.roots.length ? <div className="border-t border-[#202522]">{mods.roots.map(mod => {
      const resolved = installed.get(mod.name);
      const requested = versions[mod.name] ?? mod.version ?? '';
      return <div className={`grid min-h-14 grid-cols-[minmax(180px,1fr)_150px_34px_34px_34px] items-center gap-[7px] border-b border-[#1e2320] py-2 pr-3 pl-[18px] max-[850px]:grid-cols-[1fr_34px_34px_34px] ${mod.enabled ? '' : 'opacity-55'}`} key={mod.name}>
        <div className="flex min-w-0 items-center gap-[9px] text-[var(--green)]"><Power size={14} /><span className="grid min-w-0 gap-0.5"><b className="overflow-hidden font-mono text-[11px] text-ellipsis">{mod.name}</b><small className="font-mono text-[9px] text-[#65706a]">{resolved ? `installed ${resolved.version}` : mod.enabled ? 'not installed' : 'disabled'}</small></span></div>
        <input className="h-[34px] min-w-0 rounded-md border border-[#303633] bg-[#0b0e0d] px-[9px] font-mono text-[10px] text-[#cbd2ce] max-[850px]:col-span-full max-[850px]:col-start-1 max-[850px]:row-start-2" aria-label={`${mod.name} 目标版本`} value={requested} onChange={event => onVersion(mod.name, event.target.value)} placeholder="latest" disabled={disabled} />
        <button className="size-[34px] p-0" aria-label={`更新 ${mod.name}`} title="Resolve selected version" disabled={disabled || requested === (mod.version ?? '')} onClick={() => onChange(makeChange(`Update ${mod.name}`, { action: 'update', name: mod.name, version: requested || undefined }))}><Pencil size={14} /></button>
        <button className="size-[34px] p-0" aria-label={`${mod.enabled ? '禁用' : '启用'} ${mod.name}`} title={mod.enabled ? 'Disable' : 'Enable'} disabled={disabled} onClick={() => onChange(makeChange(`${mod.enabled ? 'Disable' : 'Enable'} ${mod.name}`, { action: 'set-enabled', name: mod.name, enabled: !mod.enabled }))}><Power size={14} /></button>
        <button className="size-[34px] p-0 text-[#fb7185]" aria-label={`删除 ${mod.name}`} title="Remove" disabled={disabled} onClick={() => onChange(makeChange(`Remove ${mod.name}`, { action: 'remove', name: mod.name }))}><Trash2 size={14} /></button>
      </div>;
    })}</div> : <div className="p-[18px] font-mono text-[10px] text-[#626c66]">No configured mods. Add a Mod Portal URL or name below.</div>}
    {mods.resolved.some(mod => !mod.explicit) && <div className="grid gap-1 bg-[#0d100f] px-[18px] pt-[11px] pb-3.5"><b className="text-[9px] tracking-[.1em] text-[#8b958f] uppercase">Resolved dependencies</b><span className="font-mono text-[9px] leading-[1.6] text-[#626c66]">{mods.resolved.filter(mod => !mod.explicit).map(mod => `${mod.name}@${mod.version}`).join(' · ')}</span></div>}
  </div>;
}

function PlanPreview({ plan, label, busy, running, selectedOptional, onApply, onOptionalChange }: { plan: ModPlan; label: string; busy: boolean; running: boolean; selectedOptional: string[]; onApply(id: string): void; onOptionalChange?(value: string[]): void }) {
  return <div className="mt-[17px] overflow-hidden rounded-[9px] border border-[#2d332f] bg-[#0b0e0d]">
    <div className="flex min-h-[68px] items-center justify-between border-b border-[#252a27] px-3.5 py-3"><div><b className="block text-[13px]">{label}</b><span className="font-mono text-[9px] text-[#64706a]">{plan.roots.filter(root => root.enabled).length} roots · {plan.selections.length} archives · Factorio {plan.factorioVersion}</span></div><button className="primary" disabled={busy || running} onClick={() => onApply(plan.id)}><ClipboardCheck size={15} />Stage for next start</button></div>
    <div className="grid grid-cols-3 p-2 max-[850px]:grid-cols-2 max-[560px]:grid-cols-1">{plan.selections.map(item => <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-[3px] border-b border-[#1c211f] p-[9px]" key={item.name}><span className={`font-mono text-[10px] ${item.explicit ? 'text-[var(--orange)]' : ''}`}>{item.name}</span><b className="font-mono text-[10px]">{item.version}</b><em className="col-span-full font-mono text-[8px] text-[#535c57] uppercase">{item.explicit ? 'root' : 'dependency'}</em></div>)}</div>
    {plan.selections.length === 0 && <div className="p-[18px] font-mono text-[10px] text-[#626c66]">This change will leave no external mods installed.</div>}
    {plan.optional.length > 0 && <div className="border-t border-[#252a27] px-4 pt-3 pb-[15px]"><h4 className="mt-0 mb-[9px] text-[10px] text-[#858f89]">Optional dependencies</h4>{plan.optional.map(item => <label className="flex items-center gap-[7px] text-[11px]" key={`${item.from}-${item.dependency.raw}`}>
      {onOptionalChange && <input type="checkbox" checked={selectedOptional.includes(item.dependency.name)} onChange={event => onOptionalChange(event.target.checked ? [...selectedOptional, item.dependency.name] : selectedOptional.filter(name => name !== item.dependency.name))} />}
      <span>{item.dependency.name}</span><small className="text-[#59625d]">requested by {item.from}{onOptionalChange ? ' · select explicitly' : ''}</small>
    </label>)}</div>}
  </div>;
}
