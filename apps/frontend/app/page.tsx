import { CreateProjectPanel } from '@/components/dashboard/CreateProjectPanel';
import { RecentProjectsGrid } from '@/components/dashboard/RecentProjectsGrid';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-400">AI Video Cutter</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Dashboard</h1>
      </header>

      <CreateProjectPanel />
      <RecentProjectsGrid />
    </div>
  );
}
