/**
 * Session Kanban Board Atoms
 *
 * State for the session kanban board view in TrackerMode.
 * Sessions/workstreams/worktrees are organized into phase columns
 * (backlog, planning, implementing, validating, complete).
 *
 * Phase is stored in metadata.phase on each session.
 * Only sessions with a phase appear on the board.
 */

import { atom } from 'jotai';
import { atomFamily } from '../debug/atomFamilyRegistry';
import { store } from '@nimbalyst/runtime/store';
import type { SessionMeta } from '@nimbalyst/runtime';
import {
  sessionRegistryAtom,
  sessionProcessingAtom,
  sessionHasPendingInteractivePromptAtom,
} from './sessions';

// ============================================================
// Types
// ============================================================

/** Phase columns on the kanban board */
export type SessionPhase = 'backlog' | 'planning' | 'implementing' | 'validating' | 'complete';

/** Card type determines visual treatment and whether child run states are shown */
export type KanbanCardType = 'session' | 'workstream' | 'worktree';

/** Summary of child session states for a workstream/worktree card */
export interface ChildRunStateSummary {
  running: number;
  waiting: number;
  review: number;
  idle: number;
  done: number;
  total: number;
}

// ============================================================
// Phase Column Definitions
// ============================================================

export const SESSION_PHASE_COLUMNS: { value: SessionPhase; label: string; color: string }[] = [
  { value: 'backlog', label: 'Backlog', color: '#6b7280' },
  { value: 'planning', label: 'Planning', color: '#60a5fa' },
  { value: 'implementing', label: 'Implementing', color: '#eab308' },
  { value: 'validating', label: 'Validating', color: '#a78bfa' },
  { value: 'complete', label: 'Complete', color: '#4ade80' },
];

const VALID_PHASES = new Set<string>(SESSION_PHASE_COLUMNS.map(c => c.value));

/** Phase priority for deriving workstream phase from children (lower = more active) */
const PHASE_PRIORITY: Record<string, number> = {
  implementing: 0,
  validating: 1,
  planning: 2,
  backlog: 3,
  complete: 4,
};

// ============================================================
// Helpers
// ============================================================

/** Derive the card type from session metadata */
export function getCardType(meta: SessionMeta | undefined): KanbanCardType {
  if (!meta) return 'session';
  if (meta.worktreeId) return 'worktree';
  if (meta.sessionType === 'workstream' || meta.childCount > 0) return 'workstream';
  return 'session';
}

/**
 * Derive the effective phase for a workstream parent from its children's phases.
 * Returns the "most active" child phase (implementing > validating > planning > backlog > complete).
 * Returns undefined if no children have a phase.
 */
function derivePhaseFromChildren(parentId: string, registry: Map<string, SessionMeta>): string | undefined {
  let bestPhase: string | undefined;
  let bestPriority = Infinity;

  for (const [_id, meta] of registry) {
    if (meta.parentSessionId !== parentId) continue;
    if (meta.phase && VALID_PHASES.has(meta.phase)) {
      const priority = PHASE_PRIORITY[meta.phase] ?? Infinity;
      if (priority < bestPriority) {
        bestPriority = priority;
        bestPhase = meta.phase;
      }
    }
  }

  return bestPhase;
}

// ============================================================
// Filter State
// ============================================================

export interface SessionKanbanFilter {
  search: string;
  tags: string[];
  showComplete: boolean;
  /** Per-column agent config overrides — when a card is dropped into the column, its agentConfigId is set to this value */
  columnAgentConfigs: Record<SessionPhaseKey, string | null>;
}

const DEFAULT_COLUMN_AGENT_CONFIGS: Record<SessionPhaseKey, string | null> = {
  unphased: null,
  backlog: null,
  planning: null,
  implementing: null,
  validating: null,
  complete: null,
};

