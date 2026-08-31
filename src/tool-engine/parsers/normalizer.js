import crypto from 'node:crypto';

/**
 * Validates, repairs and normalizes tool call objects into standard OpenAI format.
 */
export function normalizeToolCalls(rawPayload, declaredTools = []) {
  if (!rawPayload || typeof rawPayload !== 'string') return null;

  let parsed = null;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    const arrMatch = rawPayload.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrMatch) {
      try { parsed = JSON.parse(arrMatch[0]); } catch {}
    } else {
      const objMatch = rawPayload.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { parsed = JSON.parse(objMatch[0]); } catch {}
      }
    }
  }

  if (!parsed) return null;

  const validTools = Array.isArray(declaredTools) ? declaredTools : [];
  const validToolNames = new Set(
    validTools.map((t) => (t.function?.name || t.name)).filter(Boolean)
  );

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const toolCalls = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    let name = item.name || item.function || item.tool_name || item.tool;
    if (!name || typeof name !== 'string') continue;

    if (validToolNames.size > 0 && !validToolNames.has(name)) {
      const matched = [...validToolNames].find((t) => t.toLowerCase() === name.toLowerCase());
      if (matched) {
        name = matched;
      } else {
        const fuzzy = [...validToolNames].find((t) =>
          t.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(t.toLowerCase())
        );
        if (fuzzy) name = fuzzy;
        else continue;
      }
    }

    let args = item.arguments ?? item.parameters ?? item.params ?? item.input ?? {};
    if (typeof args !== 'string') {
      try {
        args = JSON.stringify(args);
      } catch {
        args = '{}';
      }
    }

    const id = 'call_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    toolCalls.push({
      id,
      type: 'function',
      function: {
        name,
        arguments: args,
      },
    });
  }

  return toolCalls.length > 0 ? toolCalls : null;
}
