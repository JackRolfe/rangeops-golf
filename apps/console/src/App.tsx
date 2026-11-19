import { Nav } from './components/Nav';
import { useRoute, type RouteId } from './routes';
import { CheckInScreen } from './screens/CheckInScreen';
import { HandoverScreen } from './screens/HandoverScreen';
import { PassesScreen } from './screens/PassesScreen';
import { SetupScreen } from './screens/SetupScreen';
import { TodayScreen } from './screens/TodayScreen';

function Placeholder({ title }: { title: string }) {
  return (
    <section className="screen">
      <header className="screen__head">
        <h1>{title}</h1>
      </header>
    </section>
  );
}

const SCREENS: Record<RouteId, () => React.ReactElement> = {
  live: () => <Placeholder title="Live" />,
  today: TodayScreen,
  handover: HandoverScreen,
  passes: PassesScreen,
  'check-in': CheckInScreen,
  setup: SetupScreen,
};

export default function App() {
  const route = useRoute();
  const Screen = SCREENS[route];
  return (
    <div className="shell">
      <Nav current={route} />
      <main className="main">
        <Screen />
      </main>
    </div>
  );
}
