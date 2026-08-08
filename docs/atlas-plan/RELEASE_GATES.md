# Release Gates

This document defines the quality gates that must be passed before any Atlas release.

## Pre-Release Checklist

### Component Tests
- [ ] All component tests pass (`npm run test:agent`)
- [ ] Test coverage meets minimum threshold (80%)
- [ ] No critical security vulnerabilities detected
- [ ] No TypeScript compilation errors
- [ ] No linting errors (`npm run lint`)

### Behavioral Validation
- [ ] All behavioral datasets pass (`npm run test:behavioral`)
- [ ] No unexpected trace regressions detected
- [ ] Behavioral health score above minimum threshold (85%)
- [ ] Conversation success rate above minimum threshold (95%)
- [ ] Planner accuracy above minimum threshold (90%)
- [ ] Tool correctness above minimum threshold (90%)
- [ ] Memory correctness above minimum threshold (85%)

### Performance Requirements
- [ ] Average latency within acceptable range (<1000ms)
- [ ] P95 latency within acceptable range (<2000ms)
- [ ] P99 latency within acceptable range (<5000ms)
- [ ] Average token usage within acceptable range (<500 tokens/turn)
- [ ] No performance regression >20% from baseline

### Regression Testing
- [ ] All regression tests pass (`npm run test:behavioral:regression`)
- [ ] No new behavioral regressions introduced
- [ ] All intentional behavioral changes documented and approved
- [ ] Golden traces updated for approved changes

### Security & Compliance
- [ ] No PII leakage in behavioral traces
- [ ] All production conversations properly sanitized
- [ ] Approval flows working correctly
- [ ] No unauthorized capability access
- [ ] Rate limiting and security controls functional

### Documentation
- [ ] API documentation updated
- [ ] Behavioral datasets updated for new capabilities
- [ ] Release notes prepared
- [ ] Known issues documented

## Release Process

### 1. Pre-Release Validation
```bash
# Run all tests
npm run test:agent
npm run test:behavioral
npm run test:behavioral:regression

# Generate reports
npm run test:behavioral:report

# Check for regressions
node scripts/check-regressions.mjs regression-results.json
```

### 2. Golden Trace Management
```bash
# If behavior intentionally changed:
npx tsx scripts/behavioral-validation.ts create-golden <dataset-id> --reason "Intentional change for X feature"

# Accept new baseline
npx tsx scripts/behavioral-validation.ts golden-accept <dataset-id> "Approved for release X.Y.Z"
```

### 3. Metrics Verification
```bash
# Check behavioral metrics
npx tsx scripts/behavioral-validation.ts golden-list

# Verify health score
# (Dashboard or API call to metrics service)
```

### 4. Release Decision
- Review all gate results
- Confirm all checkboxes completed
- Get approval from engineering lead
- Document any known issues or limitations
- Proceed with release if all gates pass

### 5. Post-Release Monitoring
- Monitor behavioral metrics in production
- Watch for unexpected regressions
- Collect production conversations for dataset enhancement
- Update golden traces if production behavior differs

## Emergency Release Process

For critical security fixes or urgent bug fixes:

1. Run subset of critical tests only
2. Focus on affected capability area
3. Skip non-essential behavioral datasets
4. Document abbreviated testing approach
5. Schedule full validation follow-up

## Threshold Configuration

Thresholds are configured in:
- `.github/workflows/behavioral-validation.yml` (CI thresholds)
- `scripts/check-regressions.mjs` (regression thresholds)
- Environment variables for runtime thresholds

### Current Thresholds
- Regression Rate: 5%
- Latency Increase: 50%
- Token Usage Increase: 50%
- Failure Rate: 10%
- Health Score: 85%
- Success Rate: 95%
- Planner Accuracy: 90%
- Tool Correctness: 90%
- Memory Correctness: 85%

## Rollback Criteria

Release should be rolled back if:
- Behavioral regression rate exceeds 10%
- Health score drops below 70%
- Critical security issue discovered
- Approval flow not working
- Performance degradation >50%
- User-reported issues exceed threshold

## Continuous Monitoring

Post-release behavioral metrics should be monitored:
- Success rate trends
- Latency patterns
- Error rates
- User satisfaction
- Feature adoption rates

Alert triggers:
- Success rate drops below 90%
- Health score drops below 80%
- Error rate increases by 50%
- Latency increases by 100%