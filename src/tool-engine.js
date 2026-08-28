import crypto from 'node:crypto';

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
[SYSTEM INSTRUCTION: TOOL CALLING MANDATORY]
You have access to the following workspace tools:
${toolDescriptions}

CRITICAL RULES FOR CALLING TOOLS:
1. Whenever the user requests an action (such as creating files/folders, modifying code, running terminal commands, listing directories, reading files), you MUST NOT pretend to have executed it in plain text. You MUST call the appropriate tool.
2. To invoke a tool, output a \`\`\`tool_call markdown block formatted strictly as JSON:
\`\`\`tool_call
[
  {
    "name": "<tool_name>",
    "arguments": {
      "<parameter_name>": "<parameter_value>"
    }
  }
]
\`\`\`
3. Do NOT execute tools if the user is asking general questions (e.g. explanations, definitions, theory).
`;
}

export function parseToolCallsFromText(text, tools = []) {
  if (!text || typeof text !== 'string') return { text: '', toolCalls: null };

  const validTools = Array.isArray(tools) ? tools : [];
  const validToolNames = new Set(
    validTools.map((t) => (t.function?.name || t.name)).filter(Boolean)
  );

  let rawToolJson = null;
  let remainingText = text;

  // 1. Try ```tool_call or ```tool_calls or ```tools block
  const toolBlockRegex = /```(?:tool_call|tool_calls|tools)\s*([\s\S]*?)```/i;
  const toolBlockMatch = text.match(toolBlockRegex);
  if (toolBlockMatch) {
    rawToolJson = toolBlockMatch[1].trim();
    remainingText = text.replace(toolBlockRegex, '').trim();
  }

  // 2. Try XML style <tool_call>...</tool_call>
  if (!rawToolJson) {
    const xmlRegex = /<(?:tool_call|function_call|function_calls)>([\s\S]*?)<\/(?:tool_call|function_call|function_calls)>/i;
    const xmlMatch = text.match(xmlRegex);
    if (xmlMatch) {
      rawToolJson = xmlMatch[1].trim();
      remainingText = text.replace(xmlRegex, '').trim();
    }
  }

  // 3. Try ```json block containing name and arguments
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

  if (rawToolJson) {
    let parsed = null;
    try {
      parsed = JSON.parse(rawToolJson);
    } catch {
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

    if (parsed) {
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const toolCalls = [];

      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        let name = item.name || item.function || item.tool_name || item.tool;
        if (!name || typeof name !== 'string') continue;

        if (validToolNames.size > 0 && !validToolNames.has(name)) {
          const matched = [...validToolNames].find((t) => t.toLowerCase() === name.toLowerCase());
          if (matched) name = matched;
          else continue;
        }

        let args = item.arguments ?? item.parameters ?? item.params ?? item.input ?? {};
        if (typeof args !== 'string') args = JSON.stringify(args);

        const id = `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        toolCalls.push({
          id,
          type: 'function',
          function: { name, arguments: args },
        });
      }

      if (toolCalls.length > 0) {
        return { text: remainingText, toolCalls };
      }
    }
  }

  // 4. Fallback Smart Matcher: If model outputted a bash/sh block and client declared command/directory tool
  const execTool = validTools.find((t) => {
    const n = (t.function?.name || t.name || '').toLowerCase();
    return ['execute_command', 'run_command', 'bash', 'terminal', 'terminal_cmd', 'exec_cmd'].includes(n);
  });
  const dirTool = validTools.find((t) => {
    const n = (t.function?.name || t.name || '').toLowerCase();
    return ['create_directory', 'make_directory', 'mkdir', 'create_folder'].includes(n);
  });

  const bashBlockRegex = /```(?:bash|sh|shell|cmd|powershell)\s*([\s\S]*?)```/i;
  const bashMatch = text.match(bashBlockRegex);
  if (bashMatch) {
    const cmd = bashMatch[1].trim();
    if (cmd && !cmd.includes('\n')) {
      // Check if mkdir
      const mkdirMatch = /^mkdir\s+(?:-p\s+)?["']?([^"'\n]+)["']?$/i.exec(cmd);
      if (mkdirMatch && dirTool) {
        const toolName = dirTool.function?.name || dirTool.name;
        const paramKey = Object.keys(dirTool.function?.parameters?.properties || {})[0] || 'path';
        return {
          text: text.replace(bashBlockRegex, '').trim(),
          toolCalls: [{
            id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: JSON.stringify({ [paramKey]: mkdirMatch[1].trim() }),
            },
          }],
        };
      }

      if (execTool) {
        const toolName = execTool.function?.name || execTool.name;
        const paramKey = Object.keys(execTool.function?.parameters?.properties || {})[0] || 'command';
        return {
          text: text.replace(bashBlockRegex, '').trim(),
          toolCalls: [{
            id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: JSON.stringify({ [paramKey]: cmd }),
            },
          }],
        };
      }
    }
  }

  return { text, toolCalls: null };
}
