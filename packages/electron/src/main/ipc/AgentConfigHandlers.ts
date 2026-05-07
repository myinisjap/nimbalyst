import { safeHandle } from '../utils/ipcRegistry';
import {
  type AgentConfig,
  getAgentConfigs,
  saveAgentConfig,
  deleteAgentConfig,
} from '../utils/store';

let handlersRegistered = false;

export function registerAgentConfigHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  safeHandle('agent-configs:list', async () => {
    return getAgentConfigs();
  });

  safeHandle('agent-configs:get', async (_event, id: string) => {
    const configs = getAgentConfigs();
    return configs[id] ?? null;
  });

  safeHandle('agent-configs:save', async (_event, config: AgentConfig) => {
    return saveAgentConfig(config);
  });

  safeHandle('agent-configs:delete', async (_event, id: string) => {
    deleteAgentConfig(id);
  });
}
