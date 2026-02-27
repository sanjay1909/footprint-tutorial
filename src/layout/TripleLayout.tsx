import type { ReactNode } from 'react';

interface TripleLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export function TripleLayout({ left, center, right }: TripleLayoutProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-[28%] border-r border-border overflow-auto bg-surface">
        {left}
      </div>
      <div className="w-[40%] border-r border-border overflow-hidden flex flex-col">
        {center}
      </div>
      <div className="w-[32%] overflow-auto bg-surface">
        {right}
      </div>
    </div>
  );
}
