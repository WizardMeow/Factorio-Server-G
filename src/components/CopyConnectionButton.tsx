import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Browser rejected the copy request');
}

export function CopyConnectionButton({ address, compact = false }: { address: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await copyText(address);
      setCopied(true);
      toast.success(`已复制联机地址：${address}`);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      toast.error(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return <button className={compact ? 'm-0 flex items-center gap-2 font-mono text-[9px] tracking-[.18em] text-[#78817c] max-[560px]:hidden' : 'shrink-0 font-mono tracking-[.08em]'} title="复制 Factorio 联机地址" onClick={() => void copy()}>
    {copied ? <Check size={14} /> : <Copy size={14} />}JOIN {address}
  </button>;
}
