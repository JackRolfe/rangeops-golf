import type { CSSProperties } from 'react';
import { Gamepad2, Settings, type LucideIcon } from 'lucide-react';

/** The app's top-level tabs. Drive joins in stage 2; Book and Balls in stage 4. */
export type TabId = 'games' | 'settings';

export interface TabDefinition {
  id: TabId;
  label: string;
  Icon: LucideIcon;
}

export const TABS: readonly TabDefinition[] = [
  { id: 'games', label: 'Games', Icon: Gamepad2 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

interface TabBarProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
  tabs?: readonly TabDefinition[];
}

export function TabBar({ active, onSelect, tabs = TABS }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="Tabs" style={{ '--tab-count': tabs.length } as CSSProperties}>
      {tabs.map(({ id, label, Icon }) => {
        const selected = active === id;
        return (
          <button
            className={`tab-bar__item ${selected ? 'is-active' : ''}`}
            type="button"
            key={id}
            aria-current={selected ? 'page' : undefined}
            onClick={() => onSelect(id)}
          >
            <Icon aria-hidden="true" strokeWidth={selected ? 2.4 : 1.9} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
