import { Nav } from './components/Nav';
import { useRoute, type RouteId } from './routes';

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
  today: () => <Placeholder title="Today" />,
  handover: () => <Placeholder title="Handover" />,
  passes: () => <Placeholder title="Passes" />,
  'check-in': () => <Placeholder title="Check-in QR" />,
  setup: () => <Placeholder title="Setup" />,
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
