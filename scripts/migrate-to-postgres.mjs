#!/usr/bin/env node

/**
 * Migration script from SQLite to PostgreSQL
 * This script handles the transition from SQLite to PostgreSQL with pgvector
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('Starting migration from SQLite to PostgreSQL...');
  
  // Check if SQLite database exists
  const sqlitePath = path.join(process.cwd(), 'dev.db');
  if (!fs.existsSync(sqlitePath)) {
    console.log('No SQLite database found. Skipping data migration.');
    console.log('Creating fresh PostgreSQL schema...');
    return;
  }

  console.log('SQLite database found. Beginning data migration...');
  
  // Note: For production, you would use a proper ETL tool
  // This is a simplified migration script for development
  
  try {
    // Connect to SQLite (old database)
    const { PrismaClient: PrismaSQLite } = require('@prisma/client');
    const sqlite = new PrismaSQLite({
      datasources: {
        db: {
          url: 'file:./dev.db'
        }
      }
    });

    // Connect to PostgreSQL (new database)
    const postgres = new PrismaClient();

    console.log('Migrating data...');
    
    // Migrate users
    const users = await sqlite.atlasUser.findMany();
    console.log(`Found ${users.length} users to migrate`);
    
    for (const user of users) {
      await postgres.atlasUser.upsert({
        where: { clerkId: user.clerkId },
        update: {},
        create: {
          id: user.id,
          clerkId: user.clerkId,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt
        }
      });
    }

    // Migrate conversations
    const conversations = await sqlite.conversation.findMany();
    console.log(`Found ${conversations.length} conversations to migrate`);
    
    for (const conv of conversations) {
      await postgres.conversation.upsert({
        where: { id: conv.id },
        update: {},
        create: {
          id: conv.id,
          userId: conv.userId,
          summary: conv.summary,
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt
        }
      });
    }

    // Migrate messages
    const messages = await sqlite.message.findMany();
    console.log(`Found ${messages.length} messages to migrate`);
    
    for (const msg of messages) {
      await postgres.message.upsert({
        where: { id: msg.id },
        update: {},
        create: {
          id: msg.id,
          conversationId: msg.conversationId,
          role: msg.role,
          content: msg.content,
          meta: msg.meta,
          createdAt: msg.createdAt
        }
      });
    }

    // Migrate approvals
    const approvals = await sqlite.approval.findMany();
    console.log(`Found ${approvals.length} approvals to migrate`);
    
    for (const approval of approvals) {
      await postgres.approval.upsert({
        where: { id: approval.id },
        update: {},
        create: {
          id: approval.id,
          userId: approval.userId,
          domain: approval.domain,
          title: approval.title,
          summary: approval.summary,
          fields: approval.fields,
          status: approval.status,
          reference: approval.reference,
          meta: approval.meta,
          expiresAt: approval.expiresAt,
          createdAt: approval.createdAt,
          completedAt: approval.completedAt
        }
      });
    }

    // Migrate MCP servers
    const mcpServers = await sqlite.mcpServer.findMany();
    console.log(`Found ${mcpServers.length} MCP servers to migrate`);
    
    for (const server of mcpServers) {
      await postgres.mcpServer.upsert({
        where: { id: server.id },
        update: {},
        create: {
          id: server.id,
          name: server.name,
          url: server.url,
          token: server.token,
          command: server.command,
          args: server.args,
          env: server.env,
          domain: server.domain,
          roles: server.roles,
          toolRoles: server.toolRoles,
          global: server.global,
          enabled: server.enabled,
          toolCount: server.toolCount,
          lastError: server.lastError,
          createdAt: server.createdAt,
          updatedAt: server.updatedAt
        }
      });
    }

    // Migrate other key models
    const credentials = await sqlite.credential.findMany();
    console.log(`Found ${credentials.length} credentials to migrate`);
    
    for (const cred of credentials) {
      await postgres.credential.upsert({
        where: { id: cred.id },
        update: {},
        create: {
          id: cred.id,
          label: cred.label,
          provider: cred.provider,
          apiKey: cred.apiKey,
          baseUrl: cred.baseUrl,
          createdAt: cred.createdAt,
          updatedAt: cred.updatedAt
        }
      });
    }

    await sqlite.$disconnect();
    await postgres.$disconnect();
    
    console.log('Migration completed successfully!');
    console.log('Please backup your SQLite database before removing it.');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
