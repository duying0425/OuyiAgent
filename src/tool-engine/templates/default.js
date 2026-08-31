/**
 * Default Tool Calling System Prompt Template
 * Follows standard OpenAI Markdown Tool Invocation Protocol
 */
export function renderDefaultTemplate({ tools = [], toolChoice = 'auto' } = {}) {
  if (!Array.isArray(tools) || tools.length === 0 || toolChoice === 'none') {
    return '';
  }

  const toolList = tools.map((t, index) => {
    const fn = t.function || t;
    const name = fn.name || ('tool_' + index);
    const desc = fn.description ? ('\n  Description: ' + fn.description) : '';
    const params = fn.parameters ? ('\n  Parameters: ' + JSON.stringify(fn.parameters)) : '';
    return '- ' + name + ':' + desc + params;
  }).join('\n');

  let choiceInstruction = '1. If the user request can be answered directly without executing tools, reply in natural language.\n2. If you need to perform an action (create files, run commands, list directories, search code, etc.), you MUST invoke the appropriate tool.';

  if (toolChoice === 'required') {
    choiceInstruction = '1. You MUST invoke at least one tool to fulfill this request.';
  } else if (typeof toolChoice === 'object' && toolChoice?.function?.name) {
    choiceInstruction = '1. You MUST invoke the specific tool: "' + toolChoice.function.name + '".';
  }

  return [
    '# WORKSPACE TOOLS AND CAPABILITIES',
    'You have access to the following tools provided by the IDE/Workspace:',
    toolList,
    '',
    '# TOOL INVOCATION PROTOCOL',
    'When you need to use a tool, you MUST output a ```tool_call markdown block formatted strictly as valid JSON:',
    '',
    '```tool_call',
    '[',
    '  {',
    '    "name": "<tool_name>",',
    '    "arguments": {',
    '      "<param_name>": "<param_value>"',
    '    }',
    '  }',
    ']',
    '```',
    '',
    'CRITICAL RULES:',
    choiceInstruction,
    '2. You may include a brief explanatory thought before the ```tool_call block.',
    '3. The IDE will execute your tool and return the output in the subsequent turn.',
    ''
  ].join('\n');
}
