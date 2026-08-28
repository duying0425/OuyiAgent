import crypto from 'node:crypto';

/**
 * Builds a standardized, high-adherence tool calling system prompt
 * from the client-declared tools array (TRAE, WorkBuddy, Cursor, etc.).
 */
export function buildToolsSystemPrompt(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return '';

  const toolDescriptions = tools.map((t, index) => {
    const fn = t.function || t;
    const name = fn.name || `tool_${index}`;
    const desc = fn.description ? `\n  Description: ${fn.description}` : '';
    const params = fn.parameters ? `\n  Parameters: ${JSON.stringify(fn.parameters)}` : '';
    return `- ${name}:${desc}${params}`;
  }).join('\n');

  return `
# AVAILABLE TOOLS AND CAPABILITIES
You have access to the following tools provided by the IDE/Workspace:
${toolDescriptions}

# TOOL INVOCATION PROTOCOL
When the user asks you to perform an action (e.g. create a file, run a command, search codebase, list directory, etc.) that can be fulfilled by the tools above, you MUST call the appropriate tool.
To call a tool, you MUST output your tool call inside a \`\`\`tool_call markdown block formatted as valid JSON:

\`\`\`tool_call
[
  {
    "name": "<tool_name>",
    "arguments": {
      "<param_name>": "<param_value>"
    }
  }
]
\`\`\`

CRITICAL RULES:
1. If you can answer directly without executing tools (e.g. general explanation, conceptual questions), reply in normal text.
2. If you decide to call one or more tools, output the \`\`\`tool_call block. You may provide a brief natural language explanation before the block.
3. Output valid JSON inside the \`\`\`tool_call block. The IDE will execute the tool and return the output to you in the next message.
`;
}

/**
 * Extracts tool calls from model output text.
 * Supports:
 * - ```tool_call ... ``` or ```tool_calls ... ```
 * - ```json ... ``` (when containing name & arguments)
 * - <tool_call>...</tool_call> (XML format)
 * - Raw JSON array / object containing name & arguments matching tools
 */
export function parseToolCallsFromText(text, tools = []) {
  if (!text || typeof text !== 'string') return { text: '', toolCalls: null };

  const validToolNames = new Set(
    (Array.isArray(tools) ? tools : [])
      .map((t) => (t.function?.name || t.name))
      .filter(Boolean)
  );

  let rawToolJson = null;
  let remainingText = text;

  // 1. Try ```tool_call or ```tool_calls block
  const toolBlockRegex = /```(?:tool_call|tool_calls|tools)\s*([\s\S]*?)```/i;
  const toolBlockMatch = text.match(toolBlockRegex);
  if (toolBlockMatch) {
    rawToolJson = toolBlockMatch[1].trim();
    remainingText = text.replace(toolBlockRegex, '').trim();
  }

  // 2. Try XML style <tool_call>...</tool_call> or <function_calls>...</function_calls>
  if (!rawToolJson) {
    const xmlRegex = /<(?:tool_call|function_call|function_calls)>([\s\S]*?)<\/(?:tool_call|function_call|function_calls)>/i;
    const xmlMatch = text.match(xmlRegex);
    if (xmlMatch) {
      rawToolJson = xmlMatch[1].trim();
      remainingText = text.replace(xmlRegex, '').trim();
    }
  }

  // 3. Try ```json block if it looks like a function call
  if (!rawToolJson) {
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/i;
    const jsonBlockMatch = text.match(jsonBlockRegex);
    if (jsonBlockMatch) {
      const candidate = jsonBlockMatch[1].trim();
      if (candidate.includes('"name"') && (candidate.includes('"arguments"') || candidate.includes('"parameters"'))) {
        rawToolJson = candidate;
        remainingText = text.replace(jsonBlockRegex, '').trim();
      }
    }
  }

  if (!rawToolJson) {
    return { text, toolCalls: null };
  }

  // Parse JSON
  let parsed = null;
  try {
    parsed = JSON.parse(rawToolJson);
  } catch {
    // If not direct JSON, try finding JSON array inside
    const arrMatch = rawToolJson.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrMatch) {
      try { parsed = JSON.parse(arrMatch[0]); } catch {}
    } else {
      const objMatch = rawToolJson.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { parsed = JSON.parse(objMatch[0]); } catch {}
      }
    }
  }

  if (!parsed) {
    return { text, toolCalls: null };
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const toolCalls = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = item.name || item.function || item.tool_name || item.tool;
    if (!name || typeof name !== 'string') continue;

    // If available tools list was provided, verify tool name matches
    if (validToolNames.size > 0 && !validToolNames.has(name)) {
      // Find case-insensitive match if any
      const matched = [...validToolNames].find((t) => t.toLowerCase() === name.toLowerCase());
      if (!matched) continue;
    }

    let args = item.arguments ?? item.parameters ?? item.params ?? item.input ?? {};
    if (typeof args !== 'string') {
      args = JSON.stringify(args);
    }

    const id = `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    toolCalls.push({
      id,
      type: 'function',
      function: {
        name,
        arguments: args,
      },
    });
  }

  if (toolCalls.length === 0) {
    return { text, toolCalls: null };
  }

  return {
    text: remainingText,
    toolCalls,
  };
}
