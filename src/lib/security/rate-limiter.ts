/**
 * Rate Limiting Middleware
 * Prevents abuse and controls API usage
 */

import { NextRequest, NextResponse } from 'next/server';

// Rate limit storage (in-memory for development, use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

// Default rate limits
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  default: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 requests per minute
  chat: { windowMs: 60 * 1000, maxRequests: 20 }, // 20 chat requests per minute
  execution: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 executions per minute
  sensitive: { windowMs: 60 * 1000, maxRequests: 5 }, // 5 sensitive actions per minute
};

/**
 * Generate a unique identifier for the request
 */
function getIdentifier(request: NextRequest): string {
  // Try to get user ID from auth headers
  const userId = request.headers.get('x-user-id');
  if (userId) return `user:${userId}`;

  // Fall back to IP address
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  return `ip:${ip}`;
}

/**
 * Check if request is within rate limits
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_LIMITS.default
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries
  if (entry && entry.resetTime < now) {
    rateLimitStore.delete(identifier);
  }

  const currentEntry = rateLimitStore.get(identifier) || {
    count: 0,
    resetTime: now + config.windowMs,
  };

  if (currentEntry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: currentEntry.resetTime,
    };
  }

  currentEntry.count++;
  rateLimitStore.set(identifier, currentEntry);

  return {
    allowed: true,
    remaining: config.maxRequests - currentEntry.count,
    resetTime: currentEntry.resetTime,
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(
  type: keyof typeof DEFAULT_LIMITS = 'default'
) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const identifier = getIdentifier(request);
    const config = DEFAULT_LIMITS[type];
    const result = checkRateLimit(identifier, config);

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          retryAfter,
          message: `Too many requests. Please try again in ${retryAfter} seconds.`,
        },
        { 
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetTime.toString(),
          },
        }
      );
    }

    // Add rate limit headers to successful responses
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.resetTime.toString());

    return null; // Allow request to proceed
  };
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every minute
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 60 * 1000);
}

/**
 * Get current rate limit status for an identifier
 */
export function getRateLimitStatus(identifier: string): {
  count: number;
  remaining: number;
  resetTime: number;
} | null {
  const entry = rateLimitStore.get(identifier);
  if (!entry) return null;

  const now = Date.now();
  if (entry.resetTime < now) {
    rateLimitStore.delete(identifier);
    return null;
  }

  return {
    count: entry.count,
    remaining: Math.max(0, DEFAULT_LIMITS.default.maxRequests - entry.count),
    resetTime: entry.resetTime,
  };
}

/**
 * Reset rate limit for an identifier (admin function)
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}
