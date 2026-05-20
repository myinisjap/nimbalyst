import React, { useState, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { MaterialSymbol } from '@nimbalyst/runtime';
import {
  agentConfigsAtom,
  agentConfigListAtom,
  availableModelsAtom,
  defaultAgentModelAtom,
  type AgentConfig,
  type AIModel,
} from '../../../store/atoms/appSettings';

// ============================================================
// Types
// ============================================================

type EditingConfig = Partial<AgentConfig> & { id: string };

const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const;

const AGENT_PROVIDERS = [
  { id: 'claude-code', name: 'Claude Code' },
  { id: 'openai-codex', name: 'OpenAI Codex' },
  { id: 'opencode', name: 'OpenCode' },
] as const;

// ============================================================
// Env Var Editor
// ============================================================

interface EnvVarEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

interface EnvVarEntry { key: string; value: string; }

function recordToEntries(record: Record<string, string>): EnvVarEntry[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function entriesToRecord(entries: EnvVarEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key) result[key] = value;
  }
  return result;
}

function EnvVarEditor({ value, onChange }: EnvVarEditorProps) {
  const [entries, setEntries] = React.useState<EnvVarEntry[]>(() => recordToEntries(value));

  const prevValueRef = React.useRef(value);
  React.useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      setEntries(recordToEntries(value));
    }
  }, [value]);

  const updateEntry = (index: number, field: 'key' | 'value', newVal: string) => {
    const next = entries.map((e, i) => i === index ? { ...e, [field]: newVal } : e);
    setEntries(next);
    onChange(entriesToRecord(next));
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    setEntries(next);
    onChange(entriesToRecord(next));
  };

  const addEntry = () => {
    setEntries(prev => [...prev, { key: '', value: '' }]);
  };

  return (
    <div className="agent-config-env-editor flex flex-col gap-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input
            className="flex-1 px-2 py-1 text-xs rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] placeholder-[var(--nim-text-muted)] focus:outline-none focus:border-[var(--nim-primary)]"
            placeholder="KEY"
            value={entry.key}
            onChange={(e) => updateEntry(i, 'key', e.target.value)}
          />
          <span className="text-[var(--nim-text-muted)] text-xs">=</span>
          <input
            className="flex-1 px-2 py-1 text-xs rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] placeholder-[var(--nim-text-muted)] focus:outline-none focus:border-[var(--nim-primary)]"
            placeholder="value"
            value={entry.value}
            onChange={(e) => updateEntry(i, 'value', e.target.value)}
          />
          <button
            onClick={() => removeEntry(i)}
            className="p-1 rounded text-[var(--nim-text-muted)] hover:text-[#ef4444] hover:bg-[var(--nim-bg-tertiary)]"
          >
            <MaterialSymbol icon="close" size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={addEntry}
        className="self-start mt-1 flex items-center gap-1 text-xs text-[var(--nim-primary)] hover:opacity-80"
        data-testid="agent-config-add-env-var"
      >
        <MaterialSymbol icon="add" size={13} />
        Add variable
      </button>
    </div>
  );
}

// ============================================================
// Tags Editor
// ============================================================

interface TagsEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

function TagsEditor({ value, onChange }: TagsEditorProps) {
  const [input, setInput] = React.useState('');

  const addTag = () => {
    const tag = input.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="agent-config-tags-editor flex flex-wrap gap-1 p-1.5 rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] focus-within:border-[var(--nim-primary)] min-h-[34px]">
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-[var(--nim-bg-tertiary)] text-[var(--nim-text)]">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-[var(--nim-text-muted)] hover:text-[var(--nim-text)] ml-0.5"
          >
            <MaterialSymbol icon="close" size={11} />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[80px] bg-transparent text-xs text-[var(--nim-text)] placeholder-[var(--nim-text-muted)] outline-none"
        placeholder={value.length === 0 ? 'Add tags...' : ''}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
      />
    </div>
  );
}

// ============================================================
// Edit Form
// ============================================================

interface EditFormProps {
  config: EditingConfig;
  onChange: (config: EditingConfig) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
  availableModels: Record<string, AIModel[]>;
}

