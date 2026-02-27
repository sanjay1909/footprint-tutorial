interface NarrativePanelProps {
  lines: string[];
  stageOutput?: string;
}

export function NarrativePanel({ lines, stageOutput }: NarrativePanelProps) {
  if (lines.length === 0) return null;

  return (
    <div className="border-t border-border bg-surface p-3 max-h-[200px] overflow-auto shrink-0">
      <p className="text-xs font-semibold text-green mb-2 uppercase tracking-wider">
        Runtime Narrative
      </p>
      <ul className="space-y-1">
        {lines.map((line, i) => {
          const isLatest = i === lines.length - 1;
          return (
            <li key={i} className="flex gap-2 text-xs">
              <span className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${
                isLatest ? 'bg-green' : 'bg-cyan'
              }`} />
              <span className={isLatest ? 'text-gray-200' : 'text-gray-400'}>
                {line}
              </span>
            </li>
          );
        })}
      </ul>
      {stageOutput && (
        <div className="mt-2 p-2 rounded bg-surface2 border border-border">
          <p className="text-[10px] text-muted mb-1">Stage Output</p>
          <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap">{stageOutput}</pre>
        </div>
      )}
    </div>
  );
}
