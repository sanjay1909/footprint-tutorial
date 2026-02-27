import type { TutorialLesson } from '../tutorial/types';

export const helloPipeline: TutorialLesson = {
  id: 'hello-pipeline',
  title: 'Hello Pipeline',
  subtitle: 'Your first linear flow: A -> B -> C -> D',
  difficulty: 'beginner',
  buildSteps: [
    {
      id: 'imports',
      label: 'Import FootPrint',
      explanation: 'Import FlowChartBuilder to define flows and BaseState for shared state.',
      code: `import { FlowChartBuilder, BaseState } from 'footprint';

const scopeFactory = (ctx: any, stageName: string, readOnly?: unknown) =>
  new BaseState(ctx, stageName, readOnly);`,
      nodes: [],
      edges: [],
      concept: {
        title: 'What is FootPrint?',
        body: 'FootPrint is a pipeline orchestration library. You define stages, chain them, and execute. Stages share state through scope (BaseState).',
      },
    },
    {
      id: 'first-stage',
      label: 'start() — Entry Point',
      explanation: '.start() defines the first stage. The stage function receives scope and returns a result.',
      code: `const validateCart = async (scope: BaseState) => {
  scope.setObject(['pipeline'], 'cartTotal', 209.96);
  scope.setObject(['pipeline'], 'itemCount', 4);
  return { valid: true, total: 209.96 };
};

new FlowChartBuilder()
  .start('ValidateCart', validateCart)`,
      highlightLines: [7, 8],
      nodes: [
        { id: 'validate', label: 'ValidateCart', type: 'stage', description: 'Verify cart & calculate total' },
      ],
      edges: [],
      newNodeIds: ['validate'],
    },
    {
      id: 'second-stage',
      label: 'addFunction() — Chain Stages',
      explanation: '.addFunction() chains the next stage. It reads cartTotal from scope using getValue().',
      code: `const processPayment = async (scope: BaseState) => {
  const total = scope.getValue(['pipeline'], 'cartTotal') as number;
  scope.setObject(['pipeline'], 'transactionId', \`TXN-\${Date.now()}\`);
  return { success: true, amount: total };
};

  .addFunction('ProcessPayment', processPayment)`,
      highlightLines: [7, 7],
      nodes: [
        { id: 'validate', label: 'ValidateCart', type: 'stage', description: 'Verify cart & calculate total' },
        { id: 'process', label: 'ProcessPayment', type: 'stage', description: 'Charge payment method' },
      ],
      edges: [
        { id: 'e-v-p', source: 'validate', target: 'process' },
      ],
      newNodeIds: ['process'],
      concept: {
        title: 'Scope Communication',
        body: 'setObject() writes to scope, getValue() reads from it. Path [\'pipeline\'] is the standard namespace. Data flows forward through scope.',
      },
    },
    {
      id: 'remaining-stages',
      label: 'Complete the Chain',
      explanation: 'Add two more stages. sendReceipt reads from both validateCart and processPayment via scope.',
      code: `const updateInventory = async (scope: BaseState) => {
  const count = scope.getValue(['pipeline'], 'itemCount') as number;
  return { updated: true, itemsUpdated: count };
};

const sendReceipt = async (scope: BaseState) => {
  const txId = scope.getValue(['pipeline'], 'transactionId') as string;
  const total = scope.getValue(['pipeline'], 'cartTotal') as number;
  return { sent: true, receiptId: \`RCP-\${txId}\`, total };
};

  .addFunction('UpdateInventory', updateInventory)
  .addFunction('SendReceipt', sendReceipt)`,
      highlightLines: [12, 13],
      nodes: [
        { id: 'validate', label: 'ValidateCart', type: 'stage', description: 'Verify cart & calculate total' },
        { id: 'process', label: 'ProcessPayment', type: 'stage', description: 'Charge payment method' },
        { id: 'inventory', label: 'UpdateInventory', type: 'stage', description: 'Decrement stock' },
        { id: 'receipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-v-p', source: 'validate', target: 'process' },
        { id: 'e-p-i', source: 'process', target: 'inventory' },
        { id: 'e-i-r', source: 'inventory', target: 'receipt' },
      ],
      newNodeIds: ['inventory', 'receipt'],
    },
    {
      id: 'execute',
      label: '.execute() — Run It',
      explanation: '.execute(scopeFactory) builds and runs all stages in sequence. Returns the final stage output.',
      code: `const result = await new FlowChartBuilder()
  .start('ValidateCart', validateCart)
  .addFunction('ProcessPayment', processPayment)
  .addFunction('UpdateInventory', updateInventory)
  .addFunction('SendReceipt', sendReceipt)
  .execute(scopeFactory);

// result => { sent: true, receiptId: "RCP-TXN-...", total: 209.96 }`,
      highlightLines: [1, 6],
      nodes: [
        { id: 'validate', label: 'ValidateCart', type: 'stage', description: 'Verify cart & calculate total' },
        { id: 'process', label: 'ProcessPayment', type: 'stage', description: 'Charge payment method' },
        { id: 'inventory', label: 'UpdateInventory', type: 'stage', description: 'Decrement stock' },
        { id: 'receipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-v-p', source: 'validate', target: 'process' },
        { id: 'e-p-i', source: 'process', target: 'inventory' },
        { id: 'e-i-r', source: 'inventory', target: 'receipt' },
      ],
      concept: {
        title: 'Build vs Execute',
        body: '.execute(scopeFactory) builds and runs in one call. Use .build() + FlowChartExecutor separately when you need narrative, extractors, or other advanced features.',
      },
    },
  ],
  executeSteps: [
    {
      id: 'exec-validate',
      label: 'Executing: ValidateCart',
      activeNodeId: 'validate',
      activeEdgeIds: [],
      narrativeLine: 'The process began: Verify cart contents and calculate total.',
      stageOutput: '{ valid: true, total: 209.96 }',
    },
    {
      id: 'exec-process',
      label: 'Executing: ProcessPayment',
      activeNodeId: 'process',
      activeEdgeIds: ['e-v-p'],
      narrativeLine: 'Next step: Charge the payment method.',
      stageOutput: '{ success: true, amount: 209.96 }',
    },
    {
      id: 'exec-inventory',
      label: 'Executing: UpdateInventory',
      activeNodeId: 'inventory',
      activeEdgeIds: ['e-p-i'],
      narrativeLine: 'Next step: Decrement stock for purchased items.',
      stageOutput: '{ updated: true, itemsUpdated: 4 }',
    },
    {
      id: 'exec-receipt',
      label: 'Executing: SendReceipt',
      activeNodeId: 'receipt',
      activeEdgeIds: ['e-i-r'],
      narrativeLine: 'Next step: Email confirmation to customer.',
      stageOutput: '{ sent: true, receiptId: "RCP-TXN-...", total: 209.96 }',
    },
  ],
};
