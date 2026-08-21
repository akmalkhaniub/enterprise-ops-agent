import * as crypto from 'crypto';
import { AuditLogger } from './audit-logger.js';

export interface PendingAction {
  actionId: string;
  workflow: 'FINOPS_RECONCILIATION' | 'HR_SCREENING' | 'GENERIC_OPS';
  actionType: string;
  description: string;
  payload: Record<string, any>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  approvalToken: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export class HitlGate {
  private static pendingActions: Map<string, PendingAction> = new Map();
  public static AUTO_APPROVE_FINANCIAL_THRESHOLD_USD = 500.0;

  /**
   * Request execution of an action. Auto-approves low-risk actions; holds high-risk for HITL.
   */
  public static requestAction(params: {
    workflow: 'FINOPS_RECONCILIATION' | 'HR_SCREENING' | 'GENERIC_OPS';
    actionType: string;
    description: string;
    payload: Record<string, any>;
    financialValueUsd?: number;
    forceReview?: boolean;
  }): { status: 'AUTO_APPROVED' | 'HELD_FOR_REVIEW'; actionId: string; approvalToken?: string } {
    const isHighFinancialRisk = (params.financialValueUsd || 0) > this.AUTO_APPROVE_FINANCIAL_THRESHOLD_USD;
    const requiresReview = params.forceReview || isHighFinancialRisk;

    const actionId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    if (!requiresReview) {
      AuditLogger.logAction({
        workflow: params.workflow,
        actor: 'ai-ops-agent',
        action: params.actionType,
        payload: params.payload,
        approvalStatus: 'AUTO_EXECUTED'
      });
      return { status: 'AUTO_APPROVED', actionId };
    }

    // High risk action held for HITL
    const approvalToken = crypto.randomBytes(16).toString('hex');
    const pendingAction: PendingAction = {
      actionId,
      workflow: params.workflow,
      actionType: params.actionType,
      description: params.description,
      payload: params.payload,
      riskLevel: isHighFinancialRisk ? 'HIGH' : 'MEDIUM',
      approvalToken,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    this.pendingActions.set(actionId, pendingAction);

    AuditLogger.logAction({
      workflow: params.workflow,
      actor: 'ai-ops-agent',
      action: params.actionType,
      payload: params.payload,
      approvalStatus: 'PENDING_APPROVAL'
    });

    return {
      status: 'HELD_FOR_REVIEW',
      actionId,
      approvalToken
    };
  }

  /**
   * Authorize a pending action using the cryptographic token
   */
  public static authorize(actionId: string, token: string, reviewerEmail: string): boolean {
    const pending = this.pendingActions.get(actionId);
    if (!pending || pending.status !== 'PENDING') {
      return false;
    }

    if (pending.approvalToken !== token) {
      return false;
    }

    pending.status = 'APPROVED';

    AuditLogger.logAction({
      workflow: pending.workflow,
      actor: 'ai-ops-agent',
      action: `${pending.actionType}_AUTHORIZED`,
      payload: pending.payload,
      approvalStatus: 'APPROVED',
      authorizedBy: reviewerEmail
    });

    return true;
  }

  public static getPendingActions(): PendingAction[] {
    return Array.from(this.pendingActions.values()).filter(a => a.status === 'PENDING');
  }

  public static clear() {
    this.pendingActions.clear();
  }
}