/** Filter state for the kanban board */
export const sessionKanbanFilterAtom = atom<SessionKanbanFilter>({
  search: '',
  tags: [],
  showComplete: true,
  columnAgentConfigs: DEFAULT_COLUMN_AGENT_CONFIGS,
});

// ============================================================
// Derived Atoms
// ============================================================

/** Key type for the grouped map - includes 'unphased' for sessions without a phase */
export type SessionPhaseKey = SessionPhase | 'unphased';

/** Derived: sessions grouped by phase for the kanban board */
export const sessionsByPhaseAtom = atom((get) => {
  const registry = get(sessionRegistryAtom);
  const filter = get(sessionKanbanFilterAtom);

  const grouped = new Map<SessionPhaseKey, SessionMeta[]>();
  grouped.set('unphased', []);
  for (const col of SESSION_PHASE_COLUMNS) {
    grouped.set(col.value, []);
  }

  for (const [_id, meta] of registry) {
    // Only show root sessions (not children of workstreams)
    if (meta.parentSessionId) continue;

    // For workstream parents without an explicit phase, derive from children
    const phase = meta.phase
      ?? (meta.childCount > 0 ? derivePhaseFromChildren(meta.id, registry) : undefined);

    // Skip complete if filter says hide
    if (!filter.showComplete && phase === 'complete') continue;

    // Skip archived unless in complete column
    if (meta.isArchived && phase !== 'complete') continue;

    // Apply search filter
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!meta.title.toLowerCase().includes(q)) continue;
    }

    // Apply tag filter
    if (filter.tags.length > 0) {
      const sessionTags = meta.tags || [];
      if (!filter.tags.some(t => sessionTags.includes(t))) continue;
    }

    if (phase && VALID_PHASES.has(phase)) {
      grouped.get(phase as SessionPhase)!.push(meta);
    } else {
      grouped.get('unphased')!.push(meta);
    }
  }

  // Sort each column by updatedAt desc
  for (const [_phase, sessions] of grouped) {
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return grouped;
});

/** Derived: total count of sessions on the board (with a phase) */
export const sessionKanbanTotalCountAtom = atom((get) => {
  const grouped = get(sessionsByPhaseAtom);
  let total = 0;
  for (const sessions of grouped.values()) {
    total += sessions.length;
  }
  return total;
});

