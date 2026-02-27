import type { ReactNode } from 'react';

interface SplitLayoutProps {
  left: ReactNode;
  right: ReactNode;
}

export function SplitLayout({ left, right }: SplitLayoutProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-1/2 border-r border-border overflow-auto">
        {left}
      </div>
      <div className="w-1/2 overflow-hidden flex flex-col">
        {right}
      </div>
    </div>
  );
}
