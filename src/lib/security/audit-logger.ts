/**
 * Audit Logging System
 * Provides immutable audit trail for security-sensitive actions
 */

export enum AuditAction {
  // User actions
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTER = 'USER_REGISTER',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',

  // Execution actions
  EXECUTION_CREATE = 'EXECUTION_CREATE',
  EXECUTION_START = 'EXECUTION_START',
  EXECUTION_COMPLETE = 'EXECUTION_COMPLETE',
  EXECUTION_FAIL = 'EXECUTION_FAIL',
  EXECUTION_CANCEL = 'EXECUTION_CANCEL',

  // Approval actions
  APPROVAL_REQUEST = 'APPROVAL_REQUEST',
  APPROVAL_GRANT = 'APPROVAL_GRANT',
  APPROVAL_DENY = 'APPROVAL_DENY',
  APPROVAL_MODIFY = 'APPROVAL_MODIFY',
  APPROVAL_EXPIRE = 'APPROVAL_EXPIRE',

  // Memory actions
  MEMORY_CREATE = 'MEMORY_CREATE',
  MEMORY_UPDATE = 'MEMORY_UPDATE',
  MEMORY_DELETE = 'MEMORY_DELETE',
  MEMORY_EXPORT = 'MEMORY_EXPORT',

  // MCP actions
  MCP_SERVER_ADD = 'MCP_SERVER_ADD',
  MCP_SERVER_REMOVE = 'MCP_SERVER_REMOVE',
  MCP_SERVER_UPDATE = 'MCP_SERVER_UPDATE',
  MCP_TOOL_CALL = 'MCP_TOOL_CALL',

  // Configuration actions
  CONFIG_UPDATE = 'CONFIG_UPDATE',
  CREDENTIAL_UPDATE = 'CREDENTIAL_UPDATE',
  API_KEY_UPDATE = 'API_KEY_UPDATE',

  // Security actions
  SECURITY_BREACH = 'SECURITY_BREACH',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  AUTH_FAILURE = 'AUTH_FAILURE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: AuditAction;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
}

// In-memory audit log storage (use database in production)
const auditLog: AuditLogEntry[] = [];
const MAX_LOG_SIZE = 10000; // Keep last 10,000 entries

/**
 * Create an audit log entry
 */
export function createAuditLogEntry(params: {
  action: AuditAction;
  severity?: AuditSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
}): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: generateAuditId(),
    timestamp: new Date(),
    action: params.action,
    severity: params.severity || AuditSeverity.INFO,
    userId: params.userId,
    sessionId: params.sessionId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    resource: params.resource,
    resourceId: params.resourceId,
    details: params.details,
    success: params.success,
    errorMessage: params.errorMessage,
  };

  // Add to log
  auditLog.push(entry);

  // Trim log if too large
  if (auditLog.length > MAX_LOG_SIZE) {
    auditLog.shift();
  }

  // Log to console for development
  const logLevel = entry.severity === AuditSeverity.CRITICAL ? 'error' : 
                   entry.severity === AuditSeverity.ERROR ? 'error' :
                   entry.severity === AuditSeverity.WARNING ? 'warn' : 'info';
  
  console[logLevel](`[AUDIT] ${entry.action}`, {
    userId: entry.userId,
    success: entry.success,
    details: entry.details,
  });

  return entry;
}

/**
 * Generate unique audit ID
 */
function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log user action
 */
export function logUserAction(
  action: AuditAction,
  userId: string,
  details: Record<string, unknown>,
  success: boolean = true
): AuditLogEntry {
  return createAuditLogEntry({
    action,
    severity: success ? AuditSeverity.INFO : AuditSeverity.WARNING,
    userId,
    details,
    success,
  });
}

/**
 * Log security event
 */
export function logSecurityEvent(
  action: AuditAction,
  details: Record<string, unknown>,
  ipAddress?: string,
  severity: AuditSeverity = AuditSeverity.WARNING
): AuditLogEntry {
  return createAuditLogEntry({
    action,
    severity,
    ipAddress,
    details,
    success: false, // Security events are typically failures
  });
}

/**
 * Log execution action
 */