function EditForm({ config, onChange, onSave, onCancel, isNew, availableModels }: EditFormProps) {
  const set = (field: keyof AgentConfig, value: any) =>
    onChange({ ...config, [field]: value });

  const showEffortLevel = config.provider === 'claude-code';
  const showBinaryPath = ['claude-code', 'openai-codex', 'opencode'].includes(config.provider ?? '');
  const providerModels = availableModels[config.provider ?? ''] ?? [];

  return (
    <div className="agent-config-edit-form flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--nim-text-muted)]">Name *</label>
        <input
          className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] focus:outline-none focus:border-[var(--nim-primary)]"
          placeholder="e.g. Backend work"
          value={config.name ?? ''}
          onChange={(e) => set('name', e.target.value)}
          data-testid="agent-config-name-input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--nim-text-muted)]">Tags</label>
        <TagsEditor
          value={config.tags ?? []}
          onChange={(tags) => set('tags', tags.length > 0 ? tags : undefined)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--nim-text-muted)]">Default for planning type</label>
        <input
          className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] placeholder-[var(--nim-text-muted)] focus:outline-none focus:border-[var(--nim-primary)]"
          placeholder="e.g. implement, review, debug"
          value={config.defaultForPlanningType ?? ''}
          onChange={(e) => set('defaultForPlanningType', e.target.value.trim() || undefined)}
          data-testid="agent-config-planning-type-input"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-[var(--nim-text-muted)]">Provider</label>
          <select
            className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] focus:outline-none focus:border-[var(--nim-primary)]"
            value={config.provider ?? 'claude-code'}
            onChange={(e) => {
              const newProvider = e.target.value;
              const firstModel = availableModels[newProvider]?.[0]?.id;
              onChange({ ...config, provider: newProvider, model: firstModel ?? config.model });
            }}
            data-testid="agent-config-provider-select"
          >
            {AGENT_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-[var(--nim-text-muted)]">Model</label>
          {providerModels.length > 0 ? (
            <select
              className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] focus:outline-none focus:border-[var(--nim-primary)]"
              value={config.model ?? ''}
              onChange={(e) => set('model', e.target.value)}
              data-testid="agent-config-model-select"
            >
              {!providerModels.some((m) => m.id === config.model) && (
                <option value={config.model ?? ''}>{config.model || 'Select model'}</option>
              )}
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          ) : (
            <input
              className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] placeholder-[var(--nim-text-muted)] focus:outline-none focus:border-[var(--nim-primary)]"
              placeholder="e.g. claude-code:opus-1m"
              value={config.model ?? ''}
              onChange={(e) => set('model', e.target.value)}
              data-testid="agent-config-model-input"
            />
          )}
        </div>
      </div>

      {showEffortLevel && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--nim-text-muted)]">Effort Level</label>
          <select
            className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] focus:outline-none focus:border-[var(--nim-primary)]"
            value={config.effortLevel ?? ''}
            onChange={(e) => set('effortLevel', e.target.value || undefined)}
            data-testid="agent-config-effort-select"
          >
            <option value="">Default</option>
            {EFFORT_LEVELS.map((l) => (
              <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--nim-text-muted)]">System Prompt Path</label>
        <input
          className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] placeholder-[var(--nim-text-muted)] font-mono focus:outline-none focus:border-[var(--nim-primary)]"
          placeholder="/path/to/prompt.md"
          value={config.systemPromptPath ?? ''}
          onChange={(e) => set('systemPromptPath', e.target.value || undefined)}
          data-testid="agent-config-prompt-path-input"
        />
        <span className="text-xs text-[var(--nim-text-muted)]">Contents will be appended to the system prompt for every message.</span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--nim-text-muted)]">Environment Variables</label>
        <EnvVarEditor
          value={config.envVars ?? {}}
          onChange={(v) => set('envVars', Object.keys(v).length > 0 ? v : undefined)}
        />
      </div>

      {showBinaryPath && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--nim-text-muted)]">Custom Binary Path</label>
          <input
            className="px-2 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] placeholder-[var(--nim-text-muted)] font-mono focus:outline-none focus:border-[var(--nim-primary)]"
            placeholder="/usr/local/bin/claude"
            value={config.customBinaryPath ?? ''}
            onChange={(e) => set('customBinaryPath', e.target.value || undefined)}
            data-testid="agent-config-binary-path-input"
          />
          <span className="text-xs text-[var(--nim-text-muted)]">Override the default executable path.</span>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-[var(--nim-border)]">
        <button
          onClick={onSave}
          disabled={!config.name?.trim() || !config.model?.trim()}
          className="px-3 py-1.5 text-sm rounded bg-[var(--nim-primary)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="agent-config-save-btn"
        >
          {isNew ? 'Create' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] border border-[var(--nim-border)] hover:bg-[var(--nim-bg-tertiary)]"
          data-testid="agent-config-cancel-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main Panel
// ============================================================

