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

export const metricsLesson: DebuggerLessonConfig = {
  id: 'metrics',
  title: 'Metrics',
  subtitle: 'Track timing, read counts, and write counts per stage',
  difficulty: 'intermediate',
  enableNarrative: true,
  stages: [
    { name: 'ValidateCart', fn: validateCart, description: 'Verify cart contents and calculate total' },
    { name: 'ProcessPayment', fn: processPayment, description: 'Charge the payment method' },
    { name: 'SendReceipt', fn: sendReceipt, description: 'Email confirmation to customer' },
  ],
  buildSteps: [
    {
      id: 'intro-metrics',
      label: 'What are Metrics?',
      explanation: 'MetricRecorder tracks operational counts and timing for each stage.',
      code: `import { MetricRecorder } from 'footprint/dist/scope/recorders';

const metrics = new MetricRecorder({ id: 'pipeline-metrics' });

// MetricRecorder tracks per stage:
//   readCount  — number of scope reads
//   writeCount — number of scope writes
//   commitCount — number of atomic commits
//   totalDuration — execution time in ms`,
      nodes: [],
      edges: [],
      concept: {
        title: 'Why Metrics?',
        body: 'Metrics help you find bottlenecks. Which stage is slowest? Which writes the most? MetricRecorder answers these questions.',
      },
    },
    {
      id: 'reading-metrics',
      label: 'Reading Metrics',
      explanation: 'After pipeline execution, read aggregated metrics or per-stage metrics.',
      code: `const aggregated = metrics.getMetrics();
// => {
//   totalReadCount: 4,
//   totalWriteCount: 7,
//   totalCommitCount: 3,
//   totalDuration: 12,        // ms
//   stageMetrics: {
//     'ValidateCart':   { readCount: 0, writeCount: 3, duration: 2 },
//     'ProcessPayment': { readCount: 1, writeCount: 2, duration: 5 },
//     'SendReceipt':    { readCount: 2, writeCount: 1, duration: 3 },
//   }
// }

// Or per stage:
const pmMetrics = metrics.getStageMetrics('ProcessPayment');
// => { readCount: 1, writeCount: 2, commitCount: 1, totalDuration: 5 }`,
      highlightLines: [1, 12],
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
        title: 'Production Monitoring',
        body: 'In production, MetricRecorder gives you the data you need for dashboards, alerting, and performance optimization.',
      },
    },
  ],
};
