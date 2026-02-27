import { useState } from 'react';
import type { ScopeDiff } from '../debugger/scopeDiff';

interface MemoryTreeViewProps {
  data: Record<string, unknown>;
  diff?: ScopeDiff;
  path?: string;
  depth?: number;
}

function formatValue(value: unknown): { text: string; color: string } {
  if (value === null) return { text: 'null', color: 'text-muted' };
  if (value === undefined) return { text: 'undefined', color: 'text-muted' };
  if (typeof value === 'string') return { text: `"${value}"`, color: 'text-green' };
  if (typeof value === 'number') return { text: String(value), color: 'text-cyan' };
  if (typeof value === 'boolean') return { text: String(value), color: 'text-orange' };
  if (Array.isArray(value)) return { text: `[${value.length} items]`, color: 'text-muted' };
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return { text: `{${keys.length} keys}`, color: 'text-muted' };
  }
  return { text: String(value), color: 'text-muted' };
}

function TreeNode({ keyName, value, fullPath, diff, depth }: {
  keyName: string;
  value: unknown;
  fullPath: string;
  diff?: ScopeDiff;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;

  const isNew = diff?.added.has(fullPath);
  const isMutated = diff?.mutated.has(fullPath);

  const highlightClass = isNew
    ? 'bg-green/10 border-l-2 border-green'
    : isMutated
      ? 'bg-orange/10 border-l-2 border-orange'
      : '';

  const badge = isNew
    ? <span className="ml-1 text-[10px] px-1 rounded bg-green/20 text-green">NEW</span>
    : isMutated
      ? <span className="ml-1 text-[10px] px-1 rounded bg-orange/20 text-orange">CHANGED</span>
      : null;

  const { text, color } = formatValue(value);

  return (
    <div className={`${highlightClass} ${isNew || isMutated ? 'animate-flash' : ''}`}>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 hover:bg-surface2/50 cursor-pointer text-xs font-mono`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => isExpandable && setExpanded(!expanded)}
      >
        {isExpandable ? (
          <span className="text-muted w-3 text-center select-none">
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <span className="text-accent/80">{keyName}</span>
        <span className="text-muted">:</span>
        {!expanded || !isExpandable ? (
          <span className={color}>{text}</span>
        ) : null}
        {badge}
      </div>

      {expanded && isObject && (
        <div>
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <TreeNode
              key={k}
              keyName={k}
              value={v}
              fullPath={fullPath ? `${fullPath}.${k}` : k}
              diff={diff}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {expanded && isArray && (
        <div>
          {(value as unknown[]).map((item, i) => (
            <TreeNode
              key={i}
              keyName={`[${i}]`}
              value={item}
              fullPath={`${fullPath}[${i}]`}
              diff={diff}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MemoryTreeView({ data, diff, path = '', depth = 0 }: MemoryTreeViewProps) {
  const entries = Object.entries(data);

  if (entries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted text-xs">
        Scope is empty
      </div>
    );
  }

  return (
    <div className="py-1">
      {entries.map(([key, value]) => (
        <TreeNode
          key={key}
          keyName={key}
          value={value}
          fullPath={path ? `${path}.${key}` : key}
          diff={diff}
          depth={depth}
        />
      ))}
    </div>
  );
}
