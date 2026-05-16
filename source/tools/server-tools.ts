import * as os from 'os';
import { ToolModule } from '../types';
import { createToolModule, numberProp, objectSchema, ok } from './toolkit';

// EN: Server tools report both Cocos editor server state and local Node network information.
// ZH: server 工具同时报告 Cocos 编辑器服务状态和本地 Node 网络信息。
export function createServerTools(): ToolModule {
  return createToolModule('server', [
    {
      name: 'query_server_ip_list',
      description: 'Query server IP list',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({ ipList: await context.editor.request('server', 'query-ip-list') }),
    },
    {
      name: 'query_sorted_server_ip_list',
      description: 'Get sorted server IP list',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({ sortedIPList: await context.editor.request('server', 'query-sort-ip-list') }),
    },
    {
      name: 'query_server_port',
      description: 'Query editor server current port',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({ port: await context.editor.request('server', 'query-port') }),
    },
    {
      name: 'get_server_status',
      description: 'Get comprehensive server status information',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const [ipList, port] = await Promise.allSettled([
          context.editor.request('server', 'query-ip-list'),
          context.editor.request('server', 'query-port'),
        ]);
        return ok({
          timestamp: new Date().toISOString(),
          editor: context.editor.projectInfo(),
          ipList: ipList.status === 'fulfilled' ? ipList.value : [],
          port: port.status === 'fulfilled' ? port.value : undefined,
          platform: process.platform,
          nodeVersion: process.version,
        });
      },
    },
    {
      name: 'check_server_connectivity',
      description: 'Check server connectivity and network status',
      inputSchema: objectSchema({ timeout: numberProp('Timeout in milliseconds', { default: 5000 }) }),
      handler: async (_args, context) => {
        const startedAt = Date.now();
        await context.editor.request('server', 'query-port');
        return ok({ reachable: true, latencyMs: Date.now() - startedAt });
      },
    },
    {
      name: 'get_network_interfaces',
      description: 'Get available network interfaces',
      inputSchema: objectSchema(),
      handler: async () => ok(os.networkInterfaces()),
    },
  ]);
}
