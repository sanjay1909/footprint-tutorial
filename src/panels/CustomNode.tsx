import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface StageNodeData {
  label: string;
  nodeType: 'stage' | 'decider' | 'fork' | 'start' | 'end';
  description?: string;
  isNew?: boolean;
  isActive?: boolean;
  isDimmed?: boolean;
  [key: string]: unknown;
}

export function StageNode({ data }: NodeProps) {
  const d = data as StageNodeData;
  const isDecider = d.nodeType === 'decider';
  const isActive = d.isActive;
  const isDimmed = d.isDimmed;
  const isNew = d.isNew;

  const baseClasses = `
    px-4 py-2.5 rounded-lg border-2 text-center min-w-[120px] max-w-[180px] transition-all duration-300
    ${isNew ? 'node-enter' : ''}
    ${isActive ? 'node-active' : ''}
  `;

  const colorClasses = isActive
    ? 'border-green bg-green/10 text-green'
    : isDecider
      ? 'border-orange/60 bg-orange/5 text-orange border-dashed'
      : isDimmed
        ? 'border-border/50 bg-surface/50 text-muted'
        : 'border-border bg-surface2 text-gray-200';

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2" />
      <div className={`${baseClasses} ${colorClasses}`}>
        <div className="text-sm font-medium leading-tight">{d.label}</div>
        {d.description && (
          <div className="text-[10px] mt-1 opacity-60 leading-tight">{d.description}</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2 !h-2" />
    </>
  );
}
