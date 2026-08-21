import { describe, it, expect, beforeEach } from 'vitest';
import { HitlGate } from '../src/governance/hitl-gate.js';
import { AuditLogger } from '../src/governance/audit-logger.js';
import { WebhookDispatcher } from '../src/notifications/webhook-dispatcher.js';

describe('Human-in-the-Loop (HITL) Governance & Audit Suite', () => {
  beforeEach(() => {
    HitlGate.clear();
    AuditLogger.clearLogs();
  });

  it('should generate approval token for high risk financial action and allow authorized execution', () => {
    const request = HitlGate.requestAction({
      workflow: 'FINOPS_RECONCILIATION',
      actionType: 'APPROVE_VENDOR_PAYMENT',
      description: 'Vendor payment for $2,500',
      payload: { vendor: 'Datadog', amount: 2500 },
      financialValueUsd: 2500
    });

    expect(request.status).toBe('HELD_FOR_REVIEW');
    expect(request.approvalToken).toBeDefined();

    const pending = HitlGate.getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].riskLevel).toBe('HIGH');

    // Test Slack webhook card builder
    const slackCard = WebhookDispatcher.buildSlackApprovalCard(pending[0]);
    expect(slackCard.text).toContain('APPROVE_VENDOR_PAYMENT');
    expect(slackCard.blocks.length).toBeGreaterThanOrEqual(3);

    // Authorize with valid token
    const success = HitlGate.authorize(request.actionId, request.approvalToken!, 'finance.manager@conradlabs.com');
    expect(success).toBe(true);

    // Verify audit logs contain cryptographic hash
    const logs = AuditLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[logs.length - 1].approvalStatus).toBe('APPROVED');
    expect(logs[logs.length - 1].authorizedBy).toBe('finance.manager@conradlabs.com');
    expect(logs[logs.length - 1].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should reject authorization with invalid token', () => {
    const request = HitlGate.requestAction({
      workflow: 'HR_SCREENING',
      actionType: 'SEND_OFFER_LETTER',
      description: 'Send candidate offer',
      payload: { candidateId: '123' },
      forceReview: true
    });

    const success = HitlGate.authorize(request.actionId, 'wrong-invalid-token', 'hr@conradlabs.com');
    expect(success).toBe(false);
  });
});
