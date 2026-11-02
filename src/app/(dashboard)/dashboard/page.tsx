// @polsia:user-owned — server-rendered shell for Kithwheel's coordinator workspace.
import type { Metadata } from 'next';
import { CoordinatorWorkspace } from '@/components/custom/scheduling/coordinator-workspace';

export const metadata: Metadata = {
  title: 'Co-op schedules | Kithwheel',
  description: 'Create, review, publish, and withdraw your co-op class schedules.',
};

export default function DashboardPage() {
  return <CoordinatorWorkspace />;
}
