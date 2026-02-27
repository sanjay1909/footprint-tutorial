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

export const narrativeConstruction: DebuggerLessonConfig = {
  id: 'narrative-construction',
  title: 'Narrative',
  subtitle: 'Watch the execution story build sentence by sentence',
  difficulty: 'intermediate',
  enableNarrative: true,
  stages: [
    { name: 'ValidateCart', fn: validateCart, description: 'Verify cart contents and calculate total' },
    { name: 'ProcessPayment', fn: processPayment, description: 'Charge the payment method' },
    { name: 'SendReceipt', fn: sendReceipt, description: 'Email confirmation to customer' },
  ],
  buildSteps: [
    {
      id: 'descriptions',
      label: 'Stage Descriptions',
      explanation: 'Pass a description string to each stage. These flow into the runtime narrative.',
      code: `const chart = new FlowChartBuilder()
  .start('ValidateCart', validateCart,
    undefined, undefined,
    'Verify cart contents and calculate total')   // ← description
  .addFunction('ProcessPayment', processPayment,
    undefined, undefined,
    'Charge the payment method')                  // ← description
  .addFunction('SendReceipt', sendReceipt,
    undefined, undefined,
    'Email confirmation to customer')             // ← description
  .build();`,
      highlightLines: [4, 10],
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
        title: 'Why Descriptions?',
        body: 'With descriptions, narrative says: "Next step: Charge the payment method." Without: "Next, it moved on to ProcessPayment."',
      },
    },
    {
      id: 'enable-narrative',
      label: 'enableNarrative + getNarrative',
      explanation: 'Build the chart, create FlowChartExecutor, enable narrative, run, then read the story.',
      code: `import { FlowChartExecutor } from 'footprint';

const executor = new FlowChartExecutor(chart, scopeFactory);
executor.enableNarrative();

const result = await executor.run();
const narrative = executor.getNarrative();
// => [
//   "The process began: Verify cart contents and calculate total.",
//   "Next step: Charge the payment method.",
//   "Next step: Email confirmation to customer."
// ]`,
      highlightLines: [3, 7],
      nodes: [
        { id: 'ValidateCart', label: 'ValidateCart', type: 'stage', description: 'Verify cart & total' },
        { id: 'ProcessPayment', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' },
        { id: 'SendReceipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-ValidateCart-ProcessPayment', source: 'ValidateCart', target: 'ProcessPayment' },
        { id: 'e-ProcessPayment-SendReceipt', source: 'ProcessPayment', target: 'SendReceipt' },
      ],
      concept: {
        title: 'NarrativeGenerator Under the Hood',
        body: 'During traversal, handlers call onStageExecuted(), onNext(), onDecision(), etc. Each produces a sentence. getNarrative() returns them all.',
      },
    },
  ],
};
