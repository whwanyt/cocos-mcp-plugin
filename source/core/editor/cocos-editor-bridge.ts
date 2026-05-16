import { EditorBridge, EditorPaths, EditorProjectInfo, EditorSelection } from '../../types';

// EN: This class is the single wrapper around the Cocos global Editor API.
// ZH: 该类是对 Cocos 全局 Editor API 的唯一封装位置。
export class CocosEditorBridge implements EditorBridge {
  request(channel: string, message: string, ...args: unknown[]): Promise<unknown> {
    // EN: The Cocos editor type declarations use generic channel/message parameters; args are narrowed by tool schemas before reaching here.
    // ZH: Cocos 编辑器类型声明使用泛型 channel/message；参数在进入这里前已由工具 schema 完成边界收窄。
    return Editor.Message.request<string, string>(channel, message, ...args as never[]);
  }

  send(channel: string, message: string, ...args: unknown[]): void {
    Editor.Message.send<string, string>(channel, message, ...args as never[]);
  }

  executeSceneScript(method: string, args: unknown[] = [], extensionName = 'cocos-mcp-plugin'): Promise<unknown> {
    // EN: Scene runtime calls are routed through the official scene contribution entry.
    // ZH: 场景运行时调用统一通过官方 scene contribution 入口转发。
    return this.request('scene', 'execute-scene-script', {
      name: extensionName,
      method,
      args,
    });
  }

  getSelection(type = 'node'): EditorSelection {
    const lastSelectedType = Editor.Selection.getLastSelectedType();
    return {
      type,
      uuids: Editor.Selection.getSelected(type),
      lastSelectedType,
      lastSelected: Editor.Selection.getLastSelected(type),
    };
  }

  setSelection(type: string, uuids: string[]): void {
    // EN: Replace selection atomically from the tool user's point of view.
    // ZH: 从工具调用者视角看，选择集是一次性整体替换的。
    Editor.Selection.clear(type);
    if (uuids.length > 0) {
      Editor.Selection.select(type, uuids);
    }
  }

  projectInfo(): EditorProjectInfo {
    return {
      name: Editor.Project?.name ?? 'Unknown',
      path: Editor.Project?.path ?? '',
      uuid: Editor.Project?.uuid,
      cocosVersion: Editor.App?.version,
    };
  }

  paths(): EditorPaths {
    return {
      project: Editor.Project?.path ?? '',
      app: Editor.App?.path,
    };
  }
}
