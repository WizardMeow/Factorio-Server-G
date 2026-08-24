import { Box, Copy } from 'lucide-react';

export function AppHeader({ address }: { address: string }) {
  return <header className="app-header">
      <div className="brand">
        <span className="mark"><Box size={20} /></span>
        <div><h1>Factorio Server G</h1><p>PYMOD OPERATIONS CONSOLE</p></div>
      </div>
      <button className="connection" title="复制 Factorio 联机地址" onClick={() => void navigator.clipboard.writeText(address)}><Copy size={14} />JOIN {address}</button>
  </header>;
}

export function AppFooter() {
  return <footer><span>Factorio Server G · Prototype</span><span>One operation at a time</span></footer>;
}
