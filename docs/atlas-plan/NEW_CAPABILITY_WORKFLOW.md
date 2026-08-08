# New Capability Workflow

This document defines the required process for developing and releasing new Atlas capabilities using behavior-first development.

## Process Overview

The behavior-first development process ensures that new capabilities are validated through real user behavior from the start, making behavioral validation the primary quality gate.

## Step-by-Step Workflow

### 1. Design Capability

**Objective**: Define the capability's purpose, scope, and expected behavior.

**Deliverables**:
- Capability specification document
- User stories and acceptance criteria
- Expected conversation flows
- Integration points with existing capabilities
- Security and privacy considerations

**Example**:
```
Capability: Rides
Purpose: Enable users to book rides through Atlas
User Stories:
- As a user, I want to request a ride from my current location
- As a user, I want to specify pickup and drop-off locations
- As a user, I want to see ride options and pricing
- As a user, I want to confirm and track my ride
```

### 2. Create Behavioral Conversation Datasets

**Objective**: Create realistic conversation datasets that represent how users will interact with the new capability.

**Deliverables**:
- Basic conversation datasets (happy path)
- Intermediate conversation datasets (edge cases)
- Advanced conversation datasets (complex scenarios)
- Expected behavior assertions for each turn

**Process**:
```bash
# Create new dataset file
# src/lib/validation/datasets/rides.ts

import { createDataset } from '../dataset-schema';
import type { ConversationDataset } from '../types';

export const ridesDatasets: ConversationDataset[] = [
  createDataset({
    id: 'rides_basic_booking',
    name: 'Basic Ride Booking',
    description: 'Simple ride booking conversation',
    category: 'rides',
    tags: ['basic', 'rides', 'booking'],
    turns: [
      { type: 'user', message: "I need a ride" },
      { type: 'expect', capability: 'rides' },
      { type: 'user', message: "Book a ride to the airport" },
      { type: 'expect', tool: 'search_ride_options' },
      { type: 'user', message: "The first one" },
      { type: 'expect', tool: 'book_ride' },
      { type: 'user', message: "Confirm" },
      { type: 'expect', approval: true },
    ],
    metadata: {
      author: 'atlas-team',
      createdAt: new Date().toISOString(),
      version: '1.0',
      difficulty: 'basic',
      estimatedDuration: 120,
      requiresCapabilities: ['rides'],
      requiresMcpServers: ['uber-mcp-server', 'lyft-mcp-server'],
    },
  }),
  // Add more datasets...
];
```

**Dataset Categories**:
- **Basic**: Happy path, simple scenarios
- **Intermediate**: Edge cases, variations, reference resolution
- **Advanced**: Complex workflows, multi-turn, error recovery

### 3. Create Component Tests

**Objective**: Implement unit and integration tests for the capability's components.

**Deliverables**:
- Unit tests for capability logic
- Integration tests with MCP servers
- Edge case tests
- Performance tests

**Process**:
```typescript
// src/lib/capabilities/rides/__tests__/rides.test.ts
import { describe, it, expect } from 'vitest';
import { RidesCapability } from '../rides';

describe('Rides Capability', () => {
  it('should detect ride intent', () => {
    const capability = new RidesCapability();
    const intent = capability.detectIntent("I need a ride to the airport");
    expect(intent.capability).toBe('rides');
  });

  it('should handle ride booking', async () => {
    const capability = new RidesCapability();
    const result = await capability.bookRide({
      pickup: 'current location',
      dropoff: 'airport',
    });
    expect(result.success).toBe(true);
  });
});
```

### 4. Implement Capability

**Objective**: Implement the capability with behavior-first mindset.

**Process**:
1. Implement core capability logic
2. Integrate with MCP servers
3. Add to capability registry
4. Implement planner integration
5. Add error handling and recovery
6. Implement approval flows if needed

**Key Principles**:
- Use behavioral datasets as development guide
- Test against datasets during development
- Implement observability and tracing
- Handle edge cases defined in datasets
- Ensure conversation context preservation

### 5. Replay Behavioral Datasets

**Objective**: Validate the implementation against the behavioral datasets.

**Process**:
```bash
# Run behavioral tests for new capability
npx tsx scripts/behavioral-validation.ts run rides_basic_booking

# Run all rides datasets
npx tsx scripts/behavioral-validation.ts run-category rides

# Generate HTML report
npx tsx scripts/behavioral-validation.ts run-category rides --format html --output reports/rides-validation.html
```

**Expected Outcomes**:
- All behavioral assertions pass
- Conversation flows match expectations
- Tool calls are correct
- Approval flows work as expected
- No unexpected errors

### 6. Update Golden Traces

**Objective**: Create golden traces for regression testing.

**Process**:
```bash
# Create golden traces for new capability
npx tsx scripts/behavioral-validation.ts create-golden rides_basic_booking --reason "Initial rides capability implementation"

# Create golden traces for all rides datasets
for dataset in rides_*; do
  npx tsx scripts/behavioral-validation.ts create-golden $dataset --reason "Initial rides capability implementation"
done
```

**Documentation**:
- Document why traces look the way they do
- Note any intentional behavioral choices
- Record performance baselines
- Document any known limitations

### 7. Release

**Objective**: Release the capability following the release gates process.