export function logExecutionAction(
  action: AuditAction,
  executionId: string,
  userId?: string,
  details: Record<string, unknown>,
  success: boolean = true
): AuditLogEntry {
  return createAuditLogEntry({
    action,
    severity: success ? AuditSeverity.INFO : AuditSeverity.ERROR,
    userId,
    resource: 'execution',
    resourceId: executionId,
    details,
    success,
  });
}

/**
 * Log approval action
 */
export function logApprovalAction(
  action: AuditAction,
  approvalId: string,
  userId: string,
  details: Record<string, unknown>,
  success: boolean = true
): AuditLogEntry {
  return createAuditLogEntry({
    action,
    severity: success ? AuditSeverity.INFO : AuditSeverity.WARNING,
    userId,
    resource: 'approval',
    resourceId: approvalId,
    details,
    success,
  });
}

/**
 * Query audit logs
 */
export function queryAuditLogs(filters: {
  userId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  resource?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): AuditLogEntry[] {
  let results = [...auditLog];

  // Filter by user ID
  if (filters.userId) {
    results = results.filter(entry => entry.userId === filters.userId);
  }

  // Filter by action
  if (filters.action) {
    results = results.filter(entry => entry.action === filters.action);
  }

  // Filter by severity
  if (filters.severity) {
    results = results.filter(entry => entry.severity === filters.severity);
  }

  // Filter by resource
  if (filters.resource) {
    results = results.filter(entry => entry.resource === filters.resource);
  }

  // Filter by resource ID
  if (filters.resourceId) {
    results = results.filter(entry => entry.resourceId === filters.resourceId);
  }

  // Filter by date range
  if (filters.startDate) {
    results = results.filter(entry => entry.timestamp >= filters.startDate!);
  }
  if (filters.endDate) {
    results = results.filter(entry => entry.timestamp <= filters.endDate!);
  }

  // Sort by timestamp (newest first)
  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply limit
  if (filters.limit) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

/**
 * Get audit log statistics
 */
export function getAuditLogStats(): {
  totalEntries: number;
  byAction: Record<AuditAction, number>;
  bySeverity: Record<AuditSeverity, number>;
  byUser: Record<string, number>;
  successRate: number;
  recentActivity: AuditLogEntry[];
} {
  const byAction: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byUser: Record<string, number> = {};

  let successCount = 0;

  auditLog.forEach(entry => {
    byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
    if (entry.userId) {
      byUser[entry.userId] = (byUser[entry.userId] || 0) + 1;
    }
    if (entry.success) {
      successCount++;
    }
  });

  return {
    totalEntries: auditLog.length,
    byAction: byAction as Record<AuditAction, number>,
    bySeverity: bySeverity as Record<AuditSeverity, number>,
    byUser,
    successRate: auditLog.length > 0 ? (successCount / auditLog.length) * 100 : 0,
    recentActivity: auditLog.slice(-10).reverse(),
  };
}

/**
 * Export audit logs
 */
export function exportAuditLogs(filters?: Parameters<typeof queryAuditLogs>[0]): string {
  const logs = filters ? queryAuditLogs(filters) : auditLog;
  return JSON.stringify(logs, null, 2);
}

/**
 * Clear old audit logs (maintenance function)
 */
export function clearOldAuditLogs(olderThan: Date): number {
  const initialCount = auditLog.length;
  const cutoff = olderThan.getTime();
  
  for (let i = auditLog.length - 1; i >= 0; i--) {
    if (auditLog[i].timestamp.getTime() < cutoff) {
      auditLog.splice(i, 1);
    }
  }

  return initialCount - auditLog.length;
}

/**
 * Get audit log for a specific resource
 */
export function getResourceAuditLog(
  resource: string,
  resourceId: string,
  limit: number = 50
): AuditLogEntry[] {
  return queryAuditLogs({
    resource,
    resourceId,
    limit,
  });
}

/**
 * Get user audit history
 */
export function getUserAuditHistory(
  userId: string,
  limit: number = 100
): AuditLogEntry[] {
  return queryAuditLogs({
    userId,
    limit,
  });
}
