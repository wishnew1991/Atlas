# Atlas Admin Control Plane Guide

Welcome to the Atlas Admin Control Plane. This guide describes the architecture, sections, configurations, and operations available to system administrators.

---

## 1. LLM Models & Routing

Manage LLM routing, providers, credentials, and custom model registries.

### LLM Providers
- Configure API keys and Base URLs for OpenAI, Anthropic, Google Gemini, NVIDIA NIM, and OpenRouter, or register a custom OpenAI-compatible endpoint.
- All credentials are encrypted in transit and at rest.

### Available Models
- View and manage all models auto-discovered or registered under configured credentials.
- Filter models by name, search across providers, and toggle status.

### Default Model & Routing
- Set the default LLM model for the System Admin Co-Pilot, Consumer Chat, and other routing domains.
- Map custom routing rules by domain category (e.g. mapping "shopping" capabilities to a specific high-efficiency model).

---

## 2. Connectors & Integrations

Connectors bridge the AI agent to outer data systems, local files, and web utilities.

### Connector Catalog
- Register third-party integrations (e.g., Swiggy, Jira, Zomato) mapping transport protocols:
  - **mcp**: Model Context Protocol servers.
  - **browser**: Web automation scripts.
  - **rest**: Direct JSON API webhooks.
  - **sdk**: Embedded local libraries.

### Model Context Protocol (MCP)
- Install, update, or remove active MCP servers.
- Supports both local command-line processes (e.g., `node /path/to/server.js`) and remote HTTP/SSE stream configurations.
- Map servers to domain categories to auto-expose custom tools to the client.

### Skills & Capabilities
- Define granular capabilities (e.g., `food:order`, `calendar:create`) that active models can call.
- Link capabilities to specific connectors and track their operational status.

---

## 3. Voice & Audio (STT & TTS)

Configure Speech-to-Text and Text-to-Speech routing channels.

### Speech-to-Text (STT)
- Choose the default transcription model (e.g., Whisper, deepgram, system native).
- Set default transcription language (e.g. `en-US`).
- Configure triggering modes: voice activity detection, manual toggle, or continuous streaming.

### Text-to-Speech (TTS)
- Select the speech synthesis engine:
  - **local:piper**: Fast, local neural voice synthesis using Piper TTS.
  - **cloud**: Google TTS, ElevenLabs, OpenAI Audio.
- Customize the voice character using stable URI identifiers (e.g., `en_US-lessac-medium`).
- Adjust playback dynamics: speech rate/speed (0.5x to 2.0x) and pitch scale.
- Configure safety policies such as daily voice limit in minutes per user.

---

## 4. Diagnostics & Auditing

Monitor live logs and health.

### LLM Transaction Logs
- Inspect real-time prompts, responses, model usage, latency, and token counts.

### Integration Health
- Run latency diagnostics, trace connection heartbeats, and view logs for MCP servers and web connectors.
