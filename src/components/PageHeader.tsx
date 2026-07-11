import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
}

export function PageHeader({ title, onBack, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      {onBack ? (
        <button className="icon-button" type="button" aria-label="Go back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
      ) : (
        <span className="page-header__spacer" aria-hidden="true" />
      )}
      <h1>{title}</h1>
      <div className="page-header__action">{action}</div>
    </header>
  );
}
