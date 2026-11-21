import { Activity, CalendarDays, LogOut, Package, QrCode, Settings, Ticket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES, type RouteId } from '../routes';

const ICONS: Record<RouteId, LucideIcon> = {
  live: Activity,
  today: CalendarDays,
  handover: Package,
  passes: Ticket,
  'check-in': QrCode,
  setup: Settings,
};

export function Nav({ current, rangeName, account }: { current: RouteId; rangeName?: string; account?: { email: string; onSignOut: () => void } }) {
  return (
    <nav className="nav" aria-label="Console">
      <div className="nav__brand">
        <span className="brand">
          <i aria-hidden="true" />
          RangeOps
        </span>
        <span className="nav__sub">Console{rangeName ? ` · ${rangeName}` : ''}</span>
      </div>
      <ul className="nav__links">
        {ROUTES.map((route) => {
          const Icon = ICONS[route.id];
          return (
            <li key={route.id}>
              <a
                href={`#/${route.id}`}
                className="nav__link"
                aria-current={current === route.id ? 'page' : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                {route.label}
              </a>
            </li>
          );
        })}
      </ul>
      {account && (
        <div className="nav__account">
          <span title={account.email}>{account.email}</span>
          <button className="nav__link nav__signout" type="button" onClick={account.onSignOut}>
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
