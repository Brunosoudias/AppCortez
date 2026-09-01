'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard, LayoutDashboard, FolderKanban, ListTodo, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projetos', icon: FolderKanban },
  { href: '/jobs', label: 'Fila', icon: ListTodo },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface-panel">
      <div className="flex items-center gap-2 border-b border-surface-border px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Clapperboard size={18} />
        </div>
        <div className="leading-none">
          <p className="text-sm font-semibold tracking-tight text-white">AI Video Cutter</p>
          <p className="text-[11px] text-zinc-500">local &amp; privado</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-600/15 text-brand-300'
                  : 'text-zinc-400 hover:bg-surface-raised hover:text-zinc-100',
              )}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-surface-border p-4 text-[11px] text-zinc-600">
        <p>Pronto — Whisper · IA · fila</p>
        <p>local &amp; privado</p>
      </div>
    </aside>
  );
}
