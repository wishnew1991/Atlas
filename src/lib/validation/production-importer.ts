/**
 * Production Conversation Import Tool
 * Imports anonymized production conversations and converts them to behavioral datasets
 */

import fs from 'fs';
import type { ConversationDataset, ConversationTurn } from './types';

export interface ProductionConversation {
  id: string;
  userId: string;
  timestamp: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  metadata?: {
    sessionId?: string;
    capabilities?: string[];
    toolCalls?: string[];
    errors?: string[];
  };
}

export interface SanitizationConfig {
  removePII: boolean;
  removeEmails: boolean;
  removePhoneNumbers: boolean;
  removeAddresses: boolean;
  removeCreditCards: boolean;
  customPatterns?: Array<{
    name: string;
    pattern: RegExp;
    replacement: string;
  }>;
}

export interface ImportOptions {
  datasetId: string;
  datasetName: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: 'basic' | 'intermediate' | 'advanced';
  author: string;
  reason: string;
}

export class ProductionConversationImporter {
  private sanitizationConfig: SanitizationConfig;

  constructor(config: Partial<SanitizationConfig> = {}) {
    this.sanitizationConfig = {
      removePII: config.removePII ?? true,
      removeEmails: config.removeEmails ?? true,
      removePhoneNumbers: config.removePhoneNumbers ?? true,
      removeAddresses: config.removeAddresses ?? true,
      removeCreditCards: config.removeCreditCards ?? true,
      customPatterns: config.customPatterns || [],
    };
  }

  /**
   * Sanitize a conversation by removing sensitive information
   */
  sanitizeConversation(conversation: ProductionConversation): ProductionConversation {
    const sanitized = JSON.parse(JSON.stringify(conversation));

    for (const message of sanitized.messages) {
      message.content = this.sanitizeText(message.content);
    }

    return sanitized;
  }

  /**
   * Sanitize text by removing sensitive information
   */
  private sanitizeText(text: string): string {
    let sanitized = text;

    if (this.sanitizationConfig.removeEmails) {
      sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    }

    if (this.sanitizationConfig.removePhoneNumbers) {
      sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
      sanitized = sanitized.replace(/\+\d{1,3}[-.]?\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    }

    if (this.sanitizationConfig.removeCreditCards) {
      sanitized = sanitized.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[CREDIT_CARD]');
    }

    if (this.sanitizationConfig.removeAddresses) {
      // Simple address pattern - can be enhanced
      sanitized = sanitized.replace(/\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl)\b/gi, '[ADDRESS]');
    }

    if (this.sanitizationConfig.removePII) {
      // Common PII patterns
      sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'); // SSN
      sanitized = sanitized.replace(/\b[A-Z]{2}\d{9}\b/g, '[PASSPORT]'); // Passport
    }

    // Custom patterns
    for (const custom of this.sanitizationConfig.customPatterns || []) {
      sanitized = sanitized.replace(custom.pattern, custom.replacement);
    }

    return sanitized;
  }

  /**
   * Convert production conversation to conversation dataset
   */
  convertToDataset(
    conversation: ProductionConversation,
    options: ImportOptions
  ): ConversationDataset {
    const turns: ConversationTurn[] = [];

    for (const message of conversation.messages) {
      if (message.role === 'user') {
        turns.push({
          type: 'user',
          message: message.content,
        });
      }
      // Assistant messages are not included in datasets
      // as they are the expected responses
    }

    return {
      id: options.datasetId,
      name: options.datasetName,
      description: options.description,
      category: options.category as any,
      tags: options.tags,
      turns,
      metadata: {
        author: options.author,
        createdAt: new Date().toISOString(),
        version: '1.0',
        difficulty: options.difficulty,
        estimatedDuration: conversation.messages.length * 10, // Estimate 10s per turn
        requiresCapabilities: conversation.metadata?.capabilities || [],
        requiresMcpServers: [],
      },
    };
  }

  /**
   * Import a single production conversation
   */
  async importConversation(
    conversation: ProductionConversation,
    options: ImportOptions
  ): Promise<ConversationDataset> {
    console.log(`Importing conversation: ${conversation.id}`);
    console.log(`Original messages: ${conversation.messages.length}`);

    // Sanitize
    const sanitized = this.sanitizeConversation(conversation);
    console.log(`Sanitized conversation`);

    // Convert
    const dataset = this.convertToDataset(sanitized, options);
    console.log(`Converted to dataset: ${dataset.id}`);

    return dataset;
  }

  /**
   * Import multiple production conversations
   */
  async importConversations(
    conversations: ProductionConversation[],
    options: ImportOptions
  ): Promise<ConversationDataset[]> {
    const datasets: ConversationDataset[] = [];

    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      const datasetOptions = {
        ...options,
        datasetId: `${options.datasetId}_${i}`,
        datasetName: `${options.datasetName} ${i + 1}`,
      };

      try {
        const dataset = await this.importConversation(conversation, datasetOptions);
        datasets.push(dataset);
      } catch (error) {
        console.error(`Failed to import conversation ${conversation.id}:`, error);
      }
    }

    return datasets;
  }

  /**
   * Generate review report for imported conversations
   */
  generateReviewReport(
    conversations: ProductionConversation[],
    datasets: ConversationDataset[]
  ): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('PRODUCTION CONVERSATION IMPORT REVIEW');
    lines.push('='.repeat(80));
    lines.push('');

    lines.push(`Total Conversations: ${conversations.length}`);
    lines.push(`Successfully Imported: ${datasets.length}`);
    lines.push(`Failed: ${conversations.length - datasets.length}`);
    lines.push('');

    lines.push('-'.repeat(80));
    lines.push('CONVERSATION DETAILS');
    lines.push('-'.repeat(80));
    lines.push('');

    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      const dataset = datasets[i];

      lines.push(`Conversation ${i + 1}: ${conversation.id}`);
      lines.push(`  User ID: ${conversation.userId}`);
      lines.push(`  Timestamp: ${conversation.timestamp}`);
      lines.push(`  Messages: ${conversation.messages.length}`);
      lines.push(`  Dataset ID: ${dataset?.id || 'FAILED'}`);
      lines.push(`  Dataset Name: ${dataset?.name || 'FAILED'}`);
      lines.push(`  Turns: ${dataset?.turns.length || 0}`);
      lines.push('');
    }

    lines.push('-'.repeat(80));
    lines.push('SANITIZATION SUMMARY');
    lines.push('-'.repeat(80));
    lines.push('');
    lines.push(`PII Removal: ${this.sanitizationConfig.removePII ? 'Enabled' : 'Disabled'}`);
    lines.push(`Email Removal: ${this.sanitizationConfig.removeEmails ? 'Enabled' : 'Disabled'}`);
    lines.push(`Phone Removal: ${this.sanitizationConfig.removePhoneNumbers ? 'Enabled' : 'Disabled'}`);
    lines.push(`Address Removal: ${this.sanitizationConfig.removeAddresses ? 'Enabled' : 'Disabled'}`);
    lines.push(`Credit Card Removal: ${this.sanitizationConfig.removeCreditCards ? 'Enabled' : 'Disabled'}`);
    lines.push('');

    lines.push('='.repeat(80));
    lines.push('REVIEW REQUIRED');
    lines.push('='.repeat(80));
    lines.push('');
    lines.push('Please review the imported datasets and:');
    lines.push('1. Verify sanitization was effective');
    lines.push('2. Check conversation turns are accurate');
    lines.push('3. Ensure metadata is correct');
    lines.push('4. Add appropriate expectations for testing');
    lines.push('5. Approve or reject each dataset');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Add expectations to a dataset
   */
  addExpectations(
    dataset: ConversationDataset,
    expectations: Array<{
      turnNumber: number;
      capability?: string;
      tool?: string;
      approval?: boolean;
      contains?: string;
    }>
  ): ConversationDataset {
    const turns = [...dataset.turns];
    let userTurnCount = 0;

    for (let i = 0; i < turns.length; i++) {
      if (turns[i].type === 'user') {
        userTurnCount++;
        const expectation = expectations.find(e => e.turnNumber === userTurnCount);
        
        if (expectation) {
          // Insert expectation after user turn
          turns.splice(i + 1, 0, {
            type: 'expect',
            ...expectation,
          });
        }
      }
    }

    return {
      ...dataset,
      turns,
    };
  }

  /**
   * Export dataset to file
   */
  exportDataset(dataset: ConversationDataset, outputPath: string): void {
    fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2));
    console.log(`Exported dataset to: ${outputPath}`);
  }

  /**
   * Import dataset from file
   */
  importDatasetFromFile(inputPath: string): ConversationDataset {
    const content = fs.readFileSync(inputPath, 'utf-8');
    return JSON.parse(content);
  }
}