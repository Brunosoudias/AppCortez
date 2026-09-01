'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { JobsStatusBar } from '@/components/layout/JobsStatusBar';
import { ToastProvider } from '@/components/layout/ToastProvider';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <JobsStatusBar />
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