export function AgentConfigsPanel() {
  const [configs, setConfigs] = useAtom(agentConfigsAtom);
  const configList = useAtomValue(agentConfigListAtom);
  const availableModels = useAtomValue(availableModelsAtom) as Record<string, AIModel[]>;
  const defaultModel = useAtomValue(defaultAgentModelAtom);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<EditingConfig | null>(null);

  const startCreate = useCallback(() => {
    const id = crypto.randomUUID();
    // Parse provider from the user's current default model (e.g. "claude-code:opus-1m" -> "claude-code")
    const defaultProvider = defaultModel?.includes(':')
      ? defaultModel.split(':')[0]
      : 'claude-code';
    setEditingId(id);
    setEditingConfig({
      id,
      name: '',
      provider: defaultProvider,
      model: defaultModel || 'claude-code:opus-1m',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, [defaultModel]);

  const startEdit = useCallback((cfg: AgentConfig) => {
    setEditingId(cfg.id);
    setEditingConfig({ ...cfg });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingConfig || !editingConfig.name?.trim() || !editingConfig.model?.trim()) return;

    const toSave: AgentConfig = {
      id: editingConfig.id,
      name: editingConfig.name.trim(),
      tags: editingConfig.tags && editingConfig.tags.length > 0 ? editingConfig.tags : undefined,
      defaultForPlanningType: editingConfig.defaultForPlanningType || undefined,
      provider: editingConfig.provider ?? 'claude-code',
      model: editingConfig.model.trim(),
      envVars: editingConfig.envVars,
      systemPromptPath: editingConfig.systemPromptPath?.trim() || undefined,
      effortLevel: editingConfig.effortLevel || undefined,
      customBinaryPath: editingConfig.customBinaryPath?.trim() || undefined,
      createdAt: editingConfig.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    try {
      // Enforce uniqueness: clear the same defaultForPlanningType from other configs
      const newConfigs = { ...configs };
      const configsToPersist: AgentConfig[] = [];
      if (toSave.defaultForPlanningType) {
        for (const [otherId, other] of Object.entries(newConfigs)) {
          if (otherId !== toSave.id && other.defaultForPlanningType === toSave.defaultForPlanningType) {
            const updated = { ...other, defaultForPlanningType: undefined };
            newConfigs[otherId] = updated;
            configsToPersist.push(updated);
          }
        }
      }
      newConfigs[toSave.id] = toSave;

      // Persist all modified configs to main process
      await Promise.all(configsToPersist.map(c => window.electronAPI.agentConfigs.save(c)));
      await window.electronAPI.agentConfigs.save(toSave);
      setConfigs(newConfigs);
      setEditingId(null);
      setEditingConfig(null);
    } catch (error) {
      console.error('[AgentConfigsPanel] Failed to save config:', error);
    }
  }, [editingConfig, configs, setConfigs]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditingConfig(null);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Delete this agent config?')) return;
    try {
      await window.electronAPI.agentConfigs.delete(id);
      setConfigs((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      console.error('[AgentConfigsPanel] Failed to delete config:', error);
    }
  }, [setConfigs]);

  const providerLabel = (provider: string) =>
    AGENT_PROVIDERS.find((p) => p.id === provider)?.name ?? provider;

  return (
    <div className="agent-configs-panel flex flex-col">
      <div className="agent-configs-panel-header mb-6 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="text-xl font-semibold leading-tight mb-2 text-[var(--nim-text)]">Agent Configs</h3>
        <p className="text-sm leading-relaxed text-[var(--nim-text-muted)]">
          Save named agent presets with a provider, model, environment variables, and more.
          Select a preset when starting a new session.
        </p>
      </div>

      {editingId && editingConfig ? (
        <div className="agent-config-edit-section">
          <h4 className="text-sm font-semibold mb-4 text-[var(--nim-text)]">
            {configs[editingId] ? 'Edit Config' : 'New Config'}
          </h4>
          <EditForm
            config={editingConfig}
            onChange={setEditingConfig}
            onSave={handleSave}
            onCancel={handleCancel}
            isNew={!configs[editingId]}
            availableModels={availableModels}
          />
        </div>
      ) : (
        <div className="agent-config-list-section flex flex-col gap-3">
          {configList.length === 0 ? (
            <p className="text-sm text-[var(--nim-text-muted)] py-2">No saved configs yet.</p>
          ) : (
            configList.map((cfg) => (
              <div
                key={cfg.id}
                className="agent-config-item flex items-start justify-between gap-3 p-3 rounded-lg bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)]"
                data-testid={`agent-config-item-${cfg.id}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium text-[var(--nim-text)] truncate">{cfg.name}</span>
                  {cfg.tags && cfg.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {cfg.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 text-xs rounded bg-[var(--nim-bg-tertiary)] text-[var(--nim-text-muted)]">{tag}</span>
                      ))}
                    </div>
                  )}
                  <span className="text-xs text-[var(--nim-text-muted)] mt-0.5">
                    {providerLabel(cfg.provider)} &middot; {cfg.model}
                  </span>
                  {cfg.defaultForPlanningType && (
                    <span className="text-xs text-[var(--nim-text-muted)] mt-0.5">Default for: {cfg.defaultForPlanningType}</span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(cfg)}
                    className="p-1.5 rounded text-[var(--nim-text-muted)] hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-tertiary)]"
                    title="Edit"
                    data-testid={`agent-config-edit-${cfg.id}`}
                  >
                    <MaterialSymbol icon="edit" size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(cfg.id)}
                    className="p-1.5 rounded text-[var(--nim-text-muted)] hover:text-[#ef4444] hover:bg-[var(--nim-bg-tertiary)]"
                    title="Delete"
                    data-testid={`agent-config-delete-${cfg.id}`}
                  >
                    <MaterialSymbol icon="delete" size={14} />
                  </button>
                </div>
              </div>
            ))
          )}

          <button
            onClick={startCreate}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] text-[var(--nim-text)] hover:bg-[var(--nim-bg-tertiary)] mt-1"
            data-testid="agent-config-new-btn"
          >
            <MaterialSymbol icon="add" size={15} />
            New Config
          </button>
        </div>
      )}
    </div>
  );
}
