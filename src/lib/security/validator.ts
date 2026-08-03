/**
 * Input Validation Framework
 * Validates and sanitizes user inputs to prevent injection attacks and ensure data integrity
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: unknown;
}

export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'email' | 'url' | 'uuid';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: unknown[];
  custom?: (value: unknown) => boolean | string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

/**
 * Validate a value against a rule
 */
export function validateValue(
  value: unknown,
  rule: ValidationRule
): { valid: boolean; error?: string } {
  // Check required
  if (rule.required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: 'This field is required' };
  }

  // Skip validation if not required and value is empty
  if (!rule.required && (value === null || value === undefined || value === '')) {
    return { valid: true };
  }

  // Type validation
  if (rule.type) {
    const typeValid = validateType(value, rule.type);
    if (!typeValid.valid) {
      return typeValid;
    }
  }

  // String validation
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return { valid: false, error: `Must be at least ${rule.minLength} characters` };
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return { valid: false, error: `Must be at most ${rule.maxLength} characters` };
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      return { valid: false, error: 'Invalid format' };
    }
  }

  // Number validation
  if (typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      return { valid: false, error: `Must be at least ${rule.min}` };
    }
    if (rule.max !== undefined && value > rule.max) {
      return { valid: false, error: `Must be at most ${rule.max}` };
    }
  }

  // Enum validation
  if (rule.enum && !rule.enum.includes(value)) {
    return { valid: false, error: `Must be one of: ${rule.enum.join(', ')}` };
  }

  // Custom validation
  if (rule.custom) {
    const customResult = rule.custom(value);
    if (typeof customResult === 'string') {
      return { valid: false, error: customResult };
    }
    if (!customResult) {
      return { valid: false, error: 'Custom validation failed' };
    }
  }

  return { valid: true };
}

/**
 * Validate type
 */
function validateType(
  value: unknown,
  type: ValidationRule['type']
): { valid: boolean; error?: string } {
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: 'Must be a string' };
      }
      break;
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: 'Must be a number' };
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'Must be a boolean' };
      }
      break;
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { valid: false, error: 'Must be an object' };
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Must be an array' };
      }
      break;
    case 'email':
      if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { valid: false, error: 'Must be a valid email address' };
      }
      break;
    case 'url':
      if (typeof value !== 'string' || !/^https?:\/\/.+\..+/.test(value)) {
        return { valid: false, error: 'Must be a valid URL' };
      }
      break;
    case 'uuid':
      if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        return { valid: false, error: 'Must be a valid UUID' };
      }
      break;
  }
  return { valid: true };
}

/**
 * Validate an object against a schema
 */
export function validateObject(
  data: Record<string, unknown>,
  schema: ValidationSchema
): ValidationResult {
  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const [key, rule] of Object.entries(schema)) {
    const value = data[key];
    const result = validateValue(value, rule);

    if (!result.valid) {
      errors.push(`${key}: ${result.error}`);
    } else {
      sanitized[key] = sanitizeValue(value, rule);
    }
  }

  // Check for unexpected fields
  const allowedFields = Object.keys(schema);
  const unexpectedFields = Object.keys(data).filter(key => !allowedFields.includes(key));
  
  if (unexpectedFields.length > 0) {
    errors.push(`Unexpected fields: ${unexpectedFields.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined,
  };
}

/**
 * Sanitize a value
 */
export function sanitizeValue(value: unknown, rule: ValidationRule): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  let sanitized = value;

  // Trim whitespace
  sanitized = sanitized.trim();

  // Remove potentially dangerous characters for certain types
  if (rule.type === 'email' || rule.type === 'url') {
    // Remove control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  return sanitized;
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHTML(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize SQL to prevent injection
 */
export function sanitizeSQL(sql: string): string {
  // Basic SQL injection prevention
  return sql
    .replace(/['";\\]/g, '')
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/gi, '');
}

/**
 * Validate and sanitize request body
 */
export function validateRequestBody<T extends Record<string, unknown>>(
  body: unknown,
  schema: ValidationSchema
): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return {
      valid: false,
      errors: ['Request body must be an object'],
    };
  }

  return validateObject(body as Record<string, unknown>, schema);
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  userId: {
    required: true,
    type: 'uuid' as const,
  },

  messageId: {
    required: true,
    type: 'uuid' as const,
  },

  executionId: {
    required: true,
    type: 'uuid' as const,
  },

  email: {
    required: false,
    type: 'email' as const,
  },

  url: {
    required: false,
    type: 'url' as const,
  },

  chatMessage: {
    required: true,
    type: 'string' as const,
    minLength: 1,
    maxLength: 4000,
  },

  apiKey: {
    required: true,
    type: 'string' as const,
    minLength: 16,
    maxLength: 256,
    pattern: /^[A-Za-z0-9_-]+$/,
  },

  timestamp: {
    required: false,
    type: 'number' as const,
    min: 0,
  },
};

/**
 * Validation middleware factory
 */
export function createValidationMiddleware(schema: ValidationSchema) {
  return async (request: Request): Promise<ValidationResult> => {
    try {
      const body = await request.json();
      return validateRequestBody(body, schema);
    } catch (error) {
      return {
        valid: false,
        errors: ['Invalid JSON in request body'],
      };
    }
  };
}
