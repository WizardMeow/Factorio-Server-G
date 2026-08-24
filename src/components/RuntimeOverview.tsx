import { Box, Database, HeartPulse, PackageOpen, UserRoundCog } from 'lucide-react';
import type { Overview } from '../api';
import { CopyConnectionButton } from './CopyConnectionButton';

export function RuntimeOverview({ overview }: { overview: Overview }) {
  const cards = [
    { icon: Box, label: 'CONTAINER IMAGE', value: overview.server.image || `factoriotools/factorio:${overview.config.version}` },
    { icon: HeartPulse, label: 'CONTAINER HEALTH', value: overview.server.health || (overview.server.running ? 'running' : 'not running') },
    { icon: UserRoundCog, label: 'ACTIVE PROFILE', value: overview.profiles.items.find(item => item.id === overview.profiles.activeId)?.name || overview.profiles.activeId },
    { icon: PackageOpen, label: 'INSTALLED MODS', value: `${overview.mods.installed.filter(mod => mod.enabled).length} enabled` },
    { icon: Database, label: 'NEXT START SAVE', value: overview.saves.selected?.name || overview.saves.nextLaunch.name },
  ];

  return <section className="mt-4 grid gap-4">
    <div className="panel flex items-center justify-between gap-6 px-6 py-[22px] max-[560px]:flex-col max-[560px]:items-start">
      <div><span className="eyebrow">CONNECTION ADDRESS</span><h3 className="mb-1 mt-[5px] text-base">{overview.connection.configured ? '局域网联机地址' : '尚未配置联机地址'}</h3><p className="m-0 text-[11px] text-[#69736d]">{overview.connection.configured ? '点击复制后粘贴到 Factorio 的“连接到地址”。' : '请在 .env 中设置 FACTORIO_ADDRESS 为服务器的 Tailscale 地址。'}</p></div>
      {overview.connection.address && <CopyConnectionButton address={overview.connection.address} />}
    </div>
    <div className="grid grid-cols-5 gap-3 max-[850px]:grid-cols-2 max-[560px]:grid-cols-1">
      {cards.map(({ icon: Icon, label, value }) => <article className="panel grid min-w-0 grid-cols-[auto_1fr] items-center gap-[9px] p-[17px]" key={label}>
        <Icon className="text-[var(--orange)]" size={17} /><span className="font-mono text-[8px] tracking-[.14em] text-[#69736d]">{label}</span><strong className="col-span-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-[#d9dfdb]" title={value}>{value}</strong>
      </article>)}
    </div>
  </section>;
}
