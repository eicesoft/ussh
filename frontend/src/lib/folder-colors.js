export const DEFAULT_FOLDER_COLOR = '';

export const FOLDER_COLORS = [
  { value: DEFAULT_FOLDER_COLOR, label: '无颜色' },
  { value: '#64748b', label: '石板灰' },
  { value: '#ef4444', label: '红色' },
  { value: '#f97316', label: '橙色' },
  { value: '#eab308', label: '黄色' },
  { value: '#22c55e', label: '绿色' },
  { value: '#06b6d4', label: '青色' },
  { value: '#3b82f6', label: '蓝色' },
  { value: '#8b5cf6', label: '紫色' },
  { value: '#ec4899', label: '粉色' },
];

export function normalizeFolderColor(color) {
  if (!color) return DEFAULT_FOLDER_COLOR;
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_FOLDER_COLOR;
}
