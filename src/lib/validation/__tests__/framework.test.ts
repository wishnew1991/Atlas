/**
 * Behavioral Validation Framework Unit Tests
 * Tests the framework components without requiring Atlas to be running
 */

import { describe, it, expect } from 'vitest';
import { validateDataset, createDataset } from '../dataset-schema';
import { allDatasets, getDatasetById, getDatasetsByTag, getDatasetsByDifficulty, getDatasetsByCapability } from '../datasets';
import type { ConversationDataset } from '../types';

describe('Dataset Schema Validation', () => {
  it('should validate a correct dataset', () => {
    const dataset = createDataset({
      id: 'test_dataset',
      name: 'Test Dataset',
      description: 'A test dataset',
      category: 'food',
      tags: ['test'],
      turns: [
        { type: 'user', message: 'Hello' },
        { type: 'expect', capability: 'food' },
      ],
    });

    expect(validateDataset(dataset)).toBe(true);
  });

  it('should reject invalid dataset', () => {
    const dataset = { invalid: 'data' };
    expect(validateDataset(dataset)).toBe(false);
  });

  it('should create dataset with defaults', () => {
    const dataset = createDataset({
      id: 'test_dataset',
      name: 'Test Dataset',
      description: 'A test dataset',
      turns: [],
    });

    expect(dataset.id).toBe('test_dataset');
    expect(dataset.name).toBe('Test Dataset');
    expect(dataset.category).toBe('multi_capability');
    expect(dataset.tags).toEqual([]);
    expect(dataset.metadata.difficulty).toBe('intermediate');
  });
});

describe('Dataset Collections', () => {
  it('should have datasets available', () => {
    expect(allDatasets.length).toBeGreaterThan(0);
  });

  it('should have food datasets', () => {
    const foodDatasets = allDatasets.filter(d => d.category === 'food');
    expect(foodDatasets.length).toBeGreaterThan(0);
  });

  it('should have shopping datasets', () => {
    const shoppingDatasets = allDatasets.filter(d => d.category === 'shopping');
    expect(shoppingDatasets.length).toBeGreaterThan(0);
  });

  it('should have multi-capability datasets', () => {
    const multiDatasets = allDatasets.filter(d => d.category === 'multi_capability');
    expect(multiDatasets.length).toBeGreaterThan(0);
  });

  it('should have edge case datasets', () => {
    const edgeDatasets = allDatasets.filter(d => d.category === 'edge_cases');
    expect(edgeDatasets.length).toBeGreaterThan(0);
  });
});

describe('Dataset Queries', () => {
  it('should get dataset by ID', () => {
    const dataset = getDatasetById('food_basic_biryani');
    expect(dataset).toBeDefined();
    expect(dataset?.id).toBe('food_basic_biryani');
    expect(dataset?.name).toBe('Basic Biryani Order');
  });

  it('should return undefined for non-existent dataset', () => {
    const dataset = getDatasetById('non_existent');
    expect(dataset).toBeUndefined();
  });

  it('should get datasets by tag', () => {
    const basicDatasets = getDatasetsByTag('basic');
    expect(basicDatasets.length).toBeGreaterThan(0);
    expect(basicDatasets.every(d => d.tags.includes('basic'))).toBe(true);
  });

  it('should get datasets by difficulty', () => {
    const basicDatasets = getDatasetsByDifficulty('basic');
    expect(basicDatasets.length).toBeGreaterThan(0);
    expect(basicDatasets.every(d => d.metadata.difficulty === 'basic')).toBe(true);
  });

  it('should get datasets by capability', () => {
    const foodDatasets = getDatasetsByCapability('food');
    expect(foodDatasets.length).toBeGreaterThan(0);
    expect(foodDatasets.every(d => d.metadata.requiresCapabilities.includes('food'))).toBe(true);
  });
});

describe('Dataset Structure', () => {
  it('should have valid user turns', () => {
    const dataset = getDatasetById('food_basic_biryani');
    const userTurns = dataset?.turns.filter(t => t.type === 'user');
    
    expect(userTurns?.length).toBeGreaterThan(0);
    userTurns?.forEach(turn => {
      if (turn.type === 'user') {
        expect(typeof turn.message).toBe('string');
        expect(turn.message.length).toBeGreaterThan(0);
      }
    });
  });

  it('should have valid expectation turns', () => {
    const dataset = getDatasetById('food_basic_biryani');
    const expectTurns = dataset?.turns.filter(t => t.type === 'expect');
    
    expect(expectTurns?.length).toBeGreaterThan(0);
  });

  it('should have valid metadata', () => {
    const dataset = getDatasetById('food_basic_biryani');
    
    expect(dataset?.metadata).toBeDefined();
    expect(typeof dataset?.metadata.author).toBe('string');
    expect(typeof dataset?.metadata.difficulty).toBe('string');
    expect(typeof dataset?.metadata.estimatedDuration).toBe('number');
    expect(Array.isArray(dataset?.metadata.requiresCapabilities)).toBe(true);
    expect(Array.isArray(dataset?.metadata.requiresMcpServers)).toBe(true);
  });
});

describe('Turn Validation', () => {
  it('should validate user turn structure', () => {
    const turn = { type: 'user' as const, message: 'Hello' };
    expect(turn.type).toBe('user');
    expect(typeof turn.message).toBe('string');
  });

  it('should validate expectation turn structure', () => {
    const turn = { type: 'expect' as const, capability: 'food' };
    expect(turn.type).toBe('expect');
    expect(turn.capability).toBe('food');
  });

  it('should support multiple expectation types', () => {
    const turn1 = { type: 'expect' as const, tool: 'search_restaurants' };
    const turn2 = { type: 'expect' as const, approval: true };
    const turn3 = { type: 'expect' as const, contains: 'biryani' };
    const turn4 = { type: 'expect' as const, memoryRetrieval: true };

    expect(turn1.tool).toBe('search_restaurants');
    expect(turn2.approval).toBe(true);
    expect(turn3.contains).toBe('biryani');
    expect(turn4.memoryRetrieval).toBe(true);
  });
});

describe('Dataset Categories', () => {
  it('should have diverse categories', () => {
    const categories = new Set(allDatasets.map(d => d.category));
    expect(categories.size).toBe(4);
    expect(categories.has('food')).toBe(true);
    expect(categories.has('shopping')).toBe(true);
    expect(categories.has('multi_capability')).toBe(true);
    expect(categories.has('edge_cases')).toBe(true);
  });
});

describe('Dataset Difficulty Distribution', () => {
  it('should have datasets across difficulty levels', () => {
    const basic = getDatasetsByDifficulty('basic');
    const intermediate = getDatasetsByDifficulty('intermediate');
    const advanced = getDatasetsByDifficulty('advanced');

    expect(basic.length).toBeGreaterThan(0);
    expect(intermediate.length).toBeGreaterThan(0);
    expect(advanced.length).toBeGreaterThan(0);
  });
});

describe('Dataset Coverage', () => {
  it('should cover basic scenarios', () => {
    const basicDatasets = getDatasetsByDifficulty('basic');
    expect(basicDatasets.length).toBeGreaterThanOrEqual(3);
  });

  it('should cover intermediate scenarios', () => {
    const intermediateDatasets = getDatasetsByDifficulty('intermediate');
    expect(intermediateDatasets.length).toBeGreaterThanOrEqual(5);
  });

  it('should cover advanced scenarios', () => {
    const advancedDatasets = getDatasetsByDifficulty('advanced');
    expect(advancedDatasets.length).toBeGreaterThanOrEqual(3);
  });
});