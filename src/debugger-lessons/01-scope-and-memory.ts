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

export const scopeAndMemory: DebuggerLessonConfig = {
  id: 'scope-memory',
  title: 'Scope & Memory',
  subtitle: 'Watch state appear and change as stages execute',
  difficulty: 'beginner',
  enableNarrative: true,
  stages: [
    { name: 'ValidateCart', fn: validateCart, description: 'Verify cart contents and calculate total' },
    { name: 'ProcessPayment', fn: processPayment, description: 'Charge the payment method' },
    { name: 'SendReceipt', fn: sendReceipt, description: 'Email confirmation to customer' },
  ],
  buildSteps: [
    {
      id: 'scope-factory',
      label: 'Scope Factory',
      explanation: 'Every pipeline needs a scope factory — it creates the BaseState that stages use to read and write shared memory.',
      code: `import { FlowChartBuilder, BaseState } from 'footprint';

const scopeFactory = (ctx, stageName, readOnly) => {
  return new BaseState(ctx, stageName, readOnly);
};`,
      nodes: [],
      edges: [],
      concept: {
        title: 'What is Scope?',
        body: 'Scope is the shared memory for your pipeline. Each stage can write to and read from it using namespace paths like [\'pipeline\'].',
      },
    },
    {
      id: 'validate-stage',
      label: 'ValidateCart stage',
      explanation: 'The first stage writes cartTotal, itemCount, and validated into scope.',
      code: `const validateCart = async (scope: BaseState) => {
  scope.setObject(['pipeline'], 'cartTotal', 209.96);
  scope.setObject(['pipeline'], 'itemCount', 4);
  scope.setObject(['pipeline'], 'validated', true);
  return { valid: true, total: 209.96 };
};

new FlowChartBuilder()
  .start('ValidateCart', validateCart)`,
      highlightLines: [2, 4],
      nodes: [
        { id: 'ValidateCart', label: 'ValidateCart', type: 'stage', description: 'Verify cart & total' },
      ],
      edges: [],
      newNodeIds: ['ValidateCart'],
    },
    {
      id: 'payment-stage',
      label: 'ProcessPayment stage',
      explanation: 'Reads cartTotal from scope, writes transactionId and paymentStatus back.',
      code: `const processPayment = async (scope: BaseState) => {
  const total = scope.getValue(['pipeline'], 'cartTotal');
  scope.setObject(['pipeline'], 'transactionId', 'TXN-4289');
  scope.setObject(['pipeline'], 'paymentStatus', 'charged');
  return { success: true, amount: total };
};

  .addFunction('ProcessPayment', processPayment)`,
      highlightLines: [2, 4],
      nodes: [
        { id: 'ValidateCart', label: 'ValidateCart', type: 'stage', description: 'Verify cart & total' },
        { id: 'ProcessPayment', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' },
      ],
      edges: [
        { id: 'e-ValidateCart-ProcessPayment', source: 'ValidateCart', target: 'ProcessPayment' },
      ],
      newNodeIds: ['ProcessPayment'],
      concept: {
        title: 'Scope Communication',
        body: 'ProcessPayment reads cartTotal that ValidateCart wrote. Stages communicate through scope — no direct function calls.',
      },
    },
    {
      id: 'receipt-stage',
      label: 'SendReceipt stage',
      explanation: 'Reads transactionId and cartTotal, writes receiptSent. Full pipeline ready.',
      code: `const sendReceipt = async (scope: BaseState) => {
  const txId = scope.getValue(['pipeline'], 'transactionId');
  const total = scope.getValue(['pipeline'], 'cartTotal');
  scope.setObject(['pipeline'], 'receiptSent', true);
  return { sent: true, receiptId: \`RCP-\${txId}\`, total };
};

  .addFunction('SendReceipt', sendReceipt)
  .execute(scopeFactory)`,
      highlightLines: [2, 4],
      nodes: [
        { id: 'ValidateCart', label: 'ValidateCart', type: 'stage', description: 'Verify cart & total' },
        { id: 'ProcessPayment', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' },
        { id: 'SendReceipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' },
      ],
      edges: [
        { id: 'e-ValidateCart-ProcessPayment', source: 'ValidateCart', target: 'ProcessPayment' },
        { id: 'e-ProcessPayment-SendReceipt', source: 'ProcessPayment', target: 'SendReceipt' },
      ],
      newNodeIds: ['SendReceipt'],
    },
  ],
};
