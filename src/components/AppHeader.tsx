import { Box } from 'lucide-react';
import { CopyConnectionButton } from './CopyConnectionButton';

export function AppHeader({ address }: { address: string | null }) {
  return <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-[#242825] bg-[#0b0e0dcf] px-[max(24px,calc((100vw-1240px)/2))] backdrop-blur-[14px] max-[560px]:px-[15px]">
      <div className="flex items-center gap-3">
        <span className="grid size-[38px] -rotate-3 place-items-center rounded-[9px] bg-[var(--orange)] text-[#21130a]"><Box size={20} /></span>
        <div><h1 className="m-0 text-base tracking-[.01em]">Factorio Server G</h1><p className="mt-[3px] mb-0 font-mono text-[9px] tracking-[.18em] text-[#78817c]">SERVER OPERATIONS CONSOLE</p></div>
      </div>
      {address ? <CopyConnectionButton address={address} compact /> : <span className="font-mono text-[9px] tracking-[.12em] text-[#fb7185]">JOIN ADDRESS NOT CONFIGURED</span>}
  </header>;
}

export function AppFooter() {
  return <footer className="mx-auto flex max-w-[1240px] justify-between border-t border-[#1b1f1d] px-6 pt-[17px] pb-[30px] font-mono text-[9px] tracking-[.12em] text-[#4a524e] uppercase"><span>Factorio Server G · Prototype</span><span>One operation at a time</span></footer>;
}
