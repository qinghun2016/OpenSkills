import { createPatch } from 'diff';

/**
 * 根据原内容与新内容生成 unified diff 字符串，供 createProposal 的 diff 字段使用。
 * 与后端 diffService 使用的 diff 库一致，便于 applyPatch 正确应用。
 */
export function createUnifiedDiff(
  fileName: string,
  oldContent: string,
  newContent: string
): string {
  return createPatch(fileName, oldContent, newContent, '', '');
}
