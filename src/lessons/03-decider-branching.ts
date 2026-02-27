import type { TutorialLesson } from '../tutorial/types';

export const deciderBranching: TutorialLesson = {
  id: 'decider-branching',
  title: 'Making Decisions',
  subtitle: 'Route to exactly ONE branch: A -> ? -> (B1 | B2 | B3)',
  difficulty: 'intermediate',
  buildSteps: [
    {
      id: 'analyze',
      label: 'start() — AnalyzeOrder',
      explanation: 'First stage determines the fulfillment type and writes it to scope for the decider.',
      code: `const analyzeOrder = async (scope: BaseState) => {
  const fulfillmentType = 'express'; // determined from order data
  scope.setObject(['pipeline'], 'fulfillmentType', fulfillmentType);
  return { orderId: 'ORD-EXP-002', fulfillmentType };
};

new FlowChartBuilder()
  .start('AnalyzeOrder', analyzeOrder)`,
      highlightLines: [7, 8],
      nodes: [
        { id: 'analyze', label: 'AnalyzeOrder', type: 'stage', description: 'Determine fulfillment type' },
      ],
      edges: [],
      newNodeIds: ['analyze'],
    },
    {
      id: 'decider',
      label: 'addDeciderFunction() + Branches',
      explanation: 'The decider reads fulfillmentType from scope and returns ONE branch ID. Each branch is a separate path.',
      code: `// Decider reads from scope, returns a branch ID string
const fulfillmentDecider = (scope: BaseState): string => {
  const type = scope.getValue(['pipeline'], 'fulfillmentType') as string;
  return type ?? 'standard';
};

const standardFulfillment = async () =>
  ({ method: 'standard', estimatedDays: 5, carrier: 'USPS' });
const expressFulfillment = async () =>
  ({ method: 'express', estimatedDays: 2, carrier: 'FedEx' });
const digitalDelivery = async () =>
  ({ method: 'digital', estimatedDays: 0, deliveryMethod: 'email' });

  .addDeciderFunction('FulfillmentDecider', fulfillmentDecider, 'decider')
    .addFunctionBranch('standard', 'StandardFulfillment', standardFulfillment)
    .addFunctionBranch('express', 'ExpressFulfillment', expressFulfillment)
    .addFunctionBranch('digital', 'DigitalDelivery', digitalDelivery)
    .end()`,
      highlightLines: [14, 18],
      nodes: [
        { id: 'analyze', label: 'AnalyzeOrder', type: 'stage', description: 'Determine fulfillment type' },
        { id: 'decider', label: 'FulfillmentDecider', type: 'decider', description: 'Route by type' },
        { id: 'standard', label: 'StandardFulfillment', type: 'stage', description: '3-5 days' },
        { id: 'express', label: 'ExpressFulfillment', type: 'stage', description: '1-2 days' },
        { id: 'digital', label: 'DigitalDelivery', type: 'stage', description: 'Instant' },
      ],
      edges: [
        { id: 'e-a-d', source: 'analyze', target: 'decider' },
        { id: 'e-d-s', source: 'decider', target: 'standard', label: 'standard' },
        { id: 'e-d-e', source: 'decider', target: 'express', label: 'express' },
        { id: 'e-d-dig', source: 'decider', target: 'digital', label: 'digital' },
      ],
      newNodeIds: ['decider', 'standard', 'express', 'digital'],
      concept: {
        title: 'Decider vs Parallel',
        body: 'Decider picks exactly ONE branch (if/else). addListOfFunction() runs ALL children in parallel. The decider function reads scope and returns the branch ID string.',
      },
    },
    {
      id: 'confirm',
      label: '.end() + Continue',
      explanation: '.end() closes the decider block. After the chosen branch, execution merges back to ConfirmOrder.',
      code: `const confirmOrder = async (scope: BaseState) => {
  return { status: 'confirmed', confirmedAt: new Date().toISOString() };
};

    .end()
  .addFunction('ConfirmOrder', confirmOrder)
  .execute(scopeFactory)`,
      highlightLines: [5, 7],
      nodes: [
        { id: 'analyze', label: 'AnalyzeOrder', type: 'stage', description: 'Determine fulfillment type' },
        { id: 'decider', label: 'FulfillmentDecider', type: 'decider', description: 'Route by type' },
        { id: 'standard', label: 'StandardFulfillment', type: 'stage', description: '3-5 days' },
        { id: 'express', label: 'ExpressFulfillment', type: 'stage', description: '1-2 days' },
        { id: 'digital', label: 'DigitalDelivery', type: 'stage', description: 'Instant' },
        { id: 'confirm', label: 'ConfirmOrder', type: 'stage', description: 'Finalize order' },
      ],
      edges: [
        { id: 'e-a-d', source: 'analyze', target: 'decider' },
        { id: 'e-d-s', source: 'decider', target: 'standard', label: 'standard' },
        { id: 'e-d-e', source: 'decider', target: 'express', label: 'express' },
        { id: 'e-d-dig', source: 'decider', target: 'digital', label: 'digital' },
        { id: 'e-s-c', source: 'standard', target: 'confirm' },
        { id: 'e-e-c', source: 'express', target: 'confirm' },
        { id: 'e-dig-c', source: 'digital', target: 'confirm' },
      ],
      newNodeIds: ['confirm'],
    },
  ],
  executeSteps: [
    {
      id: 'exec-analyze',
      label: 'Executing: AnalyzeOrder',
      activeNodeId: 'analyze',
      narrativeLine: 'The process began: Determine fulfillment type.',
      stageOutput: '{ orderId: "ORD-EXP-002", fulfillmentType: "express" }',
    },
    {
      id: 'exec-decider',
      label: 'Deciding: FulfillmentDecider',
      activeNodeId: 'decider',
      activeEdgeIds: ['e-a-d'],
      narrativeLine: 'A decision was made: the order requires express shipping, so the path taken was ExpressFulfillment.',
    },
    {
      id: 'exec-express',
      label: 'Executing: ExpressFulfillment',
      activeNodeId: 'express',
      activeEdgeIds: ['e-d-e'],
      narrativeLine: 'Next step: Process express shipment (1-2 days).',
      stageOutput: '{ method: "express", estimatedDays: 2, carrier: "FedEx" }',
    },
    {
      id: 'exec-confirm',
      label: 'Executing: ConfirmOrder',
      activeNodeId: 'confirm',
      activeEdgeIds: ['e-e-c'],
      narrativeLine: 'Next, it moved on to ConfirmOrder.',
      stageOutput: '{ status: "confirmed" }',
    },
  ],
};
