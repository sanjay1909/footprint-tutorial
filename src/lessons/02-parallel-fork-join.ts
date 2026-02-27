import type { TutorialLesson } from '../tutorial/types';

export const parallelForkJoin: TutorialLesson = {
  id: 'parallel-fork-join',
  title: 'Parallel Fork-Join',
  subtitle: 'Run stages simultaneously: A -> [B1, B2, B3] -> C',
  difficulty: 'beginner',
  buildSteps: [
    {
      id: 'start-stage',
      label: 'Start: PrepareShipment',
      explanation: 'First stage writes data to scope. Parallel children will read from it.',
      code: `const prepareShipment = async (scope: BaseState) => {
  scope.setObject(['pipeline'], 'totalWeight', 2.2);
  scope.setObject(['pipeline'], 'destination', 'Seattle, WA');
  return { orderId: 'ORD-2024-001', totalWeight: 2.2 };
};

new FlowChartBuilder()
  .start('PrepareShipment', prepareShipment)`,
      highlightLines: [7, 8],
      nodes: [
        { id: 'prepare', label: 'PrepareShipment', type: 'stage', description: 'Initialize shipment data' },
      ],
      edges: [],
      newNodeIds: ['prepare'],
    },
    {
      id: 'parallel-children',
      label: 'addListOfFunction() — Fork',
      explanation: 'All three children run at the same time. Each can READ parent scope but writes are isolated.',
      code: `const calculateRate = async (scope: BaseState) => {
  const weight = scope.getValue(['pipeline'], 'totalWeight') as number;
  return { rate: 5.99 + weight * 2.5 };
};

const checkInventory = async (scope: BaseState) => {
  return { allAvailable: true, itemsReserved: 3 };
};

const validateAddress = async (scope: BaseState) => {
  const dest = scope.getValue(['pipeline'], 'destination') as string;
  return { valid: true, normalized: dest.toUpperCase() };
};

  .addListOfFunction([
    { id: 'rate', name: 'CalculateRate', fn: calculateRate },
    { id: 'inventory', name: 'CheckInventory', fn: checkInventory },
    { id: 'address', name: 'ValidateAddress', fn: validateAddress },
  ])`,
      highlightLines: [15, 20],
      nodes: [
        { id: 'prepare', label: 'PrepareShipment', type: 'stage', description: 'Initialize shipment data' },
        { id: 'rate', label: 'CalculateRate', type: 'stage', description: 'Compute shipping rate' },
        { id: 'inventory', label: 'CheckInventory', type: 'stage', description: 'Verify stock levels' },
        { id: 'address', label: 'ValidateAddress', type: 'stage', description: 'Normalize address' },
      ],
      edges: [
        { id: 'e-p-r', source: 'prepare', target: 'rate' },
        { id: 'e-p-i', source: 'prepare', target: 'inventory' },
        { id: 'e-p-a', source: 'prepare', target: 'address' },
      ],
      newNodeIds: ['rate', 'inventory', 'address'],
      concept: {
        title: 'Scope Isolation',
        body: 'Parallel children can READ parent scope, but their writes are ISOLATED — invisible to siblings and later stages. Return values pass data forward.',
      },
    },
    {
      id: 'join-stage',
      label: 'addFunction() — Join',
      explanation: 'After ALL children complete, execution continues. CreateLabel reads from parent scope (not children).',
      code: `const createLabel = async (scope: BaseState) => {
  // Reads from PARENT scope, not children's isolated scope
  const weight = scope.getValue(['pipeline'], 'totalWeight') as number;
  return { trackingNumber: \`TRK-\${Date.now()}\`, weight };
};

  .addFunction('CreateLabel', createLabel)
  .execute(scopeFactory)`,
      highlightLines: [7, 8],
      nodes: [
        { id: 'prepare', label: 'PrepareShipment', type: 'stage', description: 'Initialize shipment data' },
        { id: 'rate', label: 'CalculateRate', type: 'stage', description: 'Compute shipping rate' },
        { id: 'inventory', label: 'CheckInventory', type: 'stage', description: 'Verify stock levels' },
        { id: 'address', label: 'ValidateAddress', type: 'stage', description: 'Normalize address' },
        { id: 'label', label: 'CreateLabel', type: 'stage', description: 'Generate shipping label' },
      ],
      edges: [
        { id: 'e-p-r', source: 'prepare', target: 'rate' },
        { id: 'e-p-i', source: 'prepare', target: 'inventory' },
        { id: 'e-p-a', source: 'prepare', target: 'address' },
        { id: 'e-r-l', source: 'rate', target: 'label' },
        { id: 'e-i-l', source: 'inventory', target: 'label' },
        { id: 'e-a-l', source: 'address', target: 'label' },
      ],
      newNodeIds: ['label'],
    },
  ],
  executeSteps: [
    {
      id: 'exec-prepare',
      label: 'Executing: PrepareShipment',
      activeNodeId: 'prepare',
      narrativeLine: 'The process began: Initialize shipment data.',
      stageOutput: '{ orderId: "ORD-2024-001", totalWeight: 2.2 }',
    },
    {
      id: 'exec-parallel',
      label: 'Executing: Parallel Children',
      activeNodeId: 'rate',
      activeEdgeIds: ['e-p-r', 'e-p-i', 'e-p-a'],
      narrativeLine: '3 paths executed in parallel: CalculateRate, CheckInventory, ValidateAddress.',
      stageOutput: 'All 3 children complete concurrently (Promise.all)',
    },
    {
      id: 'exec-label',
      label: 'Executing: CreateLabel',
      activeNodeId: 'label',
      activeEdgeIds: ['e-r-l', 'e-i-l', 'e-a-l'],
      narrativeLine: 'Next, it moved on to CreateLabel.',
      stageOutput: '{ trackingNumber: "TRK-...", weight: 2.2 }',
    },
  ],
};
