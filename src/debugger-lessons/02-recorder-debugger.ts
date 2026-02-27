import type { BaseState } from 'footprint';
import type { DebuggerLessonConfig } from '../debugger/types';

const validateCart = async (scope: BaseState) => {
  scope.setObject(['pipeline'], 'cartTotal', 209.96);
  scope.setObject(['pipeline'], 'itemCount', 4);
  scope.setObject(['pipeline'], 'validated', true);
  return { valid: true, total: 209.96 };
};

const processPayment = async (scope: BaseState) => {
  const total = scope.getValue(['pipeline'], 'cartTotal') as number;
  scope.setObject(['pipeline'], 'transactionId', 'TXN-4289');
  scope.setObject(['pipeline'], 'paymentStatus', 'charged');
  return { success: true, amount: total };
};

const sendReceipt = async (scope: BaseState) => {
  const txId = scope.getValue(['pipeline'], 'transactionId') as string;
  const total = scope.getValue(['pipeline'], 'cartTotal') as number;
  scope.setObject(['pipeline'], 'receiptSent', true);
  return { sent: true, receiptId: `RCP-${txId}`, total };
};

export const recorderDebugger: DebuggerLessonConfig = {
  id: 'recorder-debugger',
  title: 'Recorder & Debug',
  subtitle: 'Capture every read and write with NarrativeRecorder',
  difficulty: 'intermediate',
  enableNarrative: true,
  stages: [
    { name: 'ValidateCart', fn: validateCart, description: 'Verify cart contents and calculate total' },
    { name: 'ProcessPayment', fn: processPayment, description: 'Charge the payment method' },
    { name: 'SendReceipt', fn: sendReceipt, description: 'Email confirmation to customer' },
  ],
  buildSteps: [
    {
      id: 'intro-recorder',
      label: 'What is a Recorder?',
      explanation: 'Recorders observe every scope read and write, capturing a detailed trace of data flow.',
      code: `import { NarrativeRecorder } from 'footprint/dist/scope/recorders';

// A recorder hooks into scope operations
const recorder = new NarrativeRecorder({ detail: 'full' });

// Attach to your scope to capture reads/writes
// recorder.onRead({ stageName, path, key, value })
// recorder.onWrite({ stageName, path, key, value, operation })`,
      nodes: [],
      edges: [],
      concept: {
        title: 'Why Recorders?',
        body: 'Without recorders, you only see stage outputs. With recorders, you see every getValue() and setObject() call — the full data flow.',
      },
    },
    {
      id: 'attach-recorder',
      label: 'Attaching a Recorder',
      explanation: 'Build the pipeline the same way. The recorder captures data as each stage runs.',
      code: `const recorder = new NarrativeRecorder({ detail: 'full' });

// After pipeline runs, inspect per-stage data:
const stageData = recorder.getStageData();
// => Map {
//   'ValidateCart' => {
//     reads: [],
//     writes: [
//       { type: 'write', path: ['pipeline'], key: 'cartTotal', valueSummary: '209.96' },
//       { type: 'write', path: ['pipeline'], key: 'itemCount', valueSummary: '4' },
//     ]
//   },
//   'ProcessPayment' => { reads: [...], writes: [...] }
// }`,
      highlightLines: [4, 15],
      nodes: [
        { id: 'ValidateCart', label: 'ValidateCart', type: 'stage', description: 'Verify cart & total' },
        { id: 'ProcessPayment', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' },
        { id: 'SendReceipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-ValidateCart-ProcessPayment', source: 'ValidateCart', target: 'ProcessPayment' },
        { id: 'e-ProcessPayment-SendReceipt', source: 'ProcessPayment', target: 'SendReceipt' },
      ],
      newNodeIds: ['ValidateCart', 'ProcessPayment', 'SendReceipt'],
      concept: {
        title: 'Per-Stage Traces',
        body: 'The recorder groups operations by stage. You can see exactly what each stage read from scope and what it wrote back.',
      },
    },
    {
      id: 'sentences',
      label: 'Human-Readable Sentences',
      explanation: 'The recorder can convert its data into human-readable sentences.',
      code: `const sentences = recorder.toSentences();
// => Map {
//   'ValidateCart' => [
//     '  - Wrote: pipeline.cartTotal = 209.96',
//     '  - Wrote: pipeline.itemCount = 4',
//     '  - Wrote: pipeline.validated = true',
//   ],
//   'ProcessPayment' => [
//     '  - Read: pipeline.cartTotal = 209.96',
//     '  - Wrote: pipeline.transactionId = "TXN-4289"',
//     '  - Wrote: pipeline.paymentStatus = "charged"',
//   ]
// }`,
      highlightLines: [1, 13],
      nodes: [
        { id: 'ValidateCart', label: 'ValidateCart', type: 'stage', description: 'Verify cart & total' },
        { id: 'ProcessPayment', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' },
        { id: 'SendReceipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-ValidateCart-ProcessPayment', source: 'ValidateCart', target: 'ProcessPayment' },
        { id: 'e-ProcessPayment-SendReceipt', source: 'ProcessPayment', target: 'SendReceipt' },
      ],
    },
  ],
};
