import { ToolModule } from '../types';
import { createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';

// EN: Broadcast state is kept in-memory for the current plugin process only.
// ZH: broadcast 状态仅保存在当前插件进程内存中。
interface BroadcastEntry {
  message: string;
  data: unknown;
  timestamp: number;
}

export function createBroadcastTools(): ToolModule {
  const log: BroadcastEntry[] = [];
  const listeners = new Set<string>([
    'build-worker:ready',
    'build-worker:closed',
    'scene:ready',
    'scene:close',
    'asset-db:ready',
    'asset-db:close',
    'asset-db:asset-add',
    'asset-db:asset-change',
    'asset-db:asset-delete',
  ]);

  return createToolModule('broadcast', [
    {
      name: 'get_broadcast_log',
      description: 'Get recent broadcast messages log',
      inputSchema: objectSchema({
        limit: numberProp('Number of recent messages to return', { default: 50 }),
        messageType: stringProp('Filter by message type'),
      }),
      status: 'partial',
      handler: async (args) => {
        const filtered = args.messageType ? log.filter((entry) => entry.message === args.messageType) : log;
        return ok({ entries: filtered.slice(-Number(args.limit ?? 50)), activeListeners: [...listeners] });
      },
    },
    {
      name: 'listen_broadcast',
      description: 'Start listening for specific broadcast messages',
      inputSchema: objectSchema({ messageType: stringProp('Message type to listen for') }, ['messageType']),
      status: 'partial',
      handler: async (args) => {
        listeners.add(String(args.messageType));
        return ok({ messageType: args.messageType, simulated: true }, 'Listener registered in local registry');
      },
    },
    {
      name: 'stop_listening',
      description: 'Stop listening for specific broadcast messages',
      inputSchema: objectSchema({ messageType: stringProp('Message type to stop listening for') }, ['messageType']),
      handler: async (args) => {
        listeners.delete(String(args.messageType));
        return ok({ messageType: args.messageType }, 'Listener removed');
      },
    },
    {
      name: 'clear_broadcast_log',
      description: 'Clear the broadcast messages log',
      inputSchema: objectSchema(),
      handler: async () => {
        log.length = 0;
        return ok(undefined, 'Broadcast log cleared');
      },
    },
    {
      name: 'get_active_listeners',
      description: 'Get list of active broadcast listeners',
      inputSchema: objectSchema(),
      handler: async () => ok({ listeners: [...listeners] }),
    },
  ]);
}
