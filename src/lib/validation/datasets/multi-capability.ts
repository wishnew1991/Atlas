/**
 * Multi-Capability Conversation Datasets
 * Real-world conversations that span multiple capabilities
 */

import { createDataset } from '../dataset-schema';
import type { ConversationDataset } from '../types';

export const multiCapabilityDatasets: ConversationDataset[] = [
  createDataset({
    id: 'multi_food_then_shopping',
    name: 'Food Then Shopping',
    description: 'User switches from food to shopping in same conversation',
    category: 'multi_capability',
    tags: ['intermediate', 'food', 'shopping', 'context-switch'],
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
        message: "Actually, I need to buy a phone first",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me iPhone options",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "Now back to food",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "The first restaurant from before",
      },
      {
        type: 'expect',
        tool: 'get_restaurant_menu',
        referenceResolution: true,
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 180,
      requiresCapabilities: ['food', 'shopping'],
      requiresMcpServers: ['swiggy-food-mcp-server', 'amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'multi_parallel_tasks',
    name: 'Parallel Tasks',
    description: 'User manages multiple tasks simultaneously',
    category: 'multi_capability',
    tags: ['advanced', 'food', 'shopping', 'parallel'],
    turns: [
      {
        type: 'user',
        message: "I need to order food and buy a phone",
      },
      {
        type: 'expect',
        capability: 'food', // Should prioritize or ask for clarification
      },
      {
        type: 'user',
        message: "Let's start with food",
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
        message: "The first one, add biryani to cart",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "Now about the phone",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me iPhones",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "Add the second one to cart",
      },
      {
        type: 'expect',
        tool: 'add_to_cart',
      },
      {
        type: 'user',
        message: "Complete both orders",
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
      difficulty: 'advanced',
      estimatedDuration: 240,
      requiresCapabilities: ['food', 'shopping'],
      requiresMcpServers: ['swiggy-food-mcp-server', 'amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'multi_complex_workflow',
    name: 'Complex Workflow',
    description: 'Complex workflow with multiple capabilities and context preservation',
    category: 'multi_capability',
    tags: ['advanced', 'food', 'shopping', 'complex'],
    turns: [
      {
        type: 'user',
        message: "I'm planning a party",
      },
      {
        type: 'expect',
        capability: 'food', // Should recognize party planning context
      },
      {
        type: 'user',
        message: "Order food for 10 people",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The first restaurant, add 5 biryanis and 5 butter chickens",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "I also need decorations",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me party decorations",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "Add the balloons and streamers",
      },
      {
        type: 'expect',
        tool: 'add_to_cart',
      },
      {
        type: 'user',
        message: "Complete both orders",
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
      difficulty: 'advanced',
      estimatedDuration: 300,
      requiresCapabilities: ['food', 'shopping'],
      requiresMcpServers: ['swiggy-food-mcp-server', 'amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'multi_context_preservation',
    name: 'Context Preservation Across Capabilities',
    description: 'Preserve context when switching between capabilities',
    category: 'multi_capability',
    tags: ['advanced', 'food', 'shopping', 'context'],
    turns: [
      {
        type: 'user',
        message: "I need to buy groceries",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me vegetables",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "Add onions and tomatoes",
      },
      {
        type: 'expect',
        tool: 'add_to_cart',
      },
      {
        type: 'user',
        message: "I'm also hungry",
      },
      {
        type: 'expect',
        capability: 'food',
      },
      {
        type: 'user',
        message: "Show me restaurants nearby",
      },
      {
        type: 'expect',
        tool: 'search_restaurants',
      },
      {
        type: 'user',
        message: "The first one, order biryani",
      },
      {
        type: 'expect',
        tool: 'update_food_cart',
      },
      {
        type: 'user',
        message: "Complete my grocery order",
      },
      {
        type: 'expect',
        capability: 'shopping',
        tool: 'checkout',
      },
      {
        type: 'user',
        message: "Now complete my food order",
      },
      {
        type: 'expect',
        capability: 'food',
        tool: 'checkout',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'advanced',
      estimatedDuration: 240,
      requiresCapabilities: ['food', 'shopping'],
      requiresMcpServers: ['swiggy-food-mcp-server', 'amazon-shopping-mcp-server'],
    },
  }),
];