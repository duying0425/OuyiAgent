/**
 * Hermes / XML Tagged Tool Calling Template
 */
export function renderHermesTemplate({ tools = [], toolChoice = 'auto' } = {}) {
  if (!Array.isArray(tools) || tools.length === 0 || toolChoice === 'none') {
    return '';
  }

  const toolList = tools.map((t, index) => {
    const fn = t.function || t;
    const name = fn.name || ('tool_' + index);
    return JSON.stringify({
      type: 'function',
      function: {
        name,
        description: fn.description || '',
        parameters: fn.parameters || { type: 'object', properties: {} },
      },
    });
  }).join('\n');

  return [
    '<tools>',
    toolList,
    '</tools>',
    'For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:',
    '<tool_call>',
    '{"name": "<function-name>", "arguments": <args-json-object>}',
    '</tool_call>'
  ].join('\n');
}
