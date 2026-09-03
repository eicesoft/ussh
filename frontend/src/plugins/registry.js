/**
 * 插件注册中心。
 * 每个插件导出 { id, type, title, icon, component }。
 * type 目前仅支持 'tool'（右侧面板工具）。
 */
const plugins = [];

export function registerPlugin(plugin) {
  if (plugins.some(p => p.id === plugin.id)) {
    console.warn(`插件 ${plugin.id} 已注册，跳过`);
    return;
  }
  plugins.push(plugin);
}

export function getPluginsByType(type) {
  return plugins.filter(p => p.type === type);
}

export function getPlugin(id) {
  return plugins.find(p => p.id === id);
}

export function getAllPlugins() {
  return [...plugins];
}