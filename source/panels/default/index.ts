import { readFileSync } from 'fs';
import { join } from 'path';
import type { ToolCatalogEntry, ToolExposureConfig } from '../../types';

interface PanelElements {
  statusBadge: '#statusBadge';
  endpointValue: '#endpointValue';
  toolsValue: '#toolsValue';
  catalogValue: '#catalogValue';
  dangerousValue: '#dangerousValue';
  partialValue: '#partialValue';
  sessionsValue: '#sessionsValue';
  hostValue: '#hostValue';
  coreProfileButton: '#coreProfileButton';
  fullProfileButton: '#fullProfileButton';
  dangerousToggle: '#dangerousToggle';
  applyExposureButton: '#applyExposureButton';
  profileFilter: '#profileFilter';
  riskFilter: '#riskFilter';
  statusFilter: '#statusFilter';
  startButton: '#startButton';
  stopButton: '#stopButton';
  refreshButton: '#refreshButton';
  copyButton: '#copyButton';
  toolSummary: '#toolSummary';
  toolsList: '#toolsList';
  messageLine: '#messageLine';
}

interface ServerStatus {
  running: boolean;
  host: string;
  port: number;
  sessions: number;
  tools: number;
  catalogTools: number;
  dangerousTools: number;
  partialTools: number;
  exposure: ToolExposureConfig;
}

type PanelThis = Editor.Panel.Selector<PanelElements> & {
  currentTools: ToolCatalogEntry[];
  currentExposure: ToolExposureConfig;
  refreshStatus(): Promise<void>;
  startServer(): Promise<void>;
  stopServer(): Promise<void>;
  copyEndpoint(): Promise<void>;
  selectProfile(profile: ToolExposureConfig['profile']): void;
  applyExposureConfig(): Promise<void>;
  setMessage(message: string): void;
  setBusy(busy: boolean): void;
  renderStatus(status: ServerStatus): void;
  renderExposureConfig(config: ToolExposureConfig): void;
  renderTools(tools: ToolCatalogEntry[]): void;
  renderFilteredTools(): void;
};

const packageName = 'cocos-mcp-plugin';

