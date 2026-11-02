// Server-rendered shell for Kithwheel's coordinator workspace.
import type { Metadata } from 'next';
import { CoordinatorWorkspace } from '@/components/custom/scheduling/coordinator-workspace';

export const metadata: Metadata = {
  title: 'Co-op workspace | Kithwheel',
  description:
    'Schedules, families, check-in, announcements, volunteer hours and fees for your co-op.',
};

export default function DashboardPage() {
  return <CoordinatorWorkspace />;
}
