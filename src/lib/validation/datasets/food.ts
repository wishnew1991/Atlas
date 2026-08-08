/**
 * Food Conversation Datasets
 * Real-world conversation scenarios for food ordering validation
 */

import { createDataset } from '../dataset-schema';
import type { ConversationDataset } from '../types';

export const foodDatasets: ConversationDataset[] = [
  createDataset({
    id: 'food_basic_biryani',
    name: 'Basic Biryani Order',
    description: 'Simple food ordering conversation - user wants biryani',
    category: 'food',
    tags: ['basic', 'food', 'biriyani'],
    turns: [
      {
        type: 'user',
        message: "I'm hungry",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "Show Indian restaurants",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The second one",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
      },
      {
        type: 'user',
        message: "Add chicken biryani",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "Checkout",
      },
      {
        type: 'expect',
        approval: true,
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'basic',
      estimatedDuration: 120,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'food_multi_item',
    name: 'Multi-Item Food Order',
    description: 'Ordering multiple items with quantity modifications',
    category: 'food',
    tags: ['intermediate', 'food', 'multiple-items'],
    turns: [
      {
        type: 'user',
        message: "I want to order food",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "Show me some restaurants",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The first one looks good",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
      },
      {
        type: 'user',
        message: "Add butter chicken",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "Add two biryanis",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "Change biryani quantity to one",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "Show my cart",
      },
      {
        type: 'expect',
        tool: 'get_food_cart',
      },
      {
        type: 'user',
        message: "Checkout",
      },
      {
        type: 'expect',
        approval: true,
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 180,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'food_restaurant_search',
    name: 'Restaurant Search and Selection',
    description: 'Searching for restaurants with specific criteria',
    category: 'food',
    tags: ['basic', 'food', 'search'],
    turns: [
      {
        type: 'user',
        message: "I want some good food",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "Show me highly rated restaurants",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "Show me options under 300 rupees",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The third one looks good",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00',
      version: '1.0',
      difficulty: 'basic',
      estimatedDuration: 90,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'food_preference_remembered',
    name: 'Food Preference Remembered',
    description: 'Atlas should remember food preferences from context',
    category: 'food',
    tags: ['advanced', 'food', 'memory'],
    turns: [
      {
        type: 'user',
        message: "I like spicy food",
      },
      {
        type: 'expect',
        memoryStorage: true,
      },
      {
        type: 'user',
        message: "Show me restaurants",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The first one, spicy options only",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
      },
      {
        type: 'user',
        message: "Add spicy chicken",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'advanced',
      estimatedDuration: 150,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'food_reference_resolution',
    name: 'Reference Resolution in Food Ordering',
    description: 'Atlas should resolve references like "the second one" correctly',
    category: 'food',
    tags: ['intermediate', 'food', 'references'],
    turns: [
      {
        type: 'user',
        message: "I'm hungry",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "Show me restaurants",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The second one",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
        referenceResolution: true,
      },
      {
        type: 'user',
        message: "Add the butter chicken",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "The biryani instead",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
        referenceResolution: true,
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 180,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'food_approval_flow',
    name: 'Complete Food Approval Flow',
    description: 'Full approval flow from cart to payment',
    category: 'food',
    tags: ['intermediate', 'food', 'approval'],
    turns: [
      {
        type: 'user',
        message: "I want to order food",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "Show me restaurants",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The first one",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
      },
      {
        type: 'user',
        message: "Add chicken biryani",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "Checkout",
      },
      {
        type: 'expect',
        approval: true,
      },
      {
        type: 'user',
        message: "Confirm the payment",
      },
      {
        type: 'expect',
        status: 'completed',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 300,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),
];