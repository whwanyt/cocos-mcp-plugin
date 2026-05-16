import * as fs from 'fs';
import * as path from 'path';
import { ToolModule } from '../types';
import { booleanProp, createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';

// EN: Debug tools expose diagnostics; script execution remains dangerous and hidden by default profile policy.
// ZH: debug 工具提供诊断能力；脚本执行仍属于危险能力并默认被 profile 策略隐藏。
export function createDebugTools(): ToolModule {
  const consoleMessages: unknown[] = [];

  return createToolModule('debug', [
    {
      name: 'get_console_logs',
      description: 'Get editor console logs',
      inputSchema: objectSchema({
        limit: numberProp('Number of recent logs to retrieve', { default: 100 }),
        filter: stringProp('Filter logs by type', { enum: ['all', 'log', 'warn', 'error', 'info'], default: 'all' }),
      }),
      status: 'partial',
      handler: async (args) => ok({
        total: consoleMessages.length,
        returned: consoleMessages.slice(-Number(args.limit ?? 100)).length,
        logs: consoleMessages.slice(-Number(args.limit ?? 100)),
      }),
    },
    {
      name: 'clear_console',
      description: 'Clear editor console',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        context.editor.send('console', 'clear');
        return ok(undefined, 'Console clear requested');
      },
    },
    {
      name: 'execute_script',
      description: 'Execute JavaScript in scene context',
      inputSchema: objectSchema({ script: stringProp('JavaScript code to execute') }, ['script']),
      handler: async (args, context) => ok(await context.editor.executeSceneScript('executeScript', [args.script])),
    },
    {
      name: 'get_node_tree',
      description: 'Get detailed node tree for debugging',
      inputSchema: objectSchema({
        rootUuid: stringProp('Root node UUID'),
        maxDepth: numberProp('Maximum tree depth', { default: 10 }),
      }),
      handler: async (_args, context) => ok(await context.editor.request('scene', 'query-node-tree')),
    },
    {
      name: 'get_performance_stats',
      description: 'Get performance statistics',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(await context.editor.request('scene', 'query-performance')),
    },
    {
      name: 'validate_scene',
      description: 'Validate current scene for issues',
      inputSchema: objectSchema({
        checkMissingAssets: booleanProp('Check for missing asset references', { default: true }),
        checkPerformance: booleanProp('Check for performance issues', { default: true }),
      }),
      status: 'partial',
      handler: async (_args, context) => {
        const tree = await context.editor.request('scene', 'query-node-tree').catch((error) => ({ error: String(error) }));
        return ok({ valid: true, issueCount: 0, issues: [], tree });
      },
    },
    {
      name: 'get_editor_info',
      description: 'Get editor and environment information',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({
        project: context.editor.projectInfo(),
        paths: context.editor.paths(),
        platform: process.platform,
        nodeVersion: process.version,
      }),
    },
    {
      name: 'get_project_logs',
      description: 'Get project logs from temp/logs/project.log file',
      inputSchema: objectSchema({
        lines: numberProp('Number of lines to read from the end of the log file', { default: 100, minimum: 1, maximum: 10000 }),
        filterKeyword: stringProp('Filter logs containing keyword'),
        logLevel: stringProp('Filter by log level', { enum: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'ALL'], default: 'ALL' }),
      }),
      handler: async (args, context) => {
        const logPath = projectLogPath(context.editor.paths().project);
        const lines = readTail(logPath, Number(args.lines ?? 100));
        const filtered = lines.filter((line) => {
          const keywordOk = args.filterKeyword ? line.includes(String(args.filterKeyword)) : true;
          const level = String(args.logLevel ?? 'ALL');
          const levelOk = level === 'ALL' ? true : line.includes(level);
          return keywordOk && levelOk;
        });
        return ok({ path: logPath, lines: filtered });
      },
    },
    {
      name: 'get_log_file_info',
      description: 'Get information about the project log file',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const logPath = projectLogPath(context.editor.paths().project);
        const exists = fs.existsSync(logPath);
        return ok({ path: logPath, exists, size: exists ? fs.statSync(logPath).size : 0 });
      },
    },
    {
      name: 'search_project_logs',
      description: 'Search for specific patterns or errors in project logs',
      inputSchema: objectSchema({
        pattern: stringProp('Search pattern'),
        maxResults: numberProp('Maximum number of matching results', { default: 20, minimum: 1, maximum: 100 }),
        contextLines: numberProp('Number of context lines around each match', { default: 2, minimum: 0, maximum: 10 }),
      }, ['pattern']),
      handler: async (args, context) => {
        const logPath = projectLogPath(context.editor.paths().project);
        const lines = readTail(logPath, 10000);
        const regex = new RegExp(String(args.pattern));
        const matches = lines
          .map((line, index) => ({ line, index }))
          .filter((entry) => regex.test(entry.line))
          .slice(0, Number(args.maxResults ?? 20));
        return ok({ path: logPath, matches });
      },
    },
  ]);
}

function projectLogPath(projectPath: string): string {
  return path.join(projectPath, 'temp', 'logs', 'project.log');
}

function readTail(filePath: string, lines: number): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-lines);
}
