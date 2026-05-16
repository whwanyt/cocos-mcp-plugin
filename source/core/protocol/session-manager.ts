import { randomUUID } from 'crypto';

// EN: Streamable HTTP sessions are transport-level state, not tool execution state.
// ZH: Streamable HTTP session 属于传输层状态，不承载工具执行状态。
export interface McpSession {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  initialized: boolean;
}

export class SessionManager {
  private readonly sessions = new Map<string, McpSession>();

  create(): McpSession {
    const now = Date.now();
    const session: McpSession = {
      id: randomUUID(),
      createdAt: now,
      lastActivityAt: now,
      initialized: false,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): McpSession | undefined {
    const session = this.sessions.get(id);
    if (session) {
      // EN: Touch activity on every validated request so future cleanup can be added without changing callers.
      // ZH: 每次校验请求都会刷新活跃时间，便于后续添加清理策略且无需修改调用方。
      session.lastActivityAt = Date.now();
    }
    return session;
  }

  markInitialized(id: string): void {
    const session = this.get(id);
    if (session) {
      session.initialized = true;
    }
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  count(): number {
    return this.sessions.size;
  }
}
