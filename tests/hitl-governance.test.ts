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

  it('should verify valid Slack HMAC-SHA256 signatures and process approve/reject callbacks', () => {
    const signingSecret = 'test-slack-signing-secret';
    const nowSeconds = 1_760_000_000;
    const req1 = HitlGate.requestAction({
      workflow: 'FINOPS_RECONCILIATION',
      actionType: 'APPROVE_VENDOR_PAYMENT',
      description: 'Approve cloud invoice',
      payload: { invoiceId: 'INV-900' },
      financialValueUsd: 1800
    });

    const card1 = WebhookDispatcher.buildSlackApprovalCard(req1 && {
      actionId: req1.actionId,
      workflow: 'FINOPS_RECONCILIATION',
      actionType: 'APPROVE_VENDOR_PAYMENT',
      description: 'Approve cloud invoice',
      payload: { invoiceId: 'INV-900' },
      riskLevel: 'HIGH',
      approvalToken: req1.approvalToken!,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    });
    const approveValue = card1.blocks[2].elements![0].value;
    const rawJsonBody = JSON.stringify({
      user: { id: 'U123', email: 'cfo@company.com' },
      actions: [{ action_id: 'approve_ops_action', value: approveValue }]
    });
    const ts = String(nowSeconds - 30);
    const sig = WebhookDispatcher.computeSlackSignature(signingSecret, ts, rawJsonBody);

    const approveResult = WebhookDispatcher.handleSlackInteractionCallback({
      signingSecret,
      headers: {
        'X-Slack-Signature': sig,
        'X-Slack-Request-Timestamp': ts
      },
      rawBody: rawJsonBody,
      nowSeconds
    });

    expect(approveResult.ok).toBe(true);
    expect(approveResult.statusCode).toBe(200);
    expect(approveResult.decision).toBe('APPROVED');
    expect(approveResult.reviewer).toBe('cfo@company.com');
    expect(HitlGate.getPendingActions()).toHaveLength(0);

    // Also test Slack form-urlencoded REJECT button callback
    const req2 = HitlGate.requestAction({
      workflow: 'HR_SCREENING',
      actionType: 'SEND_OFFER_LETTER',
      description: 'Candidate offer letter',
      payload: { candidateId: 'cand-2' },
      forceReview: true
    });
    const rejectPayload = JSON.stringify({
      user: { id: 'U456', username: 'vp.people' },
      actions: [
        {
          action_id: 'reject_ops_action',
          value: JSON.stringify({ actionId: req2.actionId, token: req2.approvalToken, action: 'REJECT' })
        }
      ]
    });
    const formBody = new URLSearchParams({ payload: rejectPayload }).toString();
    const sig2 = WebhookDispatcher.computeSlackSignature(signingSecret, ts, formBody);

    const rejectResult = WebhookDispatcher.handleSlackInteractionCallback({
      signingSecret,
      headers: {
        'x-slack-signature': sig2,
        'x-slack-request-timestamp': ts
      },
      rawBody: formBody,
      nowSeconds
    });

    expect(rejectResult.ok).toBe(true);
    expect(rejectResult.decision).toBe('REJECTED');
    const logs = AuditLogger.getLogs();
    expect(logs[logs.length - 1].approvalStatus).toBe('REJECTED');
    expect(logs[logs.length - 1].authorizedBy).toBe('vp.people');
  });

  it('should reject Slack HITL callbacks with invalid, tampered, missing, or expired HMAC signatures', () => {
    const signingSecret = 'test-slack-signing-secret';
    const nowSeconds = 1_760_000_000;
    const req = HitlGate.requestAction({
      workflow: 'FINOPS_RECONCILIATION',
      actionType: 'APPROVE_VENDOR_PAYMENT',
      description: 'High risk wire',
      payload: { amount: 5000 },
      financialValueUsd: 5000
    });

    const rawBody = JSON.stringify({
      user: { email: 'attacker@evil.test' },
      actions: [{ value: JSON.stringify({ actionId: req.actionId, token: req.approvalToken, action: 'APPROVE' }) }]
    });
    const freshTs = String(nowSeconds - 10);
    const validSig = WebhookDispatcher.computeSlackSignature(signingSecret, freshTs, rawBody);

    // 1. Invalid signature
    const badSig = WebhookDispatcher.handleSlackInteractionCallback({
      signingSecret,
      headers: { 'x-slack-signature': 'v0=' + '0'.repeat(64), 'x-slack-request-timestamp': freshTs },
      rawBody,
      nowSeconds
    });
    expect(badSig.ok).toBe(false);
    expect(badSig.statusCode).toBe(401);

    // 2. Tampered body
    const tampered = WebhookDispatcher.handleSlackInteractionCallback({
      signingSecret,
      headers: { 'x-slack-signature': validSig, 'x-slack-request-timestamp': freshTs },
      rawBody: rawBody.replace('attacker@evil.test', 'admin@evil.test'),
      nowSeconds
    });
    expect(tampered.ok).toBe(false);
    expect(tampered.statusCode).toBe(401);

    // 3. Expired timestamp (> 300s old)
    const expiredTs = String(nowSeconds - 301);
    const expiredSig = WebhookDispatcher.computeSlackSignature(signingSecret, expiredTs, rawBody);
    const expired = WebhookDispatcher.handleSlackInteractionCallback({
      signingSecret,
      headers: { 'x-slack-signature': expiredSig, 'x-slack-request-timestamp': expiredTs },
      rawBody,
      nowSeconds
    });
    expect(expired.ok).toBe(false);
    expect(expired.statusCode).toBe(401);

    // 4. Missing headers
    const missing = WebhookDispatcher.handleSlackInteractionCallback({
      signingSecret,
      headers: {},
      rawBody,
      nowSeconds
    });
    expect(missing.ok).toBe(false);
    expect(missing.statusCode).toBe(401);

    // Action must remain PENDING
    expect(HitlGate.getPendingActions()).toHaveLength(1);
  });
});
