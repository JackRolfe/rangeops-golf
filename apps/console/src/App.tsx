import { Nav } from './components/Nav';
import { useRoute, type RouteId } from './routes';
import { HandoverScreen } from './screens/HandoverScreen';
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
  passes: () => <Placeholder title="Passes" />,
  'check-in': () => <Placeholder title="Check-in QR" />,
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
