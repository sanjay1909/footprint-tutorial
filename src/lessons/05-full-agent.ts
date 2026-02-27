import type { TutorialLesson } from '../tutorial/types';

export const fullAgent: TutorialLesson = {
  id: 'full-agent',
  title: 'The Agent Loop',
  subtitle: 'Build a complete AI agent with tool-calling loop',
  difficulty: 'advanced',
  buildSteps: [
    {
      id: 'linear-core',
      label: 'Core Pipeline',
      explanation: 'The agent starts with: seed the user message, assemble the prompt, call the LLM, parse the response.',
      code: `const seedScope = async (scope: BaseState) => {
  scope.setObject(['pipeline'], 'userMessage', 'What is the weather?');
  scope.setObject(['pipeline'], 'systemPrompt', 'You are a helpful assistant.');
  return { seeded: true };
};

const assemblePrompt = async (scope: BaseState) => {
  const system = scope.getValue(['pipeline'], 'systemPrompt') as string;
  const user = scope.getValue(['pipeline'], 'userMessage') as string;
  scope.setObject(['pipeline'], 'messages', [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  return { messageCount: 2 };
};

const callLLM = async (scope: BaseState) => {
  // Call your LLM provider here (OpenAI, Anthropic, etc.)
  const response = { type: 'tool_call', toolCalls: [{ name: 'get_weather', args: { city: 'Seattle' } }] };
  scope.setObject(['pipeline'], 'llmResponse', response);
  return { type: response.type };
};

const parseResponse = async (scope: BaseState) => {
  const resp = scope.getValue(['pipeline'], 'llmResponse') as any;
  scope.setObject(['pipeline'], 'hasToolCalls', resp.type === 'tool_call');
  return { parsed: true, type: resp.type };
};

new FlowChartBuilder()
  .start('SeedScope', seedScope)
  .addFunction('AssemblePrompt', assemblePrompt)
  .addFunction('CallLLM', callLLM)
  .addFunction('ParseResponse', parseResponse)`,
      highlightLines: [30, 34],
      nodes: [
        { id: 'seed', label: 'SeedScope', type: 'stage', description: 'Load user message' },
        { id: 'assemble', label: 'AssemblePrompt', type: 'stage', description: 'Build messages array' },
        { id: 'llm', label: 'CallLLM', type: 'stage', description: 'Send to LLM provider' },
        { id: 'parse', label: 'ParseResponse', type: 'stage', description: 'Extract tool calls or text' },
      ],
      edges: [
        { id: 'e-s-a', source: 'seed', target: 'assemble' },
        { id: 'e-a-l', source: 'assemble', target: 'llm' },
        { id: 'e-l-p', source: 'llm', target: 'parse' },
      ],
      newNodeIds: ['seed', 'assemble', 'llm', 'parse'],
    },
    {
      id: 'decider-and-branches',
      label: 'Decider + Loop',
      explanation: 'The decider checks hasToolCalls. ExecuteTools loops back to CallLLM — that\'s the agent loop!',
      code: `// Route based on LLM response type
const routeDecider = (scope: BaseState): string => {
  const hasTools = scope.getValue(['pipeline'], 'hasToolCalls') as boolean;
  return hasTools ? 'execute-tools' : 'finalize';
};

const executeTools = async (scope: BaseState) => {
  const resp = scope.getValue(['pipeline'], 'llmResponse') as any;
  // Run each tool call, collect results
  return { toolsExecuted: resp.toolCalls?.length ?? 0 };
};

const finalize = async (scope: BaseState) => {
  const resp = scope.getValue(['pipeline'], 'llmResponse') as any;
  return { response: resp.content ?? 'Done' };
};

  .addDeciderFunction('RouteDecider', routeDecider, 'router')
    .addFunctionBranch('execute-tools', 'ExecuteTools', executeTools)
    .addFunctionBranch('finalize', 'Finalize', finalize)
    .end()
  .execute(scopeFactory)`,
      highlightLines: [18, 22],
      nodes: [
        { id: 'seed', label: 'SeedScope', type: 'stage', description: 'Load user message' },
        { id: 'assemble', label: 'AssemblePrompt', type: 'stage', description: 'Build messages' },
        { id: 'llm', label: 'CallLLM', type: 'stage', description: 'Send to LLM' },
        { id: 'parse', label: 'ParseResponse', type: 'stage', description: 'Extract response' },
        { id: 'router', label: 'RouteDecider', type: 'decider', description: 'Tools or final?' },
        { id: 'tools', label: 'ExecuteTools', type: 'stage', description: 'Run tool calls' },
        { id: 'finalize', label: 'Finalize', type: 'stage', description: 'Return answer' },
      ],
      edges: [
        { id: 'e-s-a', source: 'seed', target: 'assemble' },
        { id: 'e-a-l', source: 'assemble', target: 'llm' },
        { id: 'e-l-p', source: 'llm', target: 'parse' },
        { id: 'e-p-r', source: 'parse', target: 'router' },
        { id: 'e-r-t', source: 'router', target: 'tools', label: 'tools' },
        { id: 'e-r-f', source: 'router', target: 'finalize', label: 'final' },
        { id: 'e-t-l', source: 'tools', target: 'llm', label: 'loop', animated: true },
      ],
      newNodeIds: ['router', 'tools', 'finalize'],
      concept: {
        title: 'The Loop',
        body: 'ExecuteTools links back to CallLLM, creating a loop. The agent keeps calling the LLM until it provides a final answer. FootPrint tracks iterations automatically.',
      },
    },
  ],
  executeSteps: [
    {
      id: 'exec-seed',
      label: 'Executing: SeedScope',
      activeNodeId: 'seed',
      narrativeLine: 'The process began: Load user message into scope.',
    },
    {
      id: 'exec-assemble',
      label: 'Executing: AssemblePrompt',
      activeNodeId: 'assemble',
      activeEdgeIds: ['e-s-a'],
      narrativeLine: 'Next step: Build the prompt from system instructions and history.',
    },
    {
      id: 'exec-llm-1',
      label: 'Executing: CallLLM (iteration 1)',
      activeNodeId: 'llm',
      activeEdgeIds: ['e-a-l'],
      narrativeLine: 'Next step: Send messages to the LLM provider.',
    },
    {
      id: 'exec-parse-1',
      label: 'Executing: ParseResponse',
      activeNodeId: 'parse',
      activeEdgeIds: ['e-l-p'],
      narrativeLine: 'Next step: Extract tool calls from the response.',
    },
    {
      id: 'exec-decide-tools',
      label: 'Deciding: RouteDecider',
      activeNodeId: 'router',
      activeEdgeIds: ['e-p-r'],
      narrativeLine: 'Decision: the LLM called get_weather, so it chose ExecuteTools.',
    },
    {
      id: 'exec-tools',
      label: 'Executing: ExecuteTools',
      activeNodeId: 'tools',
      activeEdgeIds: ['e-r-t'],
      narrativeLine: 'Next step: Run the get_weather tool.',
      stageOutput: '{ tool: "get_weather", result: "72F, sunny" }',
    },
    {
      id: 'exec-llm-2',
      label: 'Executing: CallLLM (iteration 2)',
      activeNodeId: 'llm',
      activeEdgeIds: ['e-t-l'],
      narrativeLine: 'Loop back: Send messages to the LLM provider again with tool results.',
    },
    {
      id: 'exec-parse-2',
      label: 'Executing: ParseResponse',
      activeNodeId: 'parse',
      activeEdgeIds: ['e-l-p'],
      narrativeLine: 'Next step: Extract the final answer from the response.',
    },
    {
      id: 'exec-decide-final',
      label: 'Deciding: RouteDecider',
      activeNodeId: 'router',
      activeEdgeIds: ['e-p-r'],
      narrativeLine: 'Decision: the LLM provided a final answer, so it chose Finalize.',
    },
    {
      id: 'exec-finalize',
      label: 'Executing: Finalize',
      activeNodeId: 'finalize',
      activeEdgeIds: ['e-r-f'],
      narrativeLine: 'Next step: Return the final response to the user.',
      stageOutput: '{ response: "The weather in Seattle is 72F and sunny." }',
    },
  ],
};