// EN: The panel is a thin UI client; all server state changes go through main-process messages.
// ZH: 面板只是轻量 UI 客户端；所有服务状态变更都通过主进程 message 完成。
module.exports = Editor.Panel.define({
  listeners: {
    show() {
      void (this as PanelThis).refreshStatus();
    },
  },
  template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf8'),
  style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf8'),
  $: {
    statusBadge: '#statusBadge',
    endpointValue: '#endpointValue',
    toolsValue: '#toolsValue',
    catalogValue: '#catalogValue',
    dangerousValue: '#dangerousValue',
    partialValue: '#partialValue',
    sessionsValue: '#sessionsValue',
    hostValue: '#hostValue',
    coreProfileButton: '#coreProfileButton',
    fullProfileButton: '#fullProfileButton',
    dangerousToggle: '#dangerousToggle',
    applyExposureButton: '#applyExposureButton',
    profileFilter: '#profileFilter',
    riskFilter: '#riskFilter',
    statusFilter: '#statusFilter',
    startButton: '#startButton',
    stopButton: '#stopButton',
    refreshButton: '#refreshButton',
    copyButton: '#copyButton',
    toolSummary: '#toolSummary',
    toolsList: '#toolsList',
    messageLine: '#messageLine',
  },
  methods: {
    async refreshStatus(this: PanelThis) {
      this.setBusy(true);
      try {
        // EN: Status and catalog are read separately so the UI can show both exposed and hidden tools.
        // ZH: 状态和目录分开读取，使 UI 能同时展示已暴露工具和隐藏工具。
        const status = await Editor.Message.request(packageName, 'get-server-status') as ServerStatus;
        const tools = await Editor.Message.request(packageName, 'get-tools-list') as ToolCatalogEntry[];
        this.renderStatus(status);
        this.renderExposureConfig(status.exposure);
        this.renderTools(tools);
        this.setMessage('Ready');
      } catch (error) {
        this.setMessage(`Failed to refresh panel: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.setBusy(false);
      }
    },

    async startServer(this: PanelThis) {
      this.setBusy(true);
      try {
        await Editor.Message.request(packageName, 'start-server');
        this.setMessage('Server started');
        await this.refreshStatus();
      } catch (error) {
        this.setMessage(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.setBusy(false);
      }
    },

    async stopServer(this: PanelThis) {
      this.setBusy(true);
      try {
        await Editor.Message.request(packageName, 'stop-server');
        this.setMessage('Server stopped');
        await this.refreshStatus();
      } catch (error) {
        this.setMessage(`Failed to stop server: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.setBusy(false);
      }
    },

    async copyEndpoint(this: PanelThis) {
      const text = this.$.endpointValue?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        this.setMessage('Endpoint copied');
      } catch {
        this.setMessage(text);
      }
    },

    selectProfile(this: PanelThis, profile: ToolExposureConfig['profile']) {
      this.currentExposure = {
        ...this.currentExposure,
        profile,
      };
      this.renderExposureConfig(this.currentExposure);
    },

    async applyExposureConfig(this: PanelThis) {
      this.setBusy(true);
      try {
        const config = readExposureConfig(this);
        // EN: Applying exposure persists the profile and restarts the MCP service in main.ts.
        // ZH: 应用暴露配置会在 main.ts 中持久化 profile 并重启 MCP 服务。
        await Editor.Message.request(packageName, 'update-tool-exposure-config', config);
        this.setMessage('Profile applied and server restarted');
        await this.refreshStatus();
      } catch (error) {
        this.setMessage(`Failed to apply profile: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.setBusy(false);
      }
    },

    setMessage(this: PanelThis, message: string) {
      if (this.$.messageLine) {
        this.$.messageLine.textContent = message;
      }
    },

    setBusy(this: PanelThis, busy: boolean) {
      setDisabled(this.$.startButton, busy);
      setDisabled(this.$.stopButton, busy);
      setDisabled(this.$.refreshButton, busy);
      setDisabled(this.$.copyButton, busy);
      setDisabled(this.$.applyExposureButton, busy);
      setDisabled(this.$.coreProfileButton, busy);
      setDisabled(this.$.fullProfileButton, busy);
    },

    renderStatus(this: PanelThis, status: ServerStatus) {
      const endpoint = `http://${status.host}:${status.port}/mcp`;
      if (this.$.statusBadge) {
        this.$.statusBadge.textContent = status.running ? 'Running' : 'Stopped';
        this.$.statusBadge.classList.toggle('running', status.running);
        this.$.statusBadge.classList.toggle('stopped', !status.running);
      }
      // EN: Start and Stop are mutually exclusive controls to avoid contradictory actions.
      // ZH: Start 与 Stop 互斥展示，避免用户看到冲突操作。
      setHidden(this.$.startButton, status.running);
      setHidden(this.$.stopButton, !status.running);
      setText(this.$.endpointValue, endpoint);
      setText(this.$.toolsValue, String(status.tools));
      setText(this.$.catalogValue, String(status.catalogTools));
      setText(this.$.dangerousValue, String(status.dangerousTools));
      setText(this.$.partialValue, String(status.partialTools));
    },

    renderExposureConfig(this: PanelThis, config: ToolExposureConfig) {
      this.currentExposure = config;
      const isCore = config.profile === 'core';
      this.$.coreProfileButton?.classList.toggle('selected', isCore);
      this.$.fullProfileButton?.classList.toggle('selected', !isCore);
      if (this.$.dangerousToggle instanceof HTMLInputElement) {
        this.$.dangerousToggle.checked = config.allowDangerous;
      }
    },

    renderTools(this: PanelThis, tools: ToolCatalogEntry[]) {
      this.currentTools = tools;
      this.renderFilteredTools();
    },

    renderFilteredTools(this: PanelThis) {
      if (!this.$.toolsList) {
        return;
      }
      const tools = filterTools(this.currentTools, this);
      // EN: Filtering is local-only; it does not change MCP exposure until Apply & Restart.
      // ZH: 筛选仅影响面板本地展示；不会改变 MCP 暴露，直到点击 Apply & Restart。
      setText(this.$.toolSummary, `${tools.length}/${this.currentTools.length} tools`);
      this.$.toolsList.replaceChildren(...tools.map((tool) => createToolRow(tool)));
    },
  },
  ready(this: PanelThis) {
    this.currentTools = [];
    this.currentExposure = { profile: 'core', allowDangerous: false };
    this.$.startButton?.addEventListener('click', () => void this.startServer());
    this.$.stopButton?.addEventListener('click', () => void this.stopServer());
    this.$.refreshButton?.addEventListener('click', () => void this.refreshStatus());
    this.$.copyButton?.addEventListener('click', () => void this.copyEndpoint());
    this.$.coreProfileButton?.addEventListener('click', () => this.selectProfile('core'));
    this.$.fullProfileButton?.addEventListener('click', () => this.selectProfile('full'));
    this.$.dangerousToggle?.addEventListener('change', () => {
      this.currentExposure = readExposureConfig(this);
    });
    this.$.applyExposureButton?.addEventListener('click', () => void this.applyExposureConfig());
    this.$.profileFilter?.addEventListener('change', () => this.renderFilteredTools());
    this.$.riskFilter?.addEventListener('change', () => this.renderFilteredTools());
    this.$.statusFilter?.addEventListener('change', () => this.renderFilteredTools());
    void this.refreshStatus();
  },
});

function setText(element: HTMLElement | null | undefined, value: string): void {
  if (element) {
    element.textContent = value;
  }
}

function setHidden(element: HTMLElement | null | undefined, hidden: boolean): void {
  if (element) {
    element.hidden = hidden;
  }
}

function setDisabled(element: HTMLElement | null | undefined, disabled: boolean): void {
  if (element instanceof HTMLButtonElement) {
    element.disabled = disabled;
  }
}

function createToolRow(tool: ToolCatalogEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tool-row';
  row.dataset.status = tool.status;
  row.dataset.enabled = String(tool.enabled);

  const name = document.createElement('code');
  name.textContent = tool.name;

  const meta = document.createElement('span');
  meta.className = 'tool-meta';
  meta.textContent = `${tool.profile} / ${tool.risk}`;

  const status = document.createElement('span');
  status.className = 'tool-status';
  status.textContent = tool.enabled ? tool.status : 'disabled';
  if (tool.disabledReason) {
    // EN: Use native title so disabled reasons are visible without extra panel state.
    // ZH: 使用原生 title 展示禁用原因，避免额外维护面板状态。
    status.title = tool.disabledReason;
  }

  row.append(name, meta, status);
  return row;
}

function readExposureConfig(panel: PanelThis): ToolExposureConfig {
  const profile = panel.$.fullProfileButton?.classList.contains('selected') ? 'full' : 'core';
  const allowDangerous = panel.$.dangerousToggle instanceof HTMLInputElement ? panel.$.dangerousToggle.checked : false;
  return { profile, allowDangerous };
}

function filterTools(tools: ToolCatalogEntry[], panel: PanelThis): ToolCatalogEntry[] {
  const profile = selectValue(panel.$.profileFilter);
  const risk = selectValue(panel.$.riskFilter);
  const status = selectValue(panel.$.statusFilter);
  return tools.filter((tool) => {
    if (profile !== 'all' && tool.profile !== profile) {
      return false;
    }
    if (risk !== 'all' && tool.risk !== risk) {
      return false;
    }
    if (status !== 'all' && tool.status !== status) {
      return false;
    }
    return true;
  });
}

function selectValue(element: HTMLElement | null | undefined): string {
  return element instanceof HTMLSelectElement ? element.value : 'all';
}
