import * as crypto from 'crypto';
import { AuditLogEntry, ActionApprovalStatus } from '../types/index.js';

export class AuditLogger {
  private static logs: AuditLogEntry[] = [];

  public static logAction(params: {
    workflow: 'FINOPS_RECONCILIATION' | 'HR_SCREENING' | 'GENERIC_OPS';
    actor: string;
    action: string;
    payload: Record<string, any>;
    approvalStatus: ActionApprovalStatus;
    authorizedBy?: string;
  }): AuditLogEntry {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const dataToHash = `${id}|${timestamp}|${params.workflow}|${params.actor}|${params.action}|${JSON.stringify(params.payload)}|${params.approvalStatus}`;
    const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const entry: AuditLogEntry = {
      id,
      timestamp,
      workflow: params.workflow,
      actor: params.actor,
      action: params.action,
      payload: params.payload,
      approvalStatus: params.approvalStatus,
      authorizedBy: params.authorizedBy,
      hash
    };

    this.logs.push(entry);
    return entry;
  }

  public static getLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  public static clearLogs() {
    this.logs = [];
  }
}
