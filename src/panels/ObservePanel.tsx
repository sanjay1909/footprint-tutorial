import { useState, useEffect, useCallback } from 'react';
import type { CapturedStageState, ExecutionResult } from '../wizard/types';

interface ObservePanelProps {
  execution: ExecutionResult | null;
  currentSnapshot?: CapturedStageState;
  narrativeLines: string[];
}

export function ObservePanel({ execution, currentSnapshot, narrativeLines }: ObservePanelProps) {
  if (!execution) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <h3 className="text-xs font-semibold text-cyan uppercase tracking-wider">Observability</h3>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="text-2xl mb-2 opacity-30">&#x1f50d;</div>
            <p className="text-xs text-muted">Run the pipeline first to see observability data</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ObservePanelContent
      execution={execution}
      currentSnapshot={currentSnapshot}
      narrativeLines={narrativeLines}
    />
  );
}

function ObservePanelContent({
  execution,
  currentSnapshot,
  narrativeLines,
}: {
  execution: ExecutionResult;
  currentSnapshot?: CapturedStageState;
  narrativeLines: string[];
}) {
  const snapshots = execution.stageSnapshots;

  // ─── Replay State ─────────────────────────────────────────
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  const startReplay = useCallback(() => {
    setReplayIndex(0);
    setIsReplaying(true);
  }, []);

  const stopReplay = useCallback(() => {
    setIsReplaying(false);
    setReplayIndex(null);
  }, []);

  useEffect(() => {
    if (!isReplaying || replayIndex === null) return;
    // Linger on last stage before stopping
    const delay = replayIndex >= snapshots.length - 1 ? 2000 : 1200;
    const timer = setTimeout(() => {
      if (replayIndex < snapshots.length - 1) {
        setReplayIndex(replayIndex + 1);
      } else {
        setIsReplaying(false);
        setReplayIndex(null);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [replayIndex, isReplaying, snapshots.length]);

  const activeReplayStage = replayIndex !== null ? snapshots[replayIndex]?.stageName : null;

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-cyan uppercase tracking-wider">Observability</h3>
          {currentSnapshot && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan/20 text-cyan">
              {currentSnapshot.stageName}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ─── Mini Pipeline + Replay ─────────────────────────── */}
        <div className="rounded border border-border bg-surface2/50 p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-cyan">Execution Replay</span>
            <button
              onClick={isReplaying ? stopReplay : startReplay}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                isReplaying
                  ? 'bg-orange/20 text-orange border border-orange/40 hover:bg-orange/30'
                  : 'bg-green/20 text-green border border-green/40 hover:bg-green/30'
              }`}
            >
              {isReplaying ? 'Stop' : 'Replay'}
            </button>
          </div>

          {/* Mini pipeline visualization */}
          <div className="flex items-center justify-center gap-0">
            {snapshots.map((snap, i) => (
              <div key={snap.stageName} className="flex items-center">
                <div
                  className={`px-2.5 py-1.5 rounded text-[10px] font-mono transition-all duration-300 border ${
                    activeReplayStage === snap.stageName
                      ? 'bg-green/20 text-green border-green/50 scale-105 shadow-lg shadow-green/10'
                      : replayIndex !== null && i < (replayIndex ?? 0)
                        ? 'bg-green/10 text-green/60 border-green/20'
                        : 'bg-surface/50 text-muted border-border'
                  }`}
                >
                  {snap.stageName}
                </div>
                {i < snapshots.length - 1 && (
                  <div className={`w-4 h-px mx-0.5 transition-colors duration-300 ${
                    replayIndex !== null && i < (replayIndex ?? 0)
                      ? 'bg-green/50'
                      : 'bg-border'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Replay stage detail */}
          {activeReplayStage && (
            <div className="mt-2 px-2 py-1.5 rounded bg-green/5 border border-green/20">
              <p className="text-[10px] text-green font-mono">
                {activeReplayStage}: {extractKeysForStage(snapshots, replayIndex ?? 0)}
              </p>
            </div>
          )}
        </div>

        {/* ─── TraversalExtractor ──────────────────────────────── */}
        <div className="rounded border border-border bg-surface2/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-xs font-semibold text-accent">TraversalExtractor</span>
          </div>
          <p className="text-[11px] text-muted mb-2">
            Captures a snapshot at each stage during traversal
          </p>
          <div className="space-y-1">
            {snapshots.map((snap, i) => (
              <div
                key={snap.stageName}
                className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono transition-colors duration-300 ${
                  activeReplayStage === snap.stageName
                    ? 'bg-green/10 text-green'
                    : currentSnapshot?.stageName === snap.stageName
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted'
                }`}
              >
                <span className="text-muted">{i + 1}.</span>
                <span>{snap.stageName}</span>
                <span className="text-muted ml-auto">
                  {Object.keys(extractPipelineState(snap.scopeState)).length} keys
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Narrative Recorder ──────────────────────────────── */}
        {narrativeLines.length > 0 && (
          <div className="rounded border border-border bg-surface2/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green" />
              <span className="text-xs font-semibold text-green">NarrativeRecorder</span>
            </div>
            <p className="text-[11px] text-muted mb-2">
              Generates human-readable execution story
            </p>
            <div className="space-y-1 max-h-[120px] overflow-auto">
              {narrativeLines.map((line, i) => (
                <p
                  key={i}
                  className={`text-[11px] font-mono leading-relaxed ${
                    i === narrativeLines.length - 1 ? 'text-green' : 'text-cyan/60'
                  }`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ─── Metrics ─────────────────────────────────────────── */}
        <div className="rounded border border-border bg-surface2/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-orange" />
            <span className="text-xs font-semibold text-orange">MetricRecorder</span>
          </div>
          <p className="text-[11px] text-muted mb-2">
            Tracks reads, writes, and timing per stage
          </p>
          <div className="grid grid-cols-3 gap-2">
            <MetricCard label="Stages" value={snapshots.length} color="text-accent" />
            <MetricCard
              label="Total Keys"
              value={snapshots.reduce(
                (sum, s) => sum + Object.keys(extractPipelineState(s.scopeState)).length,
                0,
              )}
              color="text-cyan"
            />
            <MetricCard label="Snapshots" value={snapshots.length} color="text-green" />
          </div>
        </div>

        {/* ─── What this enables ───────────────────────────────── */}
        <div className="rounded border border-accent/30 bg-accent/5 p-3">
          <p className="text-xs font-semibold text-accent mb-1">What you can do with this trace</p>
          <ul className="text-[11px] text-muted space-y-1">
            <li>&#x2022; Feed execution context to AI for reasoning</li>
            <li>&#x2022; Build dashboards from metrics</li>
            <li>&#x2022; Debug with full scope replay</li>
            <li>&#x2022; Generate human-readable audit trails</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 rounded bg-surface/50">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function extractPipelineState(scopeState: Record<string, unknown>): Record<string, unknown> {
  const state = scopeState as any;
  if (state?.pipelines) {
    const keys = Object.keys(state.pipelines);
    if (keys.length === 1) {
      const ps = state.pipelines[keys[0]];
      return ps?.pipeline ?? ps ?? {};
    }
    return state.pipelines;
  }
  return state;
}

/** Extract keys written by a specific stage (diff with previous) */
function extractKeysForStage(snapshots: CapturedStageState[], index: number): string {
  const current = extractPipelineState(snapshots[index].scopeState);
  const currentKeys = Object.keys(current);

  if (index === 0) {
    return `wrote ${currentKeys.join(', ')}`;
  }

  const prev = extractPipelineState(snapshots[index - 1].scopeState);
  const prevKeys = new Set(Object.keys(prev));
  const newKeys = currentKeys.filter(k => !prevKeys.has(k));
  const changedKeys = currentKeys.filter(k => prevKeys.has(k) && current[k] !== prev[k]);

  const parts: string[] = [];
  if (newKeys.length > 0) parts.push(`wrote ${newKeys.join(', ')}`);
  if (changedKeys.length > 0) parts.push(`updated ${changedKeys.join(', ')}`);
  return parts.join('; ') || 'no changes';
}
