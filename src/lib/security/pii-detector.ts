/**
 * PII (Personally Identifiable Information) Detection and Redaction
 * Protects user privacy by detecting and redacting sensitive information
 */

// PII patterns
const PII_PATTERNS = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
  
  // Phone numbers (various formats)
  phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  
  // Social Security Numbers
  ssn: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
  
  // Credit card numbers (basic pattern)
  creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
  
  // IP addresses
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  
  // URLs with potential sensitive info
  url: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
  
  // API keys (common patterns)
  apiKey: /\b[A-Za-z0-9]{32,}\b/g,
  
  // Street addresses (basic pattern)
  address: /\d+\s+[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Place|Pl)[\s,]*/gi,
};

export type PIIType = keyof typeof PII_PATTERNS;

interface PIIDetection {
  type: PIIType;
  original: string;
  redacted: string;
  position: {
    start: number;
    end: number;
  };
}

/**
 * Detect PII in text
 */
export function detectPII(text: string): PIIDetection[] {
  const detections: PIIDetection[] = [];

  for (const [type, pattern] of Object.entries(PII_PATTERNS) as [PIIType, RegExp][]) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      detections.push({
        type,
        original: match[0],
        redacted: redactPII(match[0], type),
        position: {
          start: match.index,
          end: match.index + match[0].length,
        },
      });
    }
  }

  return detections;
}

/**
 * Redact PII in text
 */
export function redactPII(text: string, type?: PIIType): string {
  let redacted = text;

  if (type) {
    const pattern = PII_PATTERNS[type];
    redacted = redacted.replace(pattern, getRedactionPattern(type));
  } else {
    // Redact all PII types
    for (const [piiType, pattern] of Object.entries(PII_PATTERNS) as [PIIType, RegExp][]) {
      redacted = redacted.replace(pattern, getRedactionPattern(piiType));
    }
  }

  return redacted;
}

/**
 * Get redaction pattern for a PII type
 */
function getRedactionPattern(type: PIIType): string {
  const patterns: Record<PIIType, string> = {
    email: '[REDACTED_EMAIL]',
    phone: '[REDACTED_PHONE]',
    ssn: '[REDACTED_SSN]',
    creditCard: '[REDACTED_CARD]',
    ipAddress: '[REDACTED_IP]',
    url: '[REDACTED_URL]',
    apiKey: '[REDACTED_KEY]',
    address: '[REDACTED_ADDRESS]',
  };

  return patterns[type];
}

/**
 * Check if text contains PII
 */
export function containsPII(text: string): boolean {
  return detectPII(text).length > 0;
}

/**
 * Extract detected PII with context
 */
export function extractPIIWithContext(
  text: string,
  contextChars: number = 20
): Array<{
  type: PIIType;
  redacted: string;
  context: string;
}> {
  const detections = detectPII(text);

  return detections.map(detection => {
    const start = Math.max(0, detection.position.start - contextChars);
    const end = Math.min(text.length, detection.position.end + contextChars);
    const context = text.substring(start, end);

    return {
      type: detection.type,
      redacted: detection.redacted,
      context: context.replace(
        detection.original,
        detection.redacted
      ),
    };
  });
}

/**
 * Custom PII pattern registration
 */
const customPatterns = new Map<string, RegExp>();

export function registerCustomPIIPattern(
  name: string,
  pattern: RegExp,
  redactionString: string
): void {
  customPatterns.set(name, { pattern, redaction: redactionString });
}

export function detectCustomPII(text: string): Array<{
  name: string;
  original: string;
  redacted: string;
}> {
  const detections: Array<{ name: string; original: string; redacted: string }> = [];

  for (const [name, { pattern, redaction }] of customPatterns.entries()) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      detections.push({
        name,
        original: match[0],
        redacted: match[0].replace(pattern, redaction),
      });
    }
  }

  return detections;
}

/**
 * Redact custom PII patterns
 */
export function redactCustomPII(text: string): string {
  let redacted = text;

  for (const { pattern, redaction } of customPatterns.values()) {
    redacted = redacted.replace(pattern, redaction);
  }

  return redacted;
}

/**
 * Comprehensive PII detection including custom patterns
 */
export function detectAllPII(text: string): Array<{
  type: string;
  original: string;
  redacted: string;
}> {
  const standardPII = detectPII(text).map(d => ({
    type: d.type,
    original: d.original,
    redacted: d.redacted,
  }));

  const customPII = detectCustomPII(text).map(d => ({
    type: d.name,
    original: d.original,
    redacted: d.redacted,
  }));

  return [...standardPII, ...customPII];
}

/**
 * Redact all PII (standard and custom)
 */
export function redactAllPII(text: string): string {
  return redactCustomPII(redactPII(text));
}
