import type { ReactNode } from 'react';
import { AppShell } from '../components/AppShell';
import { PageHeader } from '../components/PageHeader';
import { TabBar, type TabId } from '../components/TabBar';

interface TabScreenProps {
  tab: TabId;
  title: string;
  onTab: (tab: TabId) => void;
  children: ReactNode;
  action?: ReactNode;
}

/** A tab with a header, a scrolling body and the tab bar. */
export function TabScreen({ tab, title, onTab, children, action }: TabScreenProps) {
  return (
    <AppShell className={`${tab}-screen`}>
      <PageHeader title={title} action={action} />
      <div className="screen-scroll tab-screen-body">{children}</div>
      <TabBar active={tab} onSelect={onTab} />
    </AppShell>
  );
}
