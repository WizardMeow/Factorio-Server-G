import { Box, ClipboardCheck, ExternalLink, Lock, Plus, RefreshCw, Trash2, Unlock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ConfiguredMod, ModDetails, ModPlan, Overview } from '../api';
import { modDetailsSchema, modPlanSchema, request } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props { mods: Overview['mods']; busy: boolean; running: boolean; onSaved(): Promise<void> }

export function ModPlanner({ mods, busy, running, onSaved }: Props) {
  const serverKey = rootsKey(mods.roots);
  const [baseline, setBaseline] = useState<ConfiguredMod[]>(() => copyRoots(mods.roots));
  const [baselineKey, setBaselineKey] = useState(serverKey);
  const [draft, setDraft] = useState<ConfiguredMod[]>(() => copyRoots(mods.roots));
  const [details, setDetails] = useState<ModDetails>([]);
  const [plan, setPlan] = useState<ModPlan | null>(null);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const changes = useMemo(() => describeChanges(baseline, draft), [baseline, draft]);
  const namesKey = draft.map(mod => mod.name.trim()).filter(Boolean).join(',');
  const disabled = busy || running || planning;
  const invalid = draft.some(mod => !mod.name.trim()) || new Set(draft.map(mod => mod.name.trim().toLowerCase()).filter(Boolean)).size !== draft.filter(mod => mod.name.trim()).length;

  useEffect(() => {
    if (serverKey === baselineKey) return;
    const next = copyRoots(mods.roots);
    setBaseline(next);
    setBaselineKey(serverKey);
    setDraft(current => rootsKey(current) === serverKey ? next : current);
    setPlan(null);
    setSelectedOptional([]);
  }, [baselineKey, mods.roots, serverKey]);

  useEffect(() => {
    if (!namesKey) { setDetails([]); return; }
    let cancelled = false;
    void request<ModDetails>(`/api/mods/details?names=${encodeURIComponent(namesKey)}`, undefined, modDetailsSchema)
      .then(next => { if (!cancelled) setDetails(next); })
      .catch(() => { if (!cancelled) setDetails([]); });
    return () => { cancelled = true; };
  }, [namesKey]);

  function changeDraft(update: (current: ConfiguredMod[]) => ConfiguredMod[]) {
    setDraft(current => update(current));
    setPlan(null);
    setSelectedOptional([]);
  }

  async function resolve(optional: string[] = []) {
    if (invalid) return toast.error('每一行都需要唯一的 Mod 名称或官方 URL。');
    setPlanning(true);
    try {
      const next = await request<ModPlan>('/api/mods/plan-config', { method: 'POST', body: JSON.stringify({ roots: draft, optional }) }, modPlanSchema);
      const savedRoots = copyRoots(next.roots);
      setBaseline(savedRoots);
      setBaselineKey(rootsKey(savedRoots));
      setDraft(copyRoots(savedRoots));
      setPlan(next);
      setSelectedOptional(optional);
      await onSaved();
      toast.success('已保存为下次启动的 Mod 配置。');
    } catch (error) { toast.error(String(error)); }
    finally { setPlanning(false); }
  }

  const resolved = new Map(mods.resolved.map(mod => [mod.name, mod.version]));
  const selected = new Map(plan?.selections.map(mod => [mod.name, mod.version]));
  const catalog = new Map(details.map(mod => [mod.name, mod]));

  return <section className="panel mt-4 overflow-hidden">
    <PanelHeader eyebrow="MOD PORTAL" title="Mod Management"><Box size={18} /></PanelHeader>
    <div className="px-[19px] pt-[18px] pb-[22px]">
      <div className="mx-[-19px] mt-[-18px] mb-[18px] border-b border-[#252a27]">
        <div className="flex min-h-[58px] items-center justify-between gap-3 px-[18px] py-[13px]"><div><b className="block text-xs">Configured mods</b><span className="font-mono text-[9px] text-[#65706a]">直接编辑列表后统一解析 · {draft.length} roots · {mods.installed.length} installed</span></div>{changes.length > 0 && <button className="text-[10px]" disabled={disabled} onClick={() => { setDraft(copyRoots(baseline)); setPlan(null); setSelectedOptional([]); }}>Discard changes</button>}</div>
        {draft.length ? <div className="border-t border-[#202522]">{draft.map((mod, index) => <ModRow key={`${mod.name}-${index}`} mod={mod} detail={catalog.get(mod.name)} resolvedVersion={selected.get(mod.name) ?? resolved.get(mod.name)} disabled={disabled} onChange={next => changeDraft(current => current.map((item, itemIndex) => itemIndex === index ? next : item))} onDelete={() => changeDraft(current => current.filter((_item, itemIndex) => itemIndex !== index))} />)}</div> : <div className="px-[18px] py-4 font-mono text-[10px] text-[#626c66]">No configured mods. Add one below.</div>}
        <button className="flex w-full items-center gap-2 border-t border-[#202522] px-[18px] py-3 text-[11px] text-[var(--green)] hover:bg-[#111512] disabled:opacity-50" disabled={disabled} onClick={() => changeDraft(current => [...current, { name: '', enabled: true }])}><Plus size={15} />Add mod</button>
        {mods.resolved.some(mod => !mod.explicit) && <div className="grid gap-1 bg-[#0d100f] px-[18px] pt-[11px] pb-3.5"><b className="text-[9px] tracking-[.1em] text-[#8b958f] uppercase">Resolved dependencies</b><span className="font-mono text-[9px] leading-[1.6] text-[#626c66]">{mods.resolved.filter(mod => !mod.explicit).map(mod => `${mod.name}@${mod.version}`).join(' · ')}</span></div>}
      </div>
      {changes.length > 0 && <div className="mb-3.5 rounded-[7px] border border-[#3a453d] bg-[#101612] px-3 py-2.5 text-[10px]"><b className="block text-[#b9c9bc]">Pending changes ({changes.length})</b><ul className="mt-1.5 mb-0 grid list-disc gap-0.5 pl-4 font-mono text-[#849188]">{changes.map(change => <li key={change}>{change}</li>)}</ul></div>}
      {mods.pending && <p className="mt-[-7px] mb-3.5 rounded-[7px] border border-[#4c3b22] bg-[#22190f] px-[11px] py-[9px] text-[10px] text-[#e5ad72]">当前列表已保存为下次启动配置，将在启动时下载并应用。</p>}
      <div className="flex flex-wrap items-center gap-2"><button className="primary" disabled={disabled || invalid || changes.length === 0} onClick={() => void resolve()}>{planning ? <RefreshCw className="spinner" size={15} /> : <RefreshCw size={15} />}Resolve & save {changes.length ? `${changes.length} changes` : 'list'}</button>{invalid && <span className="text-[10px] text-[#fb7185]">名称不能为空且不能重复。</span>}</div>
      {running && <p className="mt-3 mb-0 text-[10px] text-[#fbbf24]">Stop Factorio before planning and applying mod changes.</p>}
      {plan && <PlanPreview plan={plan} selectedOptional={selectedOptional} onOptionalChange={next => void resolve(next)} />}
    </div>
  </section>;
}

function ModRow({ mod, detail, resolvedVersion, disabled, onChange, onDelete }: { mod: ConfiguredMod; detail?: ModDetails[number]; resolvedVersion?: string; disabled: boolean; onChange(value: ConfiguredMod): void; onDelete(): void }) {
  const initials = mod.name.trim().slice(0, 2).toUpperCase() || '??';
  const displayedVersion = mod.version ?? resolvedVersion ?? '';
  const portal = mod.name.trim() ? `https://mods.factorio.com/mod/${encodeURIComponent(mod.name.trim())}` : undefined;
  const lock = () => {
    if (!resolvedVersion) return toast.error('请先解析该 Mod，再锁定一个具体版本。');
    onChange({ ...mod, version: resolvedVersion });
  };
  return <div className={`grid min-h-[70px] grid-cols-[minmax(220px,1fr)_150px_auto_auto_auto] items-center gap-[7px] border-b border-[#1e2320] py-2 pr-3 pl-[18px] max-[850px]:grid-cols-[1fr_auto_auto_auto] ${mod.enabled ? '' : 'opacity-55'}`}>
    <div className="flex min-w-0 items-center gap-[9px]"><div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-[#3d4941] bg-[#172019] font-mono text-[10px] text-[var(--green)]"><span>{initials}</span>{detail?.thumbnail && <img className="absolute inset-0 size-full object-cover" src={detail.thumbnail} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />}</div><span className="grid min-w-0 gap-0.5"><input className="min-w-0 border-0 bg-transparent p-0 font-mono text-[11px] font-bold text-[#d8dedb] outline-none" aria-label="Mod name or official URL" value={mod.name} onChange={event => onChange({ ...mod, name: event.target.value })} placeholder="Mod name or official URL" disabled={disabled} /><small className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px] text-[#65706a]" title={detail?.summary}>{detail?.summary || (mod.version ? `locked ${mod.version}` : resolvedVersion ? `resolved ${resolvedVersion}` : 'latest compatible')}</small>{portal && <a className="flex w-fit items-center gap-1 text-[9px] text-[var(--green)]" href={portal} target="_blank" rel="noreferrer"><ExternalLink size={11} />Mod Portal</a>}</span></div>
    <input className="h-[34px] min-w-0 rounded-md border border-[#303633] bg-[#0b0e0d] px-[9px] font-mono text-[10px] text-[#cbd2ce] max-[850px]:col-span-full max-[850px]:col-start-1 max-[850px]:row-start-2" aria-label={`${mod.name || 'new mod'} version`} value={displayedVersion} onChange={event => onChange({ ...mod, version: event.target.value || undefined })} placeholder="resolve required" disabled={disabled} />
    <button className="size-[34px] p-0" aria-label={mod.version ? `解锁 ${mod.name}` : `锁定 ${mod.name}`} title={mod.version ? 'Unlock version' : 'Lock resolved version'} disabled={disabled || (!mod.version && !resolvedVersion)} onClick={() => mod.version ? onChange({ ...mod, version: undefined }) : lock()}>{mod.version ? <Unlock size={14} /> : <Lock size={14} />}</button>
    <button className="size-[34px] p-0" aria-label={`${mod.enabled ? '禁用' : '启用'} ${mod.name}`} title={mod.enabled ? 'Disable' : 'Enable'} disabled={disabled} onClick={() => onChange({ ...mod, enabled: !mod.enabled })}>{mod.enabled ? <span className="text-[10px]">ON</span> : <span className="text-[10px]">OFF</span>}</button>
    <button className="size-[34px] p-0 text-[#fb7185]" aria-label={`删除 ${mod.name}`} title="Remove" disabled={disabled} onClick={onDelete}><Trash2 size={14} /></button>
  </div>;
}

function PlanPreview({ plan, selectedOptional, onOptionalChange }: { plan: ModPlan; selectedOptional: string[]; onOptionalChange(value: string[]): void }) {
  return <div className="mt-[17px] overflow-hidden rounded-[9px] border border-[#2d332f] bg-[#0b0e0d]">
    <div className="flex min-h-[68px] items-center justify-between border-b border-[#252a27] px-3.5 py-3"><div><b className="block text-[13px]">Resolved configuration</b><span className="font-mono text-[9px] text-[#64706a]">{plan.roots.filter(root => root.enabled).length} roots · {plan.selections.length} archives · Factorio {plan.factorioVersion}</span></div><span className="flex items-center gap-1 text-[10px] text-[var(--green)]"><ClipboardCheck size={15} />Saved for next start</span></div>
    <div className="grid grid-cols-3 p-2 max-[850px]:grid-cols-2 max-[560px]:grid-cols-1">{plan.selections.map(item => <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-[3px] border-b border-[#1c211f] p-[9px]" key={item.name}><span className={`font-mono text-[10px] ${item.explicit ? 'text-[var(--orange)]' : ''}`}>{item.name}</span><b className="font-mono text-[10px]">{item.version}</b><em className="col-span-full font-mono text-[8px] text-[#535c57] uppercase">{item.explicit ? 'root' : 'dependency'}</em></div>)}</div>
    {plan.selections.length === 0 && <div className="p-[18px] font-mono text-[10px] text-[#626c66]">This change will leave no external mods installed.</div>}
    {plan.optional.length > 0 && <div className="border-t border-[#252a27] px-4 pt-3 pb-[15px]"><h4 className="mt-0 mb-[9px] text-[10px] text-[#858f89]">Optional dependencies</h4>{plan.optional.map(item => <label className="flex items-center gap-[7px] text-[11px]" key={`${item.from}-${item.dependency.raw}`}><input type="checkbox" checked={selectedOptional.includes(item.dependency.name)} onChange={event => onOptionalChange(event.target.checked ? [...selectedOptional, item.dependency.name] : selectedOptional.filter(name => name !== item.dependency.name))} /><span>{item.dependency.name}</span><small className="text-[#59625d]">requested by {item.from} · select explicitly</small></label>)}</div>}
  </div>;
}

function copyRoots(roots: ConfiguredMod[]) { return roots.map(root => ({ ...root })); }
function rootsKey(roots: ConfiguredMod[]) { return JSON.stringify(roots.map(root => [root.name, root.version ?? '', root.enabled])); }
function describeChanges(before: ConfiguredMod[], after: ConfiguredMod[]) {
  const previous = new Map(before.map(root => [root.name, root]));
  const next = new Map(after.map(root => [root.name, root]));
  const changes: string[] = [];
  for (const [name, root] of previous) if (!next.has(name)) changes.push(`Remove ${name}`); else {
    const current = next.get(name)!;
    if (root.version !== current.version) changes.push(current.version ? `Lock ${name} at ${current.version}` : `Unlock ${name}`);
    if (root.enabled !== current.enabled) changes.push(`${current.enabled ? 'Enable' : 'Disable'} ${name}`);
  }
  for (const [name, root] of next) if (!previous.has(name)) changes.push(`Add ${name}${root.version ? ` at ${root.version}` : ''}`);
  return changes;
}
