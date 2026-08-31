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

  let choiceInstruction = '1. If the user request is purely conversational (e.g. asking for explanations, theory, definitions), reply in natural language.\n2. If the user asks you to perform an action (e.g. create a file, write a program, execute a command, modify code, search directory), you MUST call the appropriate workspace tool directly.';

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
    '3. BE PROACTIVE: When asked to write a program, script, or implement a feature, do not just chat or ask clarifying questions in text. Directly write the complete working code and call the file creation/writing tool (e.g. write_to_file / create_file) to produce the file.',
    '4. SELF-HEALING & AUTO-RETRY: If a previous tool execution failed (e.g. command not found, syntax error, or python not recognized), DO NOT just explain what went wrong and stop in text. You MUST explain briefly and IMMEDIATELY emit the corrected tool_call block (e.g. try \'py\' instead of \'python\' on Windows, or fix command arguments) in the SAME response so the IDE executes it automatically without waiting for user input.',
    '5. You may include a brief explanatory thought before the ```tool_call block.',
    '6. The IDE will execute your tool and return the output in the subsequent turn.',
    ''
  ].join('\n');
}
