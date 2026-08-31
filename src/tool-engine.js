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
[SYSTEM INSTRUCTION: WORKSPACE TOOLS AVAILABLE]
You have access to the following workspace tools provided by the IDE:
${toolDescriptions}

CRITICAL RULES FOR EXECUTING ACTIONS:
1. Whenever the user asks you to perform an action (e.g., create a folder, write a file, execute a command, list files, search code), you MUST call the appropriate tool.
2. To invoke a tool, output a \`\`\`tool_call markdown block formatted strictly in JSON:
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
3. Do NOT say "I cannot access your filesystem" if a tool is provided above. Always invoke the tool directly.
`;
}

function findMatchingTool(tools, keywords) {
  for (const t of tools) {
    const name = (t.function?.name || t.name || '').toLowerCase();
    const desc = (t.function?.description || t.description || '').toLowerCase();
    for (const kw of keywords) {
      if (name.includes(kw) || desc.includes(kw)) return t;
    }
  }
  return null;
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
          else {
            // Fuzzy match with available tools
            const fuzzy = [...validToolNames].find((t) => t.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(t.toLowerCase()));
            if (fuzzy) name = fuzzy;
            else continue;
          }
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

  // 4. Universal Smart Fallback: If model wrote shell command (mkdir, touch, etc.) or bash block
  if (validTools.length > 0) {
    const dirTool = findMatchingTool(validTools, ['directory', 'folder', 'mkdir', 'dir']);
    const execTool = findMatchingTool(validTools, ['command', 'terminal', 'bash', 'shell', 'exec', 'run']);

    // Check code blocks or inline commands
    const bashBlockRegex = /```(?:bash|sh|shell|cmd|powershell)?\s*([\s\S]*?)```/i;
    const bashMatch = text.match(bashBlockRegex);
    const candidateCode = bashMatch ? bashMatch[1].trim() : text;

    // Pattern A: mkdir command
    const mkdirMatch = /(?:^|\n|\s)mkdir\s+(?:-p\s+)?["']?([^\s"'\n]+)["']?/i.exec(candidateCode);
    if (mkdirMatch) {
      const folderName = mkdirMatch[1].trim();
      if (dirTool) {
        const toolName = dirTool.function?.name || dirTool.name;
        const paramKey = Object.keys(dirTool.function?.parameters?.properties || {})[0] || 'path';
        return {
          text: text.replace(bashBlockRegex, '').trim(),
          toolCalls: [{
            id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: JSON.stringify({ [paramKey]: folderName }),
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
              arguments: JSON.stringify({ [paramKey]: `mkdir ${folderName}` }),
            },
          }],
        };
      }
    }

    // Pattern B: Any other single shell command in code block
    if (bashMatch && execTool) {
      const cmd = bashMatch[1].trim();
      if (cmd && !cmd.includes('\n') && cmd.length < 200) {
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
