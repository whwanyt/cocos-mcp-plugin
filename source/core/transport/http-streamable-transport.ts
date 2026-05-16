import * as http from 'http';
import { URL } from 'url';
import { JsonRpcMessage, Logger, McpServerSettings, TransportAdapter, TransportStatus } from '../../types';
import { failure } from '../protocol/json-rpc';
import { MCP_PROTOCOL_VERSION, McpRequestRouter } from '../protocol/mcp-router';
import { SessionManager } from '../protocol/session-manager';

const SESSION_HEADER = 'mcp-session-id';
const PROTOCOL_HEADER = 'mcp-protocol-version';

// EN: Streamable HTTP adapter owns HTTP/SSE/session headers and delegates JSON-RPC handling to the router.
// ZH: Streamable HTTP 适配器负责 HTTP/SSE/session headers，并把 JSON-RPC 处理委托给 router。
export class HttpStreamableTransport implements TransportAdapter {
  private server: http.Server | null = null;

  constructor(
    private readonly settings: McpServerSettings,
    private readonly router: McpRequestRouter,
    private readonly sessions: SessionManager,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Unhandled HTTP error', message);
        this.writeJson(res, 500, failure(null, -32603, message));
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.settings.port, this.settings.host, () => {
        this.server!.off('error', reject);
        this.logger.info(`Streamable HTTP server listening on http://${this.settings.host}:${this.settings.port}/mcp`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = null;
  }

  getStatus(): TransportStatus {
    return {
      running: !!this.server,
      host: this.settings.host,
      port: this.settings.port,
      sessions: this.sessions.count(),
    };
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `${this.settings.host}:${this.settings.port}`}`);

    // EN: CORS headers are applied before routing so preflight and errors share the same browser behavior.
    // ZH: 路由前统一写入 CORS header，让预检和错误响应拥有一致的浏览器行为。
    this.applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!this.isAllowedOrigin(req)) {
      // EN: Localhost is allowed by default; non-local origins must be explicitly configured.
      // ZH: 默认允许本机来源；非本机来源必须显式配置。
      this.writeJson(res, 403, { error: 'Forbidden origin' });
      return;
    }

    if (this.settings.authToken && req.headers.authorization !== `Bearer ${this.settings.authToken}`) {
      this.writeJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (parsedUrl.pathname === '/health' && req.method === 'GET') {
      this.writeJson(res, 200, {
        status: 'ok',
        protocolVersion: MCP_PROTOCOL_VERSION,
        sessions: this.sessions.count(),
      });
      return;
    }

    if (parsedUrl.pathname !== '/mcp') {
      this.writeJson(res, 404, { error: 'Not found' });
      return;
    }

    if (req.method === 'POST') {
      await this.handlePost(req, res);
      return;
    }

    if (req.method === 'GET') {
      this.handleGet(req, res);
      return;
    }

    if (req.method === 'DELETE') {
      this.handleDelete(req, res);
      return;
    }

    this.writeJson(res, 405, { error: 'Method not allowed' });
  }

  private async handlePost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let message: JsonRpcMessage;

    try {
      message = JSON.parse(body);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      this.writeJson(res, 400, failure(null, -32700, `Parse error: ${details}`));
      return;
    }

    const sessionId = this.ensureSession(req, res, message);
    if (!sessionId) {
      return;
    }

    const routed = await this.router.route(message);
    if (routed.notificationAccepted && !routed.response) {
      // EN: JSON-RPC notifications have no response body; HTTP 202 confirms transport acceptance.
      // ZH: JSON-RPC notification 没有响应体；HTTP 202 表示传输层已接收。
      res.writeHead(202);
      res.end();
      return;
    }

    if (!routed.response) {
      res.writeHead(202);
      res.end();
      return;
    }

    if (this.acceptsSse(req)) {
      this.writeSse(res, routed.response);
      return;
    }

    this.writeJson(res, 200, routed.response);
  }

  private handleGet(req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = this.readSessionId(req);
    if (!sessionId || !this.sessions.get(sessionId)) {
      this.writeJson(res, 404, { error: 'Session not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    // EN: GET opens a lightweight SSE stream that announces the active endpoint for this session.
    // ZH: GET 打开轻量 SSE 流，并向当前 session 公告可用端点。
    res.write(`event: endpoint\n`);
    res.write(`data: ${JSON.stringify({ endpoint: '/mcp', protocolVersion: MCP_PROTOCOL_VERSION })}\n\n`);
  }

  private handleDelete(req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = this.readSessionId(req);
    if (!sessionId || !this.sessions.delete(sessionId)) {
      this.writeJson(res, 404, { error: 'Session not found' });
      return;
    }

    res.writeHead(204);
    res.end();
  }

  private ensureSession(req: http.IncomingMessage, res: http.ServerResponse, message: JsonRpcMessage): string | undefined {
    if ('method' in message && message.method === 'initialize') {
      // EN: initialize is the only request that may create a new session without an incoming session header.
      // ZH: initialize 是唯一允许在没有 session header 时创建新 session 的请求。
      const session = this.sessions.create();
      this.sessions.markInitialized(session.id);
      res.setHeader('Mcp-Session-Id', session.id);
      return session.id;
    }

    const sessionId = this.readSessionId(req);
    if (!sessionId) {
      this.writeJson(res, 400, failure(null, -32000, 'Missing Mcp-Session-Id header'));
      return undefined;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.writeJson(res, 404, failure(null, -32001, 'Unknown MCP session'));
      return undefined;
    }

    const protocolVersion = req.headers[PROTOCOL_HEADER];
    if (protocolVersion && protocolVersion !== MCP_PROTOCOL_VERSION) {
      this.writeJson(res, 400, failure(null, -32002, `Unsupported MCP protocol version: ${protocolVersion}`));
      return undefined;
    }

    return session.id;
  }

  private readSessionId(req: http.IncomingMessage): string | undefined {
    const value = req.headers[SESSION_HEADER];
    return Array.isArray(value) ? value[0] : value;
  }

  private acceptsSse(req: http.IncomingMessage): boolean {
    // EN: First version streams a single final message when the client opts into SSE.
    // ZH: 当前版本在客户端选择 SSE 时流式发送单个最终 message。
    const accept = req.headers.accept ?? '';
    return accept.includes('text/event-stream');
  }

  private writeSse(res: http.ServerResponse, message: unknown): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(message)}\n\n`);
    res.end();
  }

  private writeJson(res: http.ServerResponse, status: number, payload: unknown): void {
    if (!res.headersSent) {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    res.end(JSON.stringify(payload));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private isAllowedOrigin(req: http.IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) {
      return true;
    }

    if (this.settings.allowedOrigins.includes('*') || this.settings.allowedOrigins.includes(origin)) {
      return true;
    }

    try {
      const parsed = new URL(origin);
      // EN: Hostname check keeps the safe default local even when ports vary.
      // ZH: 只校验 hostname，使端口变化时仍保持本地安全默认值。
      return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  private applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    const allowOrigin = origin && this.isAllowedOrigin(req) ? origin : 'http://127.0.0.1';
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  }
}
