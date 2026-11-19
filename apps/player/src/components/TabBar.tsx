import type { CSSProperties } from 'react';
import { Gamepad2, Joystick, Settings, type LucideIcon } from 'lucide-react';

/** The app's top-level tabs. Book and Balls join in stage 4. */
export type TabId = 'games' | 'drive' | 'settings';

export interface TabDefinition {
  id: TabId;
  label: string;
  Icon: LucideIcon;
}

export const TABS: readonly TabDefinition[] = [
  { id: 'games', label: 'Games', Icon: Gamepad2 },
  { id: 'drive', label: 'Drive', Icon: Joystick },
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
