import { Box } from 'lucide-react';

export function AppHeader() {
  return <header className="app-header">
      <div className="brand">
        <span className="mark"><Box size={20} /></span>
        <div><h1>Factorio Server G</h1><p>PYMOD OPERATIONS CONSOLE</p></div>
      </div>
      <div className="connection"><span className="pulse" />TAILSCALE CONNECTED</div>
  </header>;
}

export function AppFooter() {
  return <footer><span>Factorio Server G · Prototype</span><span>One operation at a time</span></footer>;
}
