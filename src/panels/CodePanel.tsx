import { useEffect, useState, useRef } from 'react';
import { createHighlighter, type Highlighter } from 'shiki';

interface CodePanelProps {
  code: string;
  highlightLines?: [number, number];
  concept?: { title: string; body: string };
}

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: ['typescript'],
    });
  }
  return highlighterPromise;
}

export function CodePanel({ code, highlightLines, concept }: CodePanelProps) {
  const [html, setHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then(highlighter => {
      if (cancelled) return;

      // Build safe decorations — clamp to actual line count
      let decorations: any[] = [];
      if (highlightLines) {
        const lineCount = code.split('\n').length;
        const startLine = Math.max(0, highlightLines[0] - 1);
        const endLine = Math.min(highlightLines[1], lineCount);
        if (startLine < endLine && endLine <= lineCount) {
          decorations = [{
            start: { line: startLine, character: 0 },
            end: { line: endLine, character: 0 },
            properties: { class: 'code-highlight-line' },
          }];
        }
      }

      try {
        const result = highlighter.codeToHtml(code, {
          lang: 'typescript',
          theme: 'github-dark',
          decorations,
        });
        setHtml(result);
      } catch {
        // Fallback: render without decorations
        const result = highlighter.codeToHtml(code, {
          lang: 'typescript',
          theme: 'github-dark',
        });
        setHtml(result);
      }
    });
    return () => { cancelled = true; };
  }, [code, highlightLines]);

  useEffect(() => {
    if (highlightLines && codeRef.current) {
      const highlighted = codeRef.current.querySelector('.code-highlight-line');
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [html, highlightLines]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      {concept && (
        <div className="mx-4 mt-4 p-3 rounded-lg border border-accent/30 bg-accent/5">
          <p className="text-xs font-semibold text-accent mb-1">{concept.title}</p>
          <p className="text-xs text-gray-400 leading-relaxed">{concept.body}</p>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-xs text-muted font-medium uppercase tracking-wider">TypeScript</span>
        <button
          onClick={copyCode}
          className="text-xs px-2 py-1 rounded bg-surface2 text-muted hover:text-gray-200 border border-border hover:border-accent transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div
        ref={codeRef}
        className="flex-1 overflow-auto px-4 pb-4"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ fontSize: '13px', lineHeight: '1.6' }}
      />
    </div>
  );
}
