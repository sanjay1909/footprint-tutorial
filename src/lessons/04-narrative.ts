import type { TutorialLesson } from '../tutorial/types';

export const narrativeLesson: TutorialLesson = {
  id: 'narrative',
  title: 'The Story',
  subtitle: 'Generate human-readable execution narrative',
  difficulty: 'intermediate',
  buildSteps: [
    {
      id: 'with-descriptions',
      label: 'Stage Descriptions',
      explanation: 'Pass a description string to each stage. These flow into the runtime narrative.',
      code: `const chart = new FlowChartBuilder()
  .start('ValidateCart', validateCart,
    undefined, undefined, 'Verify cart contents and calculate total')
  .addFunction('ProcessPayment', processPayment,
    undefined, undefined, 'Charge the payment method')
  .addFunction('SendReceipt', sendReceipt,
    undefined, undefined, 'Email confirmation to customer')
  .build();`,
      highlightLines: [1, 8],
      nodes: [
        { id: 'validate', label: 'ValidateCart', type: 'stage', description: 'Verify cart contents' },
        { id: 'process', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' },
        { id: 'receipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-v-p', source: 'validate', target: 'process' },
        { id: 'e-p-r', source: 'process', target: 'receipt' },
      ],
      newNodeIds: ['validate', 'process', 'receipt'],
      concept: {
        title: 'Why Descriptions?',
        body: 'With a description, the narrative says: "Next step: Charge the payment method." Without, it falls back to: "Next, it moved on to ProcessPayment."',
      },
    },
    {
      id: 'enable-narrative',
      label: 'enableNarrative() + getNarrative()',
      explanation: 'Build the chart, create a FlowChartExecutor, enable narrative, run, then read the story.',
      code: `import { FlowChartBuilder, BaseState, FlowChartExecutor } from 'footprint';

// Build the chart with .build() (not .execute())
const chart = new FlowChartBuilder()
  .start('ValidateCart', validateCart,
    undefined, undefined, 'Verify cart contents and calculate total')
  .addFunction('ProcessPayment', processPayment,
    undefined, undefined, 'Charge the payment method')
  .addFunction('SendReceipt', sendReceipt,
    undefined, undefined, 'Email confirmation to customer')
  .build();

// Use FlowChartExecutor for narrative support
const executor = new FlowChartExecutor(chart, scopeFactory);
executor.enableNarrative();

const result = await executor.run();

const narrative = executor.getNarrative();
// => [
//   "The process began: Verify cart contents and calculate total.",
//   "Next step: Charge the payment method.",
//   "Next step: Email confirmation to customer."
// ]`,
      highlightLines: [14, 19],
      nodes: [
        { id: 'validate', label: 'ValidateCart', type: 'stage', description: 'Verify cart contents' },
        { id: 'process', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' },
        { id: 'receipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-v-p', source: 'validate', target: 'process' },
        { id: 'e-p-r', source: 'process', target: 'receipt' },
      ],
      concept: {
        title: 'When to use FlowChartExecutor',
        body: '.execute() is a shorthand. For enableNarrative(), getNarrative(), or other executor features, use .build() + FlowChartExecutor explicitly.',
      },
    },
  ],
  executeSteps: [
    {
      id: 'exec-validate',
      label: 'Executing: ValidateCart',
      activeNodeId: 'validate',
      narrativeLine: 'The process began: Verify cart contents and calculate total.',
      stageOutput: '{ valid: true }',
    },
    {
      id: 'exec-process',
      label: 'Executing: ProcessPayment',
      activeNodeId: 'process',
      activeEdgeIds: ['e-v-p'],
      narrativeLine: 'Next step: Charge the payment method.',
      stageOutput: '{ success: true }',
    },
    {
      id: 'exec-receipt',
      label: 'Executing: SendReceipt',
      activeNodeId: 'receipt',
      activeEdgeIds: ['e-p-r'],
      narrativeLine: 'Next step: Email confirmation to customer.',
      stageOutput: '{ sent: true }',
    },
  ],
};
