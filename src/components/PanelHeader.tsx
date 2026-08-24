import type { ReactNode } from 'react';

export function PanelHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="flex h-[66px] items-center justify-between border-b border-[#242a27] px-[19px] [&>svg]:text-[#66706a] max-[560px]:h-auto max-[560px]:min-h-[66px] max-[560px]:gap-2.5">
    <div><span className="eyebrow">{eyebrow}</span><h3 className="mt-[3px] mb-0 text-[15px]">{title}</h3></div>
    {children}
  </div>;
}
