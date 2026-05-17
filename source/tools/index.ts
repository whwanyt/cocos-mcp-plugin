import { Logger } from '../types';
import { ToolRegistry } from '../core/registry/tool-registry';
import { createAssetAdvancedTools } from './asset-advanced-tools';
import { createBroadcastTools } from './broadcast-tools';
import { createComponentTools } from './component-tools';
import { createDebugTools } from './debug-tools';
import { createEditorTools, createToolCatalogTool } from './editor-tools';
import { createNodeTools } from './node-tools';
import { createPrefabTools } from './prefab-tools';
import { createPreferencesTools } from './preferences-tools';
import { createProjectTools } from './project-tools';
import { createReferenceImageTools } from './reference-image-tools';
import { createSceneAdvancedTools } from './scene-advanced-tools';
import { createSceneTools } from './scene-tools';
import { createSceneViewTools } from './scene-view-tools';
import { createServerTools } from './server-tools';
import { createValidationTools } from './validation-tools';

// EN: Expected count tracks the full current catalog and fails startup if registration drifts.
// ZH: expected 数量跟踪当前完整工具目录，注册结果漂移时会阻止启动。
export const EXPECTED_TOOL_COUNT = 173;

export function registerAllTools(registry: ToolRegistry, logger: Logger): void {
  // EN: Explicit registration keeps startup deterministic and makes missing modules visible in review.
  // ZH: 显式注册让启动结果可预测，也让缺失模块在代码评审中可见。
  [
    createSceneTools(),
    createNodeTools(),
    createComponentTools(),
    createPrefabTools(),
    createProjectTools(),
    createAssetAdvancedTools(),
    createSceneAdvancedTools(),
    createSceneViewTools(),
    createDebugTools(),
    createPreferencesTools(),
    createReferenceImageTools(),
    createServerTools(),
    createBroadcastTools(),
    createValidationTools(),
    createEditorTools(),
    createToolCatalogTool(),
  ].forEach((module) => registry.registerModule(module));

  const actualCount = registry.count();
  if (actualCount !== EXPECTED_TOOL_COUNT) {
    // EN: Count mismatch usually means a tool was added or removed without updating tests and docs.
    // ZH: 数量不匹配通常表示新增或删除工具后没有同步更新测试和文档。
    throw new Error(`Tool catalog mismatch: expected ${EXPECTED_TOOL_COUNT}, got ${actualCount}`);
  }

  logger.info(`Tool catalog ready with ${actualCount} tools`);
}
