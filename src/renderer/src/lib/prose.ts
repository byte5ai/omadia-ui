/**
 * omadia's voice arrives as streamed text. Some model providers echo their
 * tool-call markup into it; that is protocol noise, never meant for people.
 */
export function cleanProse(raw: string): string {
  return raw
    .replace(
      /```[a-z]*\s*\{[\s\S]*?"(tool|containerId|tool_use|name)"[\s\S]*?(```|$)/g,
      "",
    )
    .replace(/<(tool_call|tool_use|function_call)>[\s\S]*?(<\/\1>|$)/g, "")
    .replace(/<function_calls>[\s\S]*?(<\/function_calls>|$)/g, "")
    .replace(/<result>[\s\S]*?(<\/result>|$)/g, "")
    .replace(/<\/?(invoke|parameter)[^>]*>/g, "")
    .replace(/^\s*(assistant|user):\s*$/gim, "")
    .replace(/^\s*assistant:\s*/i, "")
    .replace(/\*\*|__/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A voice line that ends in a question means omadia is waiting for you. */
export const isQuestion = (prose: string): boolean => /\?\s*$/.test(prose);
