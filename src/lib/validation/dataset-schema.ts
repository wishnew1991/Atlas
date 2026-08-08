/**
 * Conversation Dataset Schemas
 * Defines the structure for conversation datasets
 */

import type { ConversationDataset, ConversationTurn } from './types';

export interface DatasetSchema {
  version: string;
  schema: '1.0';
  datasets: ConversationDataset[];
}

export function validateDataset(dataset: any): dataset is ConversationDataset {
  return (
    dataset &&
    typeof dataset === 'object' &&
    typeof dataset.id === 'string' &&
    typeof dataset.name === 'string' &&
    typeof dataset.description === 'string' &&
    Array.isArray(dataset.turns) &&
    dataset.turns.every((turn: any) => validateTurn(turn))
  );
}

function validateTurn(turn: any): turn is ConversationTurn {
  if (!turn || typeof turn !== 'object') return false;

  if (turn.type === 'user') {
    return typeof turn.message === 'string';
  }

  if (turn.type === 'expect') {
    return (
      typeof turn.capability === 'string' ||
      typeof turn.tool === 'string' ||
      typeof turn.approval === 'boolean' ||
      typeof turn.contains === 'string' ||
      typeof turn.notContains === 'string' ||
      typeof turn.referenceResolution === 'boolean' ||
      typeof turn.memoryRetrieval === 'boolean' ||
      typeof turn.memoryStorage === 'boolean'
    );
  }

  if (turn.type === 'system') {
    return (
      turn.action === 'new_conversation' ||
      turn.action === 'reset_context' ||
      (turn.action === 'simulate_delay' && typeof turn.delay === 'number')
    );
  }

  return false;
}

export function createDataset(template: Partial<ConversationDataset>): ConversationDataset {
  return {
    id: template.id || `dataset_${Date.now()}`,
    name: template.name || 'Untitled Dataset',
    description: template.description || '',
    category: template.category || 'multi_capability',
    tags: template.tags || [],
    turns: template.turns || [],
    metadata: {
      author: template.metadata?.author || 'unknown',
      createdAt: template.metadata?.createdAt || new Date().toISOString(),
      version: template.metadata?.version || '1.0',
      difficulty: template.metadata?.difficulty || 'intermediate',
      estimatedDuration: template.metadata?.estimatedDuration || 60,
      requiresCapabilities: template.metadata?.requiresCapabilities || [],
      requiresMcpServers: template.metadata?.requiresMcpServers || [],
    },
  };
}