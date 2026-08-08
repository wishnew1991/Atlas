# Behavioral Validation Framework

## Overview

The Behavioral Validation Framework is the highest layer of the testing pyramid for Atlas. It validates the application exactly as a real user would by treating Atlas as a black box and communicating only through its public API.

## Key Features

- **Black Box Testing**: No direct invocation of internal modules (planner, tools, memory, MCP)
- **Public API Testing**: All interactions flow through the real HTTP/chat API
- **Conversation Replay**: Replays complete real-world conversations
- **Execution Tracing**: Captures detailed traces of every conversation turn
- **Behavioral Assertions**: Validates behavior, not just outputs
- **Regression Detection**: Compares current executions against golden traces
- **Multi-Turn Context**: Validates reference resolution and state preservation
- **Failure Scenarios**: Tests error recovery and edge cases

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Conversation Datasets                      │
│  (food, shopping, multi-capability, edge-cases)              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Conversation Replay Engine                   │
│  (replays conversations through public API)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Atlas Public API (HTTP)                    │
│  (api/chat, streaming, auth)                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Execution Trace Capture                      │
│  (planner decisions, tool calls, memory, latency, errors)    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 Behavioral Assertion Engine                    │
│  (validates capabilities, tools, memory, approvals, flow)    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Behavioral Report Generator                 │
│  (text, HTML, JSON reports with metrics and summaries)       │
└─────────────────────────────────────────────────────────────┘
```

## Conversation Dataset Structure

Each dataset represents a complete real-world conversation:

```typescript
{
  id: 'food_basic_biryani',
  name: 'Basic Biryani Order',
  description: 'Simple food ordering conversation',
  category: 'food',
  tags: ['basic', 'food', 'biriyani'],
  turns: [
    { type: 'user', message: "I'm hungry" },
    { type: 'expect', capability: 'food' },
    { type: 'user', message: "Show Indian restaurants" },
    { type: 'expect', tool: 'search_restaurants' },
    { type: 'user', message: "The second one" },
    { type: 'expect', tool: 'get_restaurant_menu' },
    { type: 'user', message: "Add chicken biryani" },
    { type: 'expect', tool: 'update_food_cart' },
    { type: 'user', message: "Checkout" },
    { type: 'expect', approval: true },
  ],
  metadata: {
    difficulty: 'basic',
    estimatedDuration: 120,
    requiresCapabilities: ['food'],
    requiresMcpServers: ['swiggy-food-mcp-server'],
  }
}
```

## Turn Types

### User Turn
```typescript
{ type: 'user', message: "I'm hungry" }
```

### Expectation Turn
```typescript
{
  type: 'expect',
  capability: 'food',           // Expected capability
  tool: 'search_restaurants',  // Expected tool call
  approval: true,              // Expected approval request
  contains: 'biryani',         // Response should contain text
  notContains: 'error',        // Response should not contain text
  referenceResolution: true,   // Should resolve references
  memoryRetrieval: true,       // Should retrieve from memory
  memoryStorage: true,         // Should store to memory
}
```

### System Turn
```typescript
{
  type: 'system',
  action: 'simulate_delay',
  delay: 1000  // milliseconds
}
```

## Execution Trace

For every conversation turn, the framework captures:

- User message
- Assistant response
- Planner decision (intent, capability, confidence)
- Capability selected
- Tool calls (name, arguments, result, duration)
- MCP requests/responses
- Memory operations (retrieve, store, update)
- Routine creation
- Approval requests
- Errors (with stack traces)
- Latency metrics (total, planner, LLM, MCP, memory)
- Token usage (input, output, total, model)

## Behavioral Assertions

Instead of only asserting outputs, the framework validates behavior:

✓ **Correct capability selected** - Planner chose the right capability
✓ **Correct tool sequence** - Tools called in expected order
✓ **No unnecessary tool calls** - Efficient tool usage
✓ **Memory used correctly** - Memory operations as expected
✓ **Routine created when appropriate** - Routine logic correct
✓ **Conversation context preserved** - References resolved correctly
✓ **Proper approval flow** - Approval requests and handling
✓ **Recovery after failures** - Graceful error handling

## Regression Detection

The framework supports replaying complete historical conversations and comparing against golden traces:

### Comparison Metrics

- **Planner behavior changes** - Intent, capability, confidence
- **Tool ordering changes** - Sequence of tool calls
- **Memory usage changes** - Memory operations
- **Conversation flow changes** - Response content
- **Latency regression** - Performance degradation
- **Token usage regression** - Cost increases
- **Behavior regression** - Overall behavioral changes

### Regression Report

```typescript
{
  baselineTraceId: 'golden_trace_123',
  currentTraceId: 'current_trace_456',
  plannerChanges: [
    'Turn 2: Capability changed from food to shopping'
  ],
  toolOrderingChanges: [
    'Turn 3: Tool order changed from [search, get] to [get, search]'
  ],
  memoryUsageChanges: [
    'Turn 4: Memory operations changed from 2 to 0'
  ],
  conversationFlowChanges: [
    'Turn 5: Assistant response changed'
  ],
  latencyRegression: false,
  tokenUsageRegression: false,
  behaviorRegression: true
}
```

## CLI Usage

### List Available Datasets
```bash
npm run test:behavioral list
```

### Run All Datasets
```bash
npm run test:behavioral
```

### Run Specific Dataset
```bash
npx tsx scripts/behavioral-validation.ts run food_basic_biryani
```

### Run by Category
```bash
npx tsx scripts/behavioral-validation.ts run-category food
```

### Run by Difficulty
```bash
npx tsx scripts/behavioral-validation.ts run-difficulty basic
```

### Generate HTML Report
```bash
npm run test:behavioral:report
```

### Create Golden Traces
```bash
npx tsx scripts/behavioral-validation.ts create-golden food_basic_biryani
```

### Run Regression Test
```bash
npx tsx scripts/behavioral-validation.ts regression food_basic_biryani
```

### Batch Regression Testing
```bash
npm run test:behavioral:regression
```

### Custom API URL
```bash
npx tsx scripts/behavioral-validation.ts run --api-url http://localhost:3001
```

### Custom Output Format
```bash
npx tsx scripts/behavioral-validation.ts run --format html --output report.html
```

## Programmatic Usage

### Run Single Dataset
```typescript
import { ConversationReplayEngine } from '@/lib/validation';
import { getDatasetById } from '@/lib/validation/datasets';

const replayEngine = new ConversationReplayEngine('http://localhost:3001');
const dataset = getDatasetById('food_basic_biryani');
const report = await replayEngine.replayConversation(dataset);

console.log(`Success: ${report.overallSuccess}`);
console.log(`Planner Accuracy: ${report.summary.plannerAccuracy}`);
```

### Regression Testing
```typescript
import { RegressionComparisonEngine } from '@/lib/validation';
import { getDatasetById } from '@/lib/validation/datasets';

const regressionEngine = new RegressionComparisonEngine('http://localhost:3001');
const dataset = getDatasetById('food_basic_biryani');

// Create golden traces
await regressionEngine.createGoldenTraces(dataset);

// Run regression test
const report = await regressionEngine.compareAgainstGolden(dataset);
console.log(`Behavior Regression: ${report.regressionComparison.behaviorRegression}`);
```

### Batch Testing
```typescript
import { allDatasets } from '@/lib/validation/datasets';
import { RegressionComparisonEngine } from '@/lib/validation';

const regressionEngine = new RegressionComparisonEngine();
const results = await regressionEngine.batchRegressionTest(allDatasets);
const summary = regressionEngine.generateRegressionSummary(results);
console.log(summary);
```

## Report Formats

### Text Report
Plain text with detailed assertions, traces, and metrics.

### HTML Report
Interactive HTML with color-coded assertions, metrics cards, and visual formatting.

### JSON Report
Machine-readable JSON for integration with CI/CD systems.

## Behavioral Metrics

The framework tracks the following metrics:

- **Planner Accuracy**: Percentage of correct capability selections
- **Tool Correctness**: Percentage of correct tool calls
- **Memory Correctness**: Percentage of correct memory operations
- **Routine Correctness**: Percentage of correct routine operations
- **Conversation Flow Correctness**: Percentage of correct conversation flow
- **Average Latency**: Mean response time across all turns
- **Average Token Usage**: Mean token consumption across all turns
- **Error Rate**: Percentage of turns with errors

## Available Datasets

### Food (6 datasets)
- Basic Biryani Order
- Multi-Item Food Order
- Restaurant Search and Selection
- Food Preference Remembered
- Reference Resolution in Food Ordering
- Complete Food Approval Flow

### Shopping (5 datasets)
- Basic Product Search
- Product Comparison
- Shopping Cart Management
- Complete Purchase Flow
- Budget-Constrained Shopping

### Multi-Capability (4 datasets)
- Food Then Shopping
- Parallel Tasks
- Complex Workflow
- Context Preservation Across Capabilities

### Edge Cases (8 datasets)
- Ambiguous Intent
- Empty Search Results
- Invalid Reference
- Out of Stock Item
- Rapid Context Switching
- Empty Cart Checkout
- Approval Denied
- Long Conversation

## Best Practices

### Creating Datasets
1. Keep conversations realistic and representative of real user behavior
2. Test edge cases and failure scenarios
3. Include multi-turn conversations with reference resolution
4. Validate memory operations when appropriate
5. Test approval flows for sensitive operations

### Golden Traces
1. Create golden traces for stable, known-good behavior
2. Update golden traces only when behavior changes are intentional
3. Use regression testing to detect unintended behavioral changes
4. Review regression reports carefully before accepting changes

### CI/CD Integration
1. Run behavioral tests as part of CI pipeline
2. Fail builds on behavioral regressions
3. Generate HTML reports for review
4. Track metrics over time to detect performance degradation

## Limitations

- Currently uses mock planner decisions and latency metrics (can be enhanced with actual API data)
- Requires Atlas API to be running
- Golden traces stored in memory (can be enhanced with database persistence)
- Reference resolution validation is informational only (requires semantic analysis)

## Future Enhancements

- Integrate with actual planner API for real decision capture
- Add semantic similarity analysis for response comparison
- Persist golden traces to database
- Add real-time monitoring and alerting
- Integrate with CI/CD systems
- Add performance baseline tracking
- Support for custom assertion types
- Machine learning-based anomaly detection

## Success Criteria

The framework is successful when:

✓ Can replay hundreds of real conversations exactly as a user would
✓ Automatically detects behavioral regressions
✓ Provides high-confidence validation through real public interface
✓ Integrates seamlessly with CI/CD pipeline
✓ Generates actionable reports with clear metrics
✓ Validates the application, not just its implementation