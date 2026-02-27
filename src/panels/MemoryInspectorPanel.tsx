import { useState, useMemo } from 'react';
import { MemoryTreeView } from './MemoryTreeView';
import { diffScopeStates } from '../debugger/scopeDiff';
import type { CapturedStageState } from '../debugger/types';

interface MemoryInspectorProps {
  currentSnapshot?: CapturedStageState;
  previousSnapshot?: CapturedStageState;
  narrativeLines?: string[];
  phase: 'build' | 'execute';
}

type Tab = 'scope' | 'output' | 'narrative';

export function MemoryInspectorPanel({
  currentSnapshot,
  previousSnapshot,
  narrativeLines,
  phase,
}: MemoryInspectorProps) {
  const [activeTab, setActiveTab] = useState<Tab>('scope');

  const diff = useMemo(() => {
    if (!currentSnapshot?.scopeState) return undefined;
    const prev = previousSnapshot?.scopeState ?? {};
    return diffScopeStates(currentSnapshot.scopeState, prev);
  }, [currentSnapshot, previousSnapshot]);

  // Simplify scope state for display — extract the pipeline namespace
  const displayState = useMemo(() => {
    if (!currentSnapshot?.scopeState) return {};
    const state = currentSnapshot.scopeState as any;
    // Try to extract the pipeline-specific state
    if (state.pipelines) {
      const pipelineKeys = Object.keys(state.pipelines);
      if (pipelineKeys.length === 1) {
        const pipelineState = state.pipelines[pipelineKeys[0]];
        if (pipelineState?.pipeline) {
          return pipelineState.pipeline;
        }
        return pipelineState ?? {};
      }
      return state.pipelines;
    }
    return state;
  }, [currentSnapshot]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'scope', label: 'Scope' },
    { id: 'output', label: 'Output' },
    { id: 'narrative', label: 'Narrative' },
  ];

  if (phase === 'build') {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wider">Memory Inspector</h3>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="text-2xl mb-2 opacity-30">🔍</div>
            <p className="text-xs text-muted">Pipeline not yet executed</p>
            <p className="text-xs text-muted mt-1">Click <span className="text-accent">Run It</span> to see scope state</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-3 pb-0 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wider">Memory Inspector</h3>
          {currentSnapshot && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green/20 text-green">
              {currentSnapshot.stageName}
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-1 text-[11px] rounded-t transition-colors ${
                activeTab === tab.id
                  ? 'bg-surface2 text-gray-200 border-t border-x border-border'
                  : 'text-muted hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'scope' && (
          <MemoryTreeView
            data={displayState}
            diff={diff}
          />
        )}

        {activeTab === 'output' && (
          <div className="p-4">
            {currentSnapshot?.stageOutput ? (
              <pre className="text-xs font-mono text-gray-300 bg-surface2 rounded p-3 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(currentSnapshot.stageOutput, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-muted">No output for this stage</p>
            )}
          </div>
        )}

        {activeTab === 'narrative' && (
          <div className="p-4 space-y-2">
            {narrativeLines && narrativeLines.length > 0 ? (
              narrativeLines.map((line, i) => (
                <p
                  key={i}
                  className={`text-xs font-mono leading-relaxed ${
                    i === narrativeLines.length - 1
                      ? 'text-green'
                      : 'text-cyan/70'
                  }`}
                >
                  {line}
                </p>
              ))
            ) : (
              <p className="text-xs text-muted">No narrative generated yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
