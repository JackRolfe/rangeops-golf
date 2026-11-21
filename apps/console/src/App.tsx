import type { ComponentType } from 'react';
import { Nav } from './components/Nav';
import { useRoute, type RouteId } from './routes';
import { CheckInScreen } from './screens/CheckInScreen';
import { HandoverScreen } from './screens/HandoverScreen';
import { LiveScreen } from './screens/LiveScreen';
import { PassesScreen } from './screens/PassesScreen';
import { SetupScreen } from './screens/SetupScreen';
import { TodayScreen } from './screens/TodayScreen';

const SCREENS: Record<RouteId, ComponentType> = {
  live: LiveScreen,
  today: TodayScreen,
  handover: HandoverScreen,
  passes: PassesScreen,
  'check-in': CheckInScreen,
  setup: SetupScreen,
};

export interface SignedInAccount {
  email: string;
  rangeName: string;
  onSignOut: () => void;
}

export default function App({ account }: { account?: SignedInAccount }) {
  const route = useRoute();
  const Screen = SCREENS[route];
  return (
    <div className="shell">
      <Nav current={route} rangeName={account?.rangeName} account={account} />
      <main className="main">
        <Screen />
      </main>
    </div>
  );
}
