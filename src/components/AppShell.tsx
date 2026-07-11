import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  className?: string;
  fullBleed?: boolean;
}

export function AppShell({ children, className = '', fullBleed = false }: AppShellProps) {
  return (
    <main className={`app-shell ${fullBleed ? 'app-shell--full' : ''} ${className}`.trim()}>
      {children}
    </main>
  );
}