/** Derived: all unique tags from root sessions (with counts) */
export const sessionKanbanTagsAtom = atom((get) => {
  const registry = get(sessionRegistryAtom);
  const tagCounts = new Map<string, number>();

  for (const [_id, meta] of registry) {
    if (meta.parentSessionId) continue;
    if (meta.tags) {
      for (const tag of meta.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }

  return Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
});

// ============================================================
// Child Run State Atoms
// ============================================================

/** Derive child run state summary for a workstream/worktree card */
export const childRunStatesAtom = atomFamily((sessionId: string) =>
  atom((get): ChildRunStateSummary => {
    const registry = get(sessionRegistryAtom);
    const summary: ChildRunStateSummary = {
      running: 0, waiting: 0, review: 0, idle: 0, done: 0, total: 0,
    };

    for (const [_id, meta] of registry) {
      if (meta.parentSessionId !== sessionId) continue;
      summary.total++;

      const isProcessing = get(sessionProcessingAtom(meta.id));
      const hasPendingPrompt = get(sessionHasPendingInteractivePromptAtom(meta.id));

      if (isProcessing) {
        summary.running++;
      } else if (hasPendingPrompt) {
        summary.waiting++;
      } else if (meta.isArchived) {
        summary.done++;
      } else if (meta.uncommittedCount > 0) {
        summary.review++;
      } else {
        summary.idle++;
      }
    }

    return summary;
  })
);

// ============================================================
// Action Atoms
// ============================================================

/** Set the phase of a session (writes to metadata JSONB via IPC) */
export const setSessionPhaseAtom = atom(
  null,
  async (get, set, payload: { sessionId: string; phase: SessionPhase | null }) => {
    const { sessionId, phase } = payload;

    // Optimistic update in registry
    const registry = new Map(get(sessionRegistryAtom));
    const meta = registry.get(sessionId);
    if (meta) {
      registry.set(sessionId, { ...meta, phase: phase ?? undefined });
      set(sessionRegistryAtom, registry);
    }

    // Persist to database via existing IPC handler
    try {
      await window.electronAPI.invoke('sessions:update-session-metadata', sessionId, { phase: phase ?? null });
    } catch (error) {
      console.error('[sessionKanban] Failed to set phase:', error);
      // Revert optimistic update on failure
      if (meta) {
        const revertRegistry = new Map(get(sessionRegistryAtom));
        revertRegistry.set(sessionId, meta);
        set(sessionRegistryAtom, revertRegistry);
      }
    }
  }
);

/** Set tags on a session (writes to metadata JSONB via IPC) */
export const setSessionTagsAtom = atom(
  null,
  async (get, set, payload: { sessionId: string; tags: string[] }) => {
    const { sessionId, tags } = payload;

    // Optimistic update in registry
    const registry = new Map(get(sessionRegistryAtom));
    const meta = registry.get(sessionId);
    if (meta) {
      registry.set(sessionId, { ...meta, tags });
      set(sessionRegistryAtom, registry);
    }

    // Persist to database
    try {
      await window.electronAPI.invoke('sessions:update-session-metadata', sessionId, { tags });
    } catch (error) {
      console.error('[sessionKanban] Failed to set tags:', error);
      if (meta) {
        const revertRegistry = new Map(get(sessionRegistryAtom));
        revertRegistry.set(sessionId, meta);
        set(sessionRegistryAtom, revertRegistry);
      }
    }
  }
);

// ============================================================
// Column Agent Config Persistence
// ============================================================

let currentKanbanWorkspacePath: string | null = null;
let kanbanColumnConfigPersistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize session kanban column agent config mapping from workspace state.
 * Call this when workspace path is known.
 */
export async function initSessionKanbanLayout(workspacePath: string): Promise<void> {
  currentKanbanWorkspacePath = workspacePath;

  try {
    const workspaceState = await window.electronAPI.invoke('workspace:get-state', workspacePath);
    const saved = workspaceState?.sessionKanbanColumnAgentConfigs;

    if (saved && typeof saved === 'object') {
      const existing = store.get(sessionKanbanFilterAtom);
      const merged = { ...existing, columnAgentConfigs: { ...DEFAULT_COLUMN_AGENT_CONFIGS, ...saved } };
      store.set(sessionKanbanFilterAtom, merged);
    }
  } catch (err) {
    console.error('[sessionKanban] Failed to load column agent configs:', err);
  }
}

function scheduleColumnConfigPersist(workspacePath: string, configs: Record<SessionPhaseKey, string | null>): void {
  if (kanbanColumnConfigPersistTimer) clearTimeout(kanbanColumnConfigPersistTimer);
  kanbanColumnConfigPersistTimer = setTimeout(async () => {
    try {
      await window.electronAPI.invoke('workspace:update-state', workspacePath, {
        sessionKanbanColumnAgentConfigs: configs,
      });
    } catch (err) {
      console.error('[sessionKanban] Failed to persist column agent configs:', err);
    }
  }, 300);
}

/**
 * Set column agent config mappings and persist them.
 * @param partialMap - Partial Record<SessionPhaseKey, string | null> to merge in
 */
export const setColumnAgentConfigsAtom = atom(
  null,
  (get, set, partialMap: Partial<Record<SessionPhaseKey, string | null>>) => {
    const current = get(sessionKanbanFilterAtom);
    const next = {
      ...current,
      columnAgentConfigs: { ...current.columnAgentConfigs, ...partialMap },
    };
    set(sessionKanbanFilterAtom, next);

    if (currentKanbanWorkspacePath) {
      scheduleColumnConfigPersist(currentKanbanWorkspacePath, next.columnAgentConfigs);
    }
  }
);
