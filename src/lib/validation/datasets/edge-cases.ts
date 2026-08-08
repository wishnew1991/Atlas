/**
 * Edge Case Conversation Datasets
 * Challenging scenarios to test Atlas robustness
 */

import { createDataset } from '../dataset-schema';
import type { ConversationDataset } from '../types';

export const edgeCaseDatasets: ConversationDataset[] = [
  createDataset({
    id: 'edge_ambiguous_intent',
    name: 'Ambiguous Intent',
    description: 'User provides ambiguous intent, should ask for clarification',
    category: 'edge_cases',
    tags: ['basic', 'edge-case', 'ambiguity'],
    turns: [
      {
        type: 'user',
        message: "I want something",
      },
      {
        type: 'expect',
        contains: 'clarify',
      },
      {
        type: 'user',
        message: "I want to order food",
      },
      {
        type: 'expect',
        capability: 'food',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'basic',
      estimatedDuration: 60,
      requiresCapabilities: [],
      requiresMcpServers: [],
    },
  }),

  createDataset({
    id: 'edge_empty_results',
    name: 'Empty Search Results',
    description: 'Handle when search returns no results',
    category: 'edge_cases',
    tags: ['intermediate', 'edge-case', 'empty-results'],
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
        message: "Show me restaurants with xyz name",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'expect',
        contains: 'no results',
      },
      {
        type: 'user',
        message: "Show me all restaurants",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 90,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'edge_invalid_reference',
    name: 'Invalid Reference',
    description: 'User references something that doesnt exist',
    category: 'edge_cases',
    tags: ['intermediate', 'edge-case', 'reference'],
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
        message: "The tenth one",
      },
      {
        type: 'expect',
        contains: 'invalid',
      },
      {
        type: 'user',
        message: "The first one",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 90,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'edge_out_of_stock',
    name: 'Out of Stock Item',
    description: 'Handle when requested item is out of stock',
    category: 'edge_cases',
    tags: ['intermediate', 'edge-case', 'stock'],
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
        message: "Add unavailable item",
      },
      {
        type: 'expect',
        contains: 'unavailable',
      },
      {
        type: 'user',
        message: "Add biryani instead",
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
      difficulty: 'intermediate',
      estimatedDuration: 120,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'edge_rapid_context_switch',
    name: 'Rapid Context Switching',
    description: 'User rapidly switches between contexts',
    category: 'edge_cases',
    tags: ['advanced', 'edge-case', 'context-switch'],
    turns: [
      {
        type: 'user',
        message: "I want food",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "I want to buy a phone",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Back to food",
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
        message: "Actually, shopping",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me phones",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'advanced',
      estimatedDuration: 150,
      requiresCapabilities: ['food', 'shopping'],
      requiresMcpServers: ['swiggy-food-mcp-server', 'amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'edge_empty_cart_checkout',
    name: 'Empty Cart Checkout',
    description: 'User tries to checkout with empty cart',
    category: 'edge_cases',
    tags: ['basic', 'edge-case', 'cart'],
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
        message: "Checkout",
      },
      {
        type: 'expect',
        contains: 'empty',
      },
      {
        type: 'user',
        message: "Add biryani",
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
      estimatedDuration: 90,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'edge_approval_denied',
    name: 'Approval Denied',
    description: 'User denies approval request',
    category: 'edge_cases',
    tags: ['intermediate', 'edge-case', 'approval'],
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
        message: "The first one, add biryani",
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
        message: "Cancel",
      },
      {
        type: 'expect',
        status: 'cancelled',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 120,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),

  createDataset({
    id: 'edge_long_conversation',
    name: 'Long Conversation',
    description: 'Very long conversation to test context retention',
    category: 'edge_cases',
    tags: ['advanced', 'edge-case', 'long-conversation'],
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
        message: "Tell me about the first one",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
      },
      {
        type: 'user',
        message: "What's their rating?",
      },
      {
        type: 'expect',
        contains: 'rating',
      },
      {
        type: 'user',
        message: "What are their popular dishes?",
      },
      {
        type: 'expect',
        contains: 'popular',
      },
      {
        type: 'user',
        message: "What's the delivery time?",
      },
      {
        type: 'expect',
        contains: 'delivery',
      },
      {
        type: 'user',
        message: "Add biryani",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
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
        message: "Add naan",
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
        message: "What's the total?",
      },
      {
        type: 'expect',
        contains: 'total',
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
        message: "Confirm",
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
      difficulty: 'advanced',
      estimatedDuration: 300,
      requiresCapabilities: ['food'],
      requiresMcpServers: ['swiggy-food-mcp-server'],
    },
  }),
];