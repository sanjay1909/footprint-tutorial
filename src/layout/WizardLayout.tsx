import type { ReactNode } from 'react';
import type { PanelSlot } from '../wizard/types';

interface WizardLayoutProps {
  left: PanelSlot;
  right: PanelSlot;
  isTransitioning: boolean;
  panels: Record<PanelSlot, ReactNode>;
}

/** All slots in DOM order. Only 2 are visible at a time (w-1/2), rest are w-0. */
const SLOT_ORDER: PanelSlot[] = ['code', 'flowchart', 'memory', 'observe'];

export function WizardLayout({ left, right, isTransitioning, panels }: WizardLayoutProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {SLOT_ORDER.map(slot => {
        const isLeft = slot === left;
        const isRight = slot === right;
        const isVisible = isLeft || isRight;

        return (
          <div
            key={slot}
            className={`transition-all duration-500 ease-in-out overflow-hidden ${
              isVisible ? 'w-1/2 opacity-100' : 'w-0 opacity-0'
            } ${isLeft ? 'border-r border-border' : ''} ${
              isVisible && !isTransitioning ? '' : ''
            }`}
            style={{ minWidth: isVisible ? '0' : '0' }}
          >
            <div className={`h-full ${isVisible ? '' : 'invisible'}`}>
              {panels[slot]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
