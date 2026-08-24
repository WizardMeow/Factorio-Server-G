import type { ReactNode } from 'react';

export function PanelHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="panel-head">
    <div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div>
    {children}
  </div>;
}
