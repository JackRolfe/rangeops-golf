import { BarChart3, CircleDot, Home } from 'lucide-react';

export type MainView = 'home' | 'practice' | 'history';

interface BottomNavProps {
  active: MainView;
  onNavigate: (view: MainView) => void;
  onPractice: () => void;
}

const ITEMS = [
  { id: 'home' as const, label: 'Home', Icon: Home },
  { id: 'practice' as const, label: 'Practice', Icon: CircleDot },
  { id: 'history' as const, label: 'History', Icon: BarChart3 },
];

export function BottomNav({ active, onNavigate, onPractice }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {ITEMS.map(({ id, label, Icon }) => {
        const selected = active === id;
        return (
          <button
            className={`bottom-nav__item ${selected ? 'is-active' : ''}`}
            type="button"
            key={id}
            aria-current={selected ? 'page' : undefined}
            onClick={() => (id === 'practice' ? onPractice() : onNavigate(id))}
          >
            <Icon aria-hidden="true" strokeWidth={selected ? 2.4 : 1.9} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