**Process**:
1. Complete release gates checklist
2. Run full behavioral validation suite
3. Verify no regressions in existing capabilities
4. Get approval from engineering lead
5. Update documentation
6. Release to production

**Post-Release**:
- Monitor behavioral metrics
- Collect production conversations
- Enhance datasets based on real usage
- Update golden traces if needed

## Integration with Existing Capabilities

### Multi-Capability Datasets

When a new capability interacts with existing capabilities, create multi-capability datasets:

```typescript
createDataset({
  id: 'multi_rides_then_food',
  name: 'Rides Then Food',
  description: 'User switches from rides to food in same conversation',
  category: 'multi_capability',
  turns: [
    { type: 'user', message: "I need a ride" },
    { type: 'expect', capability: 'rides' },
    { type: 'user', message: "Book a ride to the restaurant" },
    { type: 'expect', tool: 'book_ride' },
    { type: 'user', message: "Order food while I wait" },
    { type: 'expect', capability: 'food' },
    { type: 'user', message: "Show me restaurants" },
    { type: 'expect', tool: 'search_restaurants' },
  ],
  metadata: {
    requiresCapabilities: ['rides', 'food'],
  },
})
```

### Context Preservation

Ensure context is preserved when switching capabilities:
- Reference resolution across capabilities
- Memory operations for cross-capability context
- Approval flow consistency
- Error recovery handling

## Continuous Improvement

### Production Conversation Import

After release, import real production conversations to enhance datasets:

```typescript
import { ProductionConversationImporter } from '@/lib/validation/production-importer';

const importer = new ProductionConversationImporter({
  removePII: true,
  removeEmails: true,
  removePhoneNumbers: true,
});

const conversations = await loadProductionConversations('rides');
const datasets = await importer.importConversations(conversations, {
  datasetId: 'rides_production_1',
  datasetName: 'Production Rides Conversations',
  description: 'Real-world rides conversations from production',
  category: 'rides',
  tags: ['production', 'rides'],
  difficulty: 'intermediate',
  author: 'atlas-team',
  reason: 'Enhance datasets with real user behavior',
});

// Review and approve datasets
// Add expectations
// Add to regression suite
```

### Dataset Evolution

Regularly enhance datasets based on:
- Production conversation analysis
- User feedback
- Edge case discovery
- Performance optimization opportunities

## Quality Metrics

Track the following metrics for new capabilities:

### Development Metrics
- Time from design to implementation
- Number of behavioral datasets created
- Behavioral test pass rate
- Time to pass all behavioral tests

### Production Metrics
- Conversation success rate
- User satisfaction score
- Error rate
- Average completion time
- Feature adoption rate

### Regression Metrics
- Regression detection rate
- False positive rate
- Time to detect regressions
- Impact of regressions

## Best Practices

### Dataset Design
- Start with simple happy path scenarios
- Gradually add complexity and edge cases
- Include realistic user language and variations
- Test reference resolution and context preservation
- Include error recovery scenarios

### Implementation
- Test against behavioral datasets continuously
- Use datasets as living documentation
- Implement observability from the start
- Handle edge cases defined in datasets
- Maintain conversation context integrity

### Validation
- Run behavioral tests frequently during development
- Use golden traces for regression prevention
- Monitor production behavior closely
- Update datasets based on real usage
- Keep documentation in sync with implementation

## Common Pitfalls

### Avoid These Mistakes
- Creating datasets after implementation
- Only testing happy path scenarios
- Ignoring edge cases in datasets
- Not updating golden traces when behavior changes
- Skipping multi-capability integration testing
- Not importing production conversations
- Over-engineering datasets before user feedback

### Warning Signs
- Behavioral tests consistently failing
- Need to frequently update golden traces
- Production behavior differs from datasets
- Low success rate in production
- High error rates on specific flows

## Success Criteria

A new capability is successful when:

✓ Behavioral datasets created before implementation
✓ All behavioral tests pass before release
✓ Golden traces established for regression testing
✓ No regressions in existing capabilities
✓ Production metrics meet thresholds
✓ Real user behavior matches expected behavior
✓ Datasets continuously improved with production data
✓ Capability integrates seamlessly with existing capabilities

## Template

Use this template for new capability development:

```markdown
# [Capability Name] Development

## Design
- [ ] Specification document created
- [ ] User stories defined
- [ ] Conversation flows documented
- [ ] Integration points identified

## Behavioral Datasets
- [ ] Basic datasets created
- [ ] Intermediate datasets created
- [ ] Advanced datasets created
- [ ] Multi-capability datasets created
- [ ] All datasets include expectations

## Component Tests
- [ ] Unit tests implemented
- [ ] Integration tests implemented
- [ ] Edge case tests implemented
- [ ] Performance tests implemented

## Implementation
- [ ] Core logic implemented
- [ ] MCP integration completed
- [ ] Planner integration completed
- [ ] Error handling implemented
- [ ] Approval flows implemented

## Validation
- [ ] Behavioral tests pass
- [ ] Golden traces created
- [ ] No regressions detected
- [ ] Performance within thresholds

## Release
- [ ] Release gates completed
- [ ] Documentation updated
- [ ] Production monitoring configured
- [ ] Post-release metrics meet targets
```