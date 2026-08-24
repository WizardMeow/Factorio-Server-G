import { Box, Download, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ModPlan } from '../api';
import { request } from '../api';
import { PanelHeader } from './PanelHeader';

interface Props { busy: boolean; running: boolean; onApply(planId: string): void }

export function ModPlanner({ busy, running, onApply }: Props) {
  const [input, setInput] = useState('');
  const [version, setVersion] = useState('');
  const [plan, setPlan] = useState<ModPlan | null>(null);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);

  async function resolve(optional = selectedOptional) {
    setPlanning(true);
    try {
      const next = await request<ModPlan>('/api/mods/plan', { method: 'POST', body: JSON.stringify({ input, version: version || undefined, optional }) });
      setSelectedOptional(optional);
      setPlan(next);
    } catch (error) { toast.error(String(error)); }
    finally { setPlanning(false); }
  }

  return <section className="panel mods">
    <PanelHeader eyebrow="MOD PORTAL" title="Dependency Planner"><Box size={18} /></PanelHeader>
    <div className="mod-builder">
      <div className="mod-inputs">
        <label>Mod name or official URL<input value={input} onChange={event => { setInput(event.target.value); setPlan(null); setSelectedOptional([]); }} placeholder="https://mods.factorio.com/mod/ParallelBeltBuilder" /></label>
        <label>Root release<input value={version} onChange={event => { setVersion(event.target.value); setPlan(null); }} placeholder="latest compatible" /></label>
        <button className="primary" disabled={busy || running || planning || !input} onClick={() => resolve()}>{planning ? <RefreshCw className="spinner" size={15} /> : <Search size={15} />}Resolve</button>
      </div>
      {running && <p className="warning">Stop Factorio before planning and applying mod changes.</p>}
      {plan && <PlanPreview plan={plan} busy={busy} running={running} selectedOptional={selectedOptional} onApply={onApply} onOptionalChange={next => void resolve(next)} />}
    </div>
  </section>;
}

function PlanPreview({ plan, busy, running, selectedOptional, onApply, onOptionalChange }: { plan: ModPlan; busy: boolean; running: boolean; selectedOptional: string[]; onApply(id: string): void; onOptionalChange(value: string[]): void }) {
  return <div className="plan">
    <div className="plan-head"><div><b>{plan.selections.length} archives resolved</b><span>Factorio {plan.factorioVersion} · plan {plan.id.slice(0, 8)}</span></div><button className="primary" disabled={busy || running} onClick={() => onApply(plan.id)}><Download size={15} />Download & apply</button></div>
    <div className="resolved">{plan.selections.map(item => <div key={item.name}><span className={item.explicit ? 'root-mod' : ''}>{item.name}</span><b>{item.version}</b><em>{item.explicit ? 'root' : 'dependency'}</em></div>)}</div>
    {plan.optional.length > 0 && <div className="optional"><h4>Optional dependencies — select explicitly</h4>{plan.optional.map(item => <label key={`${item.from}-${item.dependency.raw}`}>
      <input type="checkbox" checked={selectedOptional.includes(item.dependency.name)} onChange={event => onOptionalChange(event.target.checked ? [...selectedOptional, item.dependency.name] : selectedOptional.filter(name => name !== item.dependency.name))} />
      <span>{item.dependency.name}</span><small>requested by {item.from}</small>
    </label>)}</div>}
  </div>;
}
