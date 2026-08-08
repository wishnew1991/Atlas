/**
 * Conversation Datasets Index
 * Exports all conversation datasets
 */

import { foodDatasets } from './food';
import { shoppingDatasets } from './shopping';
import { multiCapabilityDatasets } from './multi-capability';
import { edgeCaseDatasets } from './edge-cases';
import type { ConversationDataset } from '../types';

export const allDatasets: ConversationDataset[] = [
  ...foodDatasets,
  ...shoppingDatasets,
  ...multiCapabilityDatasets,
  ...edgeCaseDatasets,
];

export const datasetsByCategory = {
  food: foodDatasets,
  shopping: shoppingDatasets,
  multi_capability: multiCapabilityDatasets,
  edge_cases: edgeCaseDatasets,
};

export function getDatasetById(id: string): ConversationDataset | undefined {
  return allDatasets.find(dataset => dataset.id === id);
}

export function getDatasetsByTag(tag: string): ConversationDataset[] {
  return allDatasets.filter(dataset => dataset.tags.includes(tag));
}

export function getDatasetsByDifficulty(difficulty: 'basic' | 'intermediate' | 'advanced'): ConversationDataset[] {
  return allDatasets.filter(dataset => dataset.metadata.difficulty === difficulty);
}

export function getDatasetsByCapability(capability: string): ConversationDataset[] {
  return allDatasets.filter(dataset => 
    dataset.metadata.requiresCapabilities.includes(capability)
  );
}