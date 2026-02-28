import type { BaseState } from 'footprint';
import type { WizardChapter, FlowNode, FlowEdge } from '../wizard/types';

// ─── Stage Functions ──────────────────────────────────────────

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

// ─── Reusable Nodes & Edges ──────────────────────────────────

const N_VALIDATE: FlowNode = { id: 'ValidateCart', label: 'ValidateCart', type: 'stage', description: 'Verify cart & total' };
const N_PAYMENT: FlowNode = { id: 'ProcessPayment', label: 'ProcessPayment', type: 'stage', description: 'Charge payment' };
const N_RECEIPT: FlowNode = { id: 'SendReceipt', label: 'SendReceipt', type: 'stage', description: 'Email confirmation' };

const E_1: FlowEdge = { id: 'e-ValidateCart-ProcessPayment', source: 'ValidateCart', target: 'ProcessPayment' };
const E_2: FlowEdge = { id: 'e-ProcessPayment-SendReceipt', source: 'ProcessPayment', target: 'SendReceipt' };

const ALL_NODES = [N_VALIDATE, N_PAYMENT, N_RECEIPT];
const ALL_EDGES = [E_1, E_2];

// ─── The Story ───────────────────────────────────────────────

export const storyChapter: WizardChapter = {
  id: 'story',
  title: 'The FootPrint Story',
  subtitle: 'Build → Run → Observe',
  badge: 'STORY',
  badgeColor: 'cyan',
  phases: [
    // ── Phase 1: BUILD ────────────────────────────────────────
    {
      kind: 'static',
      id: 'build',
      title: 'Build',
      left: 'code',
      right: 'flowchart',
      transition: 'none',
      steps: [
        {
          id: 'familiar-functions',
          label: 'Familiar Functions',
          explanation: 'You already write async functions like these. Nothing special yet.',
          code: `// You already write code like this every day.
// Async functions that do one thing well.

const validateCart = async (data) => {
  const total = data.items.reduce(
    (sum, item) => sum + item.price * item.qty, 0
  );
  return { valid: true, total, itemCount: data.items.length };
};

const processPayment = async (data) => {
  const result = await chargeCard(data.cardId, data.total);
  return { success: true, transactionId: result.txId };
};

const sendReceipt = async (data) => {
  await emailService.send(data.email, data.receiptHtml);
  return { sent: true };
};`,
          nodes: [],
          edges: [],
          concept: {
            title: 'Starting Point',
            body: 'These are normal async functions. Each one does a specific job. But how do you connect them into a reliable pipeline?',
          },
        },
        {
          id: 'the-problem',
          label: 'The Challenge',
          explanation: 'Calling them in sequence gives you no shared state, no trace, no observability.',
          code: `// The traditional approach: call functions in sequence
async function checkout(cart, payment, email) {
  const validation = await validateCart(cart);
  if (!validation.valid) throw new Error('Invalid cart');

  const result = await processPayment({
    cardId: payment.cardId,
    total: validation.total,
  });

  await sendReceipt({
    email,
    receiptHtml: buildReceipt(result.transactionId),
  });

  return { validation, result };
}

// Questions:
// - How do functions share state?
// - Where is the execution trace?
// - How do you observe what happened?`,
          highlightLines: [20, 23],
          nodes: [],
          edges: [],
          concept: {
            title: 'The Challenge',
            body: 'Manual wiring gives you nothing for free — no shared memory, no trace, no observability. What if the pipeline itself could provide these?',
          },
        },
        {
          id: 'builder-import',
          label: 'FlowChartBuilder',
          explanation: 'Describe the flow declaratively instead of imperative calls.',
          code: `import { FlowChartBuilder, BaseState } from 'footprint';

// Instead of manually calling functions in sequence,
// describe the flow declaratively.

const builder = new FlowChartBuilder();`,
          nodes: [],
          edges: [],
          concept: {
            title: 'FlowChartBuilder',
            body: 'A fluent API to define pipelines. Instead of imperative calls, you describe what connects to what.',
          },
        },
        {
          id: 'first-stage',
          label: 'First Stage — start()',
          explanation: '.start() defines the entry point. A node appears in the flowchart.',
          code: `import { FlowChartBuilder, BaseState } from 'footprint';

const validateCart = async (scope: BaseState) => {
  scope.setObject(['pipeline'], 'cartTotal', 209.96);
  scope.setObject(['pipeline'], 'itemCount', 4);
  scope.setObject(['pipeline'], 'validated', true);
  return { valid: true, total: 209.96 };
};

new FlowChartBuilder()
  .start('ValidateCart', validateCart)`,
          highlightLines: [10, 11],
          nodes: [N_VALIDATE],
          edges: [],
          newNodeIds: ['ValidateCart'],
        },
        {
          id: 'second-stage',
          label: 'Add Stage — addFunction()',
          explanation: '.addFunction() chains the next stage. The edge is drawn automatically.',
          code: `const processPayment = async (scope: BaseState) => {
  const total = scope.getValue(['pipeline'], 'cartTotal');
  scope.setObject(['pipeline'], 'transactionId', 'TXN-4289');
  scope.setObject(['pipeline'], 'paymentStatus', 'charged');
  return { success: true, amount: total };
};

new FlowChartBuilder()
  .start('ValidateCart', validateCart)
  .addFunction('ProcessPayment', processPayment)`,
          highlightLines: [10, 10],
          nodes: [N_VALIDATE, N_PAYMENT],
          edges: [E_1],
          newNodeIds: ['ProcessPayment'],
        },
        {
          id: 'complete-pipeline',
          label: 'Complete Pipeline',
          explanation: 'Three stages chained. A complete checkout flow as a flowchart.',
          code: `const sendReceipt = async (scope: BaseState) => {
  const txId = scope.getValue(['pipeline'], 'transactionId');
  scope.setObject(['pipeline'], 'receiptSent', true);
  return { sent: true, receiptId: \`RCP-\${txId}\` };
};

new FlowChartBuilder()
  .start('ValidateCart', validateCart)
  .addFunction('ProcessPayment', processPayment)
  .addFunction('SendReceipt', sendReceipt)`,
          highlightLines: [10, 10],
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          newNodeIds: ['SendReceipt'],
        },
        {
          id: 'scope-memory',
          label: 'Shared Memory — Scope',
          explanation: 'Stages communicate through Scope. Write in one stage, read in the next.',
          code: `// ValidateCart WRITES to scope
const validateCart = async (scope: BaseState) => {
  scope.setObject(['pipeline'], 'cartTotal', 209.96);   // write
  scope.setObject(['pipeline'], 'itemCount', 4);          // write
  scope.setObject(['pipeline'], 'validated', true);        // write
};

// ProcessPayment READS from scope, then WRITES
const processPayment = async (scope: BaseState) => {
  const total = scope.getValue(['pipeline'], 'cartTotal'); // read
  scope.setObject(['pipeline'], 'transactionId', 'TXN-4289'); // write
  scope.setObject(['pipeline'], 'paymentStatus', 'charged');   // write
};

// Stages don't know about each other.
// They only know about Scope.`,
          highlightLines: [3, 5],
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'Scope Communication',
            body: 'Scope is shared memory. ValidateCart writes cartTotal. ProcessPayment reads it. No direct coupling between stages.',
          },
        },
        {
          id: 'ready-to-run',
          label: 'Ready to Run',
          explanation: 'The pipeline is built. Click "Run It" to execute it for real!',
          code: `// The pipeline is built. Time to run it.
const chart = new FlowChartBuilder()
  .start('ValidateCart', validateCart,
    undefined, undefined,
    'Verify cart contents and calculate total')
  .addFunction('ProcessPayment', processPayment,
    undefined, undefined,
    'Charge the payment method')
  .addFunction('SendReceipt', sendReceipt,
    undefined, undefined,
    'Email confirmation to customer')
  .build();

const executor = new FlowChartExecutor(chart, scopeFactory);
await executor.run();

// When this executes:
// 1. Each stage runs in order
// 2. Scope accumulates state (WriteBuffer commits per stage)
// 3. Every write is tracked
// → Click "Run It" — flowchart slides left, Memory appears`,
          highlightLines: [14, 15],
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'About to Execute',
            body: 'Click "Run It" to execute the pipeline for real. Watch the panels transition — flowchart moves left, Memory Inspector slides in from the right.',
          },
        },
      ],
    },

    // ── Phase 2: RUN (real execution) ─────────────────────────
    {
      kind: 'run',
      id: 'run',
      title: 'Run',
      left: 'flowchart',
      right: 'memory',
      transition: 'slide-left',
      stages: [
        { name: 'ValidateCart', fn: validateCart, description: 'Verify cart contents and calculate total' },
        { name: 'ProcessPayment', fn: processPayment, description: 'Charge the payment method' },
        { name: 'SendReceipt', fn: sendReceipt, description: 'Email confirmation to customer' },
      ],
      enableNarrative: true,
      steps: [], // Generated from execution results
    },

    // ── Phase 3: OBSERVE ──────────────────────────────────────
    {
      kind: 'static',
      id: 'observe',
      title: 'Observe',
      left: 'memory',
      right: 'observe',
      transition: 'slide-left',
      steps: [
        {
          id: 'extractors',
          label: 'What Was Extracted',
          explanation: 'TraversalExtractor captured a snapshot at each stage — scope state, outputs, metadata.',
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'TraversalExtractor',
            body: 'Hooks into each stage during traversal. Captures scope state, debug info, and outputs — the raw material for observability.',
          },
        },
        {
          id: 'recorders',
          label: 'Recorders',
          explanation: 'NarrativeRecorder generates human-readable stories. MetricRecorder tracks counts and timing.',
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'Built-in Recorders',
            body: 'NarrativeRecorder turns execution into a story. MetricRecorder counts reads, writes, and stages. DebugRecorder captures verbose logs.',
          },
        },
        {
          id: 'full-picture',
          label: 'The Full Picture',
          explanation: 'Build pipelines from functions. Run with shared memory. Observe everything.',
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'FootPrint',
            body: 'Connected execution logging. Transform application execution into structured, causal, replayable context — for AI reasoning, dashboards, or debugging.',
          },
        },
      ],
    },
  ],
};
