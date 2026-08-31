/**
 * Extracts raw tool invocation payload and separates it from conversational content.
 */
export function extractToolBlock(text) {
  if (!text || typeof text !== 'string') {
    return { rawPayload: null, cleanContent: '' };
  }

  let rawPayload = null;
  let cleanContent = text;

  // 1. Check ```tool_call or ```tool_calls or ```tools block
  const toolBlockRegex = /```(?:tool_call|tool_calls|tools)\s*([\s\S]*?)```/i;
  const toolBlockMatch = text.match(toolBlockRegex);
  if (toolBlockMatch) {
    rawPayload = toolBlockMatch[1].trim();
    cleanContent = text.replace(toolBlockRegex, '').trim();
    return { rawPayload, cleanContent };
  }

  // 2. Check <tool_call>...</tool_call> or <function_calls>...</function_calls>
  const xmlRegex = /<(?:tool_call|function_call|function_calls)>([\s\S]*?)<\/(?:tool_call|function_call|function_calls)>/i;
  const xmlMatch = text.match(xmlRegex);
  if (xmlMatch) {
    rawPayload = xmlMatch[1].trim();
    cleanContent = text.replace(xmlRegex, '').trim();
    return { rawPayload, cleanContent };
  }

  // 3. Check ```json block containing "name" and "arguments" / "parameters"
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/i;
  const jsonBlockMatch = text.match(jsonBlockRegex);
  if (jsonBlockMatch) {
    const candidate = jsonBlockMatch[1].trim();
    if (candidate.includes('"name"') && (candidate.includes('"arguments"') || candidate.includes('"parameters"'))) {
      rawPayload = candidate;
      cleanContent = text.replace(jsonBlockRegex, '').trim();
      return { rawPayload, cleanContent };
    }
  }

  return { rawPayload: null, cleanContent: text };
}
