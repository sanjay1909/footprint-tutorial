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
  subtitle: 'Build → Run → Traverse → Observe',
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
          explanation: 'The pipeline is built. Everything is connected and ready to execute.',
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
// 3. Every write is tracked`,
          highlightLines: [14, 15],
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'Pipeline Complete',
            body: 'Three stages, shared Scope memory, declarative connections. The flowchart is ready to execute.',
          },
        },
      ],
      exitModal: {
        slides: [
          {
            title: 'Pipeline Built',
            body: 'You defined a 3-stage checkout pipeline using FlowChartBuilder. Each stage communicates through Scope — shared memory that tracks every read and write.',
            bullets: [
              'ValidateCart → ProcessPayment → SendReceipt',
              'Stages are decoupled — they only know about Scope',
              'The builder creates a flowchart you can execute',
            ],
          },
          {
            title: 'Time to Execute',
            body: 'A pipeline normally executes when a user clicks, a system triggers, an event fires, or a service call arrives. Let\'s do that now.',
          },
        ],
        actionLabel: 'Run Pipeline',
      },
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
      exitModal: {
        slides: [
          {
            title: 'Execution Complete',
            body: 'The pipeline ran successfully. Each stage executed in order, reading and writing to Scope. Memory captured every mutation.',
          },
          {
            title: 'What If Something Goes Wrong?',
            body: 'When errors happen, you need answers: What ran? In what order? What data existed at each step? Can a human debug this? Can an LLM reason about it? Only if you capture the right data.',
            bullets: [
              'What was the exact execution path?',
              'What state existed at each stage?',
              'What decisions were made and why?',
              'If we can traverse the execution path again, we can get those details.',
            ],
          },
        ],
        actionLabel: "Let's Traverse",
      },
    },

    // ── Phase 3: TRAVERSE (replay execution path) ──────────────
    {
      kind: 'traverse',
      id: 'traverse',
      title: 'Traverse',
      left: 'flowchart',
      right: 'memory',
      transition: 'slide-left',
      steps: [], // Derived from execution snapshots at runtime
      exitModal: {
        slides: [
          {
            title: 'Traversal Complete',
            body: 'You walked through every stage — seeing the structure (Map), execution order (Path), and data captured at each point (Trace). Here is the full traversal data:',
            jsonPreview: true,
          },
          {
            title: 'From Data to Insight',
            body: 'Raw traversal data is powerful but not enough on its own. What if you could extract specific information while traversing — metrics for dashboards, error context for debugging, decision traces for AI reasoning? That\'s where observability comes in.',
          },
        ],
        actionLabel: 'See Observability',
      },
    },

    // ── Phase 4: OBSERVE (extract + feed systems) ──────────────
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
          label: 'Extracting from Traversal',
          explanation: 'TraversalExtractor hooks into each stage during traversal — capturing scope state, outputs, and metadata.',
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'TraversalExtractor',
            body: 'While traversing the execution path, extractors pull specific data at each stage. This is the bridge from raw traversal data to structured observability.',
          },
        },
        {
          id: 'recorders',
          label: 'Recorders Feed Systems',
          explanation: 'NarrativeRecorder generates human-readable stories. MetricRecorder tracks counts and timing. Each feeds a different system.',
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'Pluggable Recorders',
            body: 'NarrativeRecorder → audit trails & AI context. MetricRecorder → dashboards & alerts. DebugRecorder → error investigation. Each extracts what its system needs.',
          },
        },
        {
          id: 'full-picture',
          label: 'This is Observability',
          explanation: 'Build pipelines from functions. Run with shared memory. Traverse to capture. Extract to observe.',
          nodes: ALL_NODES,
          edges: ALL_EDGES,
          concept: {
            title: 'FootPrint',
            body: 'Observability isn\'t just logging — it\'s extracting structured, causal context from execution traversals and feeding it to the systems that need it: AI reasoning, dashboards, debugging, audit.',
          },
        },
      ],
    },
  ],
};
