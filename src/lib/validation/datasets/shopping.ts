/**
 * Shopping Conversation Datasets
 * Real-world conversation scenarios for shopping validation
 */

import { createDataset } from '../dataset-schema';
import type { ConversationDataset } from '../types';

export const shoppingDatasets: ConversationDataset[] = [
  createDataset({
    id: 'shopping_basic_search',
    name: 'Basic Product Search',
    description: 'Simple product search and selection',
    category: 'shopping',
    tags: ['basic', 'shopping', 'search'],
    turns: [
      {
        type: 'user',
        message: "I need to buy a phone",
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
        message: "The second one",
      },
      {
        type: 'expect',
        tool: 'get_product_details',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'basic',
      estimatedDuration: 90,
      requiresCapabilities: ['shopping'],
      requiresMcpServers: ['amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'shopping_compare_products',
    name: 'Product Comparison',
    description: 'Comparing multiple products before purchase',
    category: 'shopping',
    tags: ['intermediate', 'shopping', 'comparison'],
    turns: [
      {
        type: 'user',
        message: "I want to buy a laptop",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me MacBook options",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "Compare the first two",
      },
      {
        type: 'expect',
        tool: 'compare_products',
      },
      {
        type: 'user',
        message: "The cheaper one",
      },
      {
        type: 'expect',
        tool: 'get_product_details',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 120,
      requiresCapabilities: ['shopping'],
      requiresMcpServers: ['amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'shopping_cart_management',
    name: 'Shopping Cart Management',
    description: 'Adding, removing, and modifying cart items',
    category: 'shopping',
    tags: ['intermediate', 'shopping', 'cart'],
    turns: [
      {
        type: 'user',
        message: "I want to buy some electronics",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me headphones",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "Add the first one to cart",
      },
      {
        type: 'expect',
        tool: 'add_to_cart',
      },
      {
        type: 'user',
        message: "Add two of them",
      },
      {
        type: 'expect',
        tool: 'update_cart_quantity',
      },
      {
        type: 'user',
        message: "Show my cart",
      },
      {
        type: 'expect',
        tool: 'get_cart',
      },
      {
        type: 'user',
        message: "Remove one",
      },
      {
        type: 'expect',
        tool: 'remove_from_cart',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 150,
      requiresCapabilities: ['shopping'],
      requiresMcpServers: ['amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'shopping_purchase_flow',
    name: 'Complete Purchase Flow',
    description: 'Full purchase flow from search to checkout',
    category: 'shopping',
    tags: ['advanced', 'shopping', 'purchase'],
    turns: [
      {
        type: 'user',
        message: "I need a new TV",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me Samsung TVs",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "The 55 inch one",
      },
      {
        type: 'expect',
        tool: 'get_product_details',
      },
      {
        type: 'user',
        message: "Add to cart",
      },
      {
        type: 'expect',
        tool: 'add_to_cart',
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
        status: 'order_placed',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'advanced',
      estimatedDuration: 200,
      requiresCapabilities: ['shopping'],
      requiresMcpServers: ['amazon-shopping-mcp-server'],
    },
  }),

  createDataset({
    id: 'shopping_budget_filter',
    name: 'Budget-Constrained Shopping',
    description: 'Shopping with budget constraints',
    category: 'shopping',
    tags: ['intermediate', 'shopping', 'budget'],
    turns: [
      {
        type: 'user',
        message: "I want to buy a watch under 5000 rupees",
      },
      {
        type: 'expect',
        capability: 'shopping',
      },
      {
        type: 'user',
        message: "Show me options",
      },
      {
        type: 'expect',
        tool: 'search_products',
      },
      {
        type: 'user',
        message: "The third one looks good",
      },
      {
        type: 'expect',
        tool: 'get_product_details',
      },
      {
        type: 'user',
        message: "Add to cart",
      },
      {
        type: 'expect',
        tool: 'add_to_cart',
      },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: '2026-08-04T00:00:00Z',
      version: '1.0',
      difficulty: 'intermediate',
      estimatedDuration: 100,
      requiresCapabilities: ['shopping'],
      requiresMcpServers: ['amazon-shopping-mcp-server'],
    },
  }),
];