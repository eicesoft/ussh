import { createContext, useContext } from 'react';

/**
 * 插件上下文 —— 注入给插件组件的能力。
 * - activeTab: 当前激活的标签页
 * - tabs: 所有标签页列表
 * - sendInput: 向 SSH 连接发送输入
 * - disconnect: 断开指定连接
 * - api: 底层 Go 桥接 API（connect, sendInput, resizeTerminal 等）
 * - settings: 当前应用设置（包括 AI 配置）
 */
export const PluginContext = createContext(null);

export function usePluginContext() {
  const ctx = useContext(PluginContext);
  if (!ctx) throw new Error('usePluginContext 必须在 PluginContext.Provider 内使用');
  return ctx;
}
