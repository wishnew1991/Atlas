import { NextResponse } from "next/server";
import { ADMIN_GUIDE_MARKDOWN as guideContent } from "@/lib/atlas/admin-guide";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { chat, type LlmMessage, type LlmTool } from "@/lib/atlas/llm";
import { resolveActiveModel } from "@/lib/atlas/server/agent/reply";
import { prisma } from "@/lib/atlas/server/prisma";
import { encryptSecret } from "@/lib/security/secrets";
import { upsertMcpServer, deleteMcpServer, readVoiceConfig, writeVoiceConfig } from "@/lib/atlas/server/model-registry";
import { invalidateToolCache } from "@/lib/atlas/mcp/registry";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const getAdminSystemPrompt = () => {
  let guideContext = guideContent;

  return `You are the Atlas Admin Co-Pilot. You help the system administrator manage the Atlas application.
You can read the current system configuration, add or remove MCP servers, configure connectors, register skills, setup LLM providers, and configure Voice (STT & TTS) channels.

Here is the full system architecture and settings guide:
---
${guideContext}
---

When you call tools to change the system state, explain what you did clearly. If you successfully complete a task, return a clear, structured explanation.
You can also answer general system admin questions. Keep your tone professional, crisp, and helpful.`;
};

const ADMIN_TOOLS: LlmTool[] = [
  {
    name: "add_mcp_server",
    description: "Install or update an MCP server in the registry.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Optional stable ID for the server." },
        name: { type: "string", description: "Human-readable name of the server." },
        command: { type: "string", description: "Command to execute the server process (e.g. node, python, docker)." },
        args: { type: "string", description: "Arguments passed to the command, newline-separated or JSON array." },
        env: { type: "string", description: "Environment variables, format KEY=VALUE, newline-separated." },
        url: { type: "string", description: "Optional remote HTTP/SSE URL of the MCP server." },
        token: { type: "string", description: "Optional authorization token for HTTP/SSE." },
        domain: { type: "string", description: "Default domain category for this server (e.g., shopping, travel)." }
      },
      required: ["name"]
    }
  },
  {
    name: "delete_mcp_server",
    description: "Delete an MCP server from the registry.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The unique ID of the MCP server to delete." }
      },
      required: ["id"]
    }
  },
  {
    name: "add_connector",
    description: "Add or update a connector integration definition.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique connector ID (e.g., swiggy, zomato, jira)." },
        name: { type: "string", description: "Human-readable name (e.g., Swiggy, Zomato, Jira)." },
        transport: { type: "string", enum: ["mcp", "browser", "rest", "sdk"], description: "Primary transport mechanism." },
        description: { type: "string", description: "Brief description of the connector." }
      },
      required: ["id", "name", "transport"]
    }
  },
  {
    name: "delete_connector",
    description: "Remove a connector integration from the registry.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique connector ID." }
      },
      required: ["id"]
    }
  },
  {
    name: "install_skill",
    description: "Install a new skill/capability definition for the agent.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the skill." },
        category: { type: "string", description: "Category (e.g., action, communication, knowledge)." },
        capabilityId: { type: "string", description: "Associated capability category (e.g. food, shopping)." },
        connectorId: { type: "string", description: "Optional connector association." },
        description: { type: "string", description: "What this skill does." }
      },
      required: ["name", "capabilityId"]
    }
  },
  {
    name: "configure_llm_provider",
    description: "Connect or update an AI LLM Provider with its API key.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["openai", "anthropic", "google", "nvidia", "custom"], description: "The provider name." },
        label: { type: "string", description: "Label for this provider configuration." },
        apiKey: { type: "string", description: "Secret API key." },
        baseUrl: { type: "string", description: "Optional base API URL." }
      },
      required: ["provider", "apiKey"]
    }
  },
  {
    name: "get_admin_status",
    description: "Fetch the current system configurations, installed MCP servers, registered connectors/integrations, capabilities, LLM providers, and voice/audio settings.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "configure_voice_settings",
    description: "Update voice settings (STT and TTS) in the system configuration.",
    parameters: {
      type: "object",
      properties: {
        sttLanguage: { type: "string", description: "Default transcription language (e.g. en-US, es-ES)." },
        ttsVoiceURI: { type: "string", description: "Stable TTS voice URI identifier (e.g. en_US-lessac-medium)." },
        ttsRate: { type: "number", description: "Speech rate, typically between 0.5 and 2.0 (e.g., 1.0)." },
        ttsPitch: { type: "number", description: "Speech pitch multiplier (e.g., 1.0)." },
        sttModelId: { type: "string", description: "STT model identifier (e.g., whisper, deepgram, native)." },
        ttsModelId: { type: "string", description: "TTS model identifier (e.g., local:piper, openai)." },
        sttMode: { type: "string", enum: ["manual", "auto", "streaming"], description: "Transcription trigger mode." },
        ttsMode: { type: "string", enum: ["none", "auto", "manual"], description: "Speech synthesis trigger mode." },
        dailyVoiceLimitMinutes: { type: "number", description: "Daily limit of voice output in minutes per user." }
      }
    }
  }
];

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const { message, history } = payload;
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  // Resolve the active model for the admin domain (falls back to default/general)
  const activeModel = await resolveActiveModel("admin");
  if (!activeModel) {
    return NextResponse.json({ error: "No active LLM model is configured for general administrative use." }, { status: 500 });
  }

  // Map history to LlmMessages
  const llmMessages: LlmMessage[] = [
    { role: "system", content: getAdminSystemPrompt() },
    ...(history || []).map((h: any) => ({
      role: h.role === "assistant" ? "assistant" as const : "user" as const,
      content: h.text || h.content || ""
    })),
    { role: "user", content: message }
  ];

  try {
    let loop = true;
    let rounds = 0;
    let lastReply = "";
    let lastCard: any = null;

    while (loop && rounds < 5) {
      rounds++;
      const result = await chat({
        provider: activeModel.provider,
        apiKey: activeModel.apiKey,
        baseUrl: activeModel.baseUrl ?? undefined,
        model: activeModel.id,
        messages: llmMessages,
        tools: ADMIN_TOOLS
      });

      lastReply = result.content || "";

      if (result.toolCalls && result.toolCalls.length > 0) {
        // Append assistant's tool call turn to messages
        llmMessages.push({
          role: "assistant",
          content: lastReply,
          tool_calls: result.toolCalls
        });

        // Execute tool calls
        for (const toolCall of result.toolCalls) {
          const { name } = toolCall;
          let args: any = {};
          try {
            args = JSON.parse(toolCall.arguments || "{}");
          } catch {
            /* leave empty args */
          }
          let toolOutput = "";

          try {
            if (name === "add_mcp_server") {
              const approvalId = `admin-add-mcp-${Date.now()}`;
              await prisma.approval.create({
                data: {
                  id: approvalId,
                  domain: "admin",
                  title: `Add MCP Server: ${args.name}`,
                  summary: `Add MCP server with command: ${args.command || ""} and args: ${args.args || ""}`,
                  fields: JSON.stringify({ action: "add_mcp_server", args }),
                  risk: "medium",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              });
              toolOutput = `[MEDIUM SEVERITY ACTION] Created a pending configuration approval request. System registrations must be authorized. Verify configuration in the Action Approvals tab.`;
              lastCard = {
                type: "mcp_installed",
                serverName: args.name,
                status: "pending",
                serverId: approvalId
              };
            } else if (name === "delete_mcp_server") {
              const approvalId = `admin-delete-mcp-${Date.now()}`;
              await prisma.approval.create({
                data: {
                  id: approvalId,
                  domain: "admin",
                  title: `Delete MCP Server: ${args.id}`,
                  summary: `Remove MCP server registry entry with ID ${args.id}`,
                  fields: JSON.stringify({ action: "delete_mcp_server", args }),
                  risk: "high",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              });
              toolOutput = `[⚠️ HIGH SEVERITY ACTION WARNING] Deleting an active MCP server will instantly break all associated agent skills and capabilities. This action requires explicit manual authorization. Approval request has been queued.`;
              lastCard = {
                type: "mcp_deleted",
                status: "pending",
                serverId: approvalId
              };
            } else if (name === "add_connector") {
              const approvalId = `admin-add-connector-${Date.now()}`;
              await prisma.approval.create({
                data: {
                  id: approvalId,
                  domain: "admin",
                  title: `Add Connector: ${args.name}`,
                  summary: `Register connector integration definition with ID ${args.id} and transport: ${args.transport}`,
                  fields: JSON.stringify({ action: "add_connector", args }),
                  risk: "medium",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              });
              toolOutput = `[MEDIUM SEVERITY ACTION] Queued a pending registration request for connector integration. Approve to expose these network hooks.`;
              lastCard = {
                type: "connector_added",
                connectorName: args.name,
                transport: args.transport,
                status: "pending",
                approvalId
              };
            } else if (name === "delete_connector") {
              const approvalId = `admin-delete-connector-${Date.now()}`;
              await prisma.approval.create({
                data: {
                  id: approvalId,
                  domain: "admin",
                  title: `Delete Connector: ${args.id}`,
                  summary: `Remove connector integration definition with ID ${args.id}`,
                  fields: JSON.stringify({ action: "delete_connector", args }),
                  risk: "high",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              });
              toolOutput = `[⚠️ HIGH SEVERITY ACTION WARNING] Removing a connector is highly destructive and blocks all downstream pipeline routes. Action queued for strict confirmation in the Approvals queue.`;
              lastCard = {
                type: "connector_deleted",
                status: "pending",
                approvalId
              };
            } else if (name === "install_skill") {
              const approvalId = `admin-install-skill-${Date.now()}`;
              await prisma.approval.create({
                data: {
                  id: approvalId,
                  domain: "admin",
                  title: `Install Skill: ${args.name}`,
                  summary: `Register new capability/skill definition for category ${args.capabilityId}`,
                  fields: JSON.stringify({ action: "install_skill", args }),
                  risk: "medium",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              });
              toolOutput = `[MEDIUM SEVERITY ACTION] Skill installation requested. Exposes capabilities to user requests. Approval queued.`;
              lastCard = {
                type: "skill_installed",
                skillName: args.name,
                category: args.category || "action",
                status: "pending",
                approvalId
              };
            } else if (name === "configure_llm_provider") {
              const approvalId = `admin-config-provider-${Date.now()}`;
              await prisma.approval.create({
                data: {
                  id: approvalId,
                  domain: "admin",
                  title: `Configure Provider: ${args.provider}`,
                  summary: `Update API key credentials and parameters for provider ${args.provider}`,
                  fields: JSON.stringify({ action: "configure_llm_provider", args }),
                  risk: "high",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              });
              toolOutput = `[⚠️ HIGH SEVERITY ACTION WARNING] Storing new API credentials alters the system's routing security. Key values will be encrypted at rest on approval. Queued for authorization.`;
              lastCard = {
                type: "provider_connected",
                provider: args.provider,
                status: "pending",
                approvalId
              };
            } else if (name === "get_admin_status") {
              const [mcpServers, connectors, skills, credentials, routingRules, voice] = await Promise.all([
                prisma.mcpServer.findMany(),
                prisma.integration.findMany(),
                prisma.skill.findMany(),
                prisma.credential.findMany({
                  select: { id: true, provider: true, label: true, baseUrl: true }
                }),
                prisma.routingRule.findMany(),
                readVoiceConfig()
              ]);

              const statusData = {
                mcpServers: mcpServers.map(s => ({ id: s.id, name: s.name, domain: s.domain, global: s.global })),
                connectors: connectors.map(c => ({ id: c.id, name: c.name, transport: c.transport })),
                skills: skills.map(s => ({ id: s.id, name: s.name, category: s.category, capabilityId: s.capabilityId })),
                providers: credentials.map(c => ({ id: c.id, provider: c.provider, label: c.label, baseUrl: c.baseUrl })),
                routingRules: routingRules.map(r => ({ id: r.id, domain: r.domain, modelId: r.modelId })),
                voiceSettings: voice
              };

              toolOutput = JSON.stringify(statusData);
            } else if (name === "configure_voice_settings") {
              const approvalId = `admin-config-voice-${Date.now()}`;
              await prisma.approval.create({
                data: {
                  id: approvalId,
                  domain: "admin",
                  title: `Configure Voice Settings`,
                  summary: `Update speech translation and text-to-speech parameters in voice config`,
                  fields: JSON.stringify({ action: "configure_voice_settings", args }),
                  risk: "medium",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              });
              toolOutput = `[MEDIUM SEVERITY ACTION] Audio settings modification queued. Affects Speech-to-Text and TTS playback parameters.`;
              lastCard = {
                type: "voice_configured",
                status: "pending",
                approvalId
              };
            }
          } catch (e: any) {
            toolOutput = `Error executing tool: ${e.message}`;
            lastCard = { status: "error", error: e.message };
          }

          // Append tool response
          llmMessages.push({
            role: "user",
            content: `Tool Output: ${toolOutput}`
          });
        }
      } else {
        loop = false;
      }
    }

    return NextResponse.json({
      reply: lastReply,
      card: lastCard
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process chat." }, { status: 500 });
  }
}
