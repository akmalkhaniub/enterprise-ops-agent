import { describe, it, expect, beforeEach } from 'vitest';
import { FinOpsReconciliationAgent } from '../src/workflows/finops-reconciliation.js';
import { HitlGate } from '../src/governance/hitl-gate.js';
import { VendorInvoice, PurchaseOrder } from '../src/types/index.js';

describe('FinOps Reconciliation Workflow', () => {
  beforeEach(() => {
    HitlGate.clear();
  });

  const validPO: PurchaseOrder = {
    poNumber: 'PO-2026-CLOUD',
    vendorName: 'Anthropic PBC',
    approvedBudgetUsd: 10000,
    remainingBudgetUsd: 5000,
    expiryDate: '2026-12-31'
  };

  it('should auto-approve clean invoices under the financial threshold ($500)', () => {
    const smallInvoice: VendorInvoice = {
      invoiceId: 'INV-101',
      vendorName: 'Anthropic PBC',
      billingPeriod: '2026-03',
      totalAmountUsd: 320.00,
      lineItems: [{ description: 'Claude API Usage', amountUsd: 320.00 }]
    };

    const report = FinOpsReconciliationAgent.reconcile(smallInvoice, validPO, 300.00);
    expect(report.status).toBe('RECONCILED');
    expect(report.anomalies).toHaveLength(0);
    expect(report.executionGateStatus).toBe('AUTO_APPROVED');
  });

  it('should flag and hold invoices that exceed remaining PO budget', () => {
    const largeInvoice: VendorInvoice = {
      invoiceId: 'INV-999',
      vendorName: 'Anthropic PBC',
      billingPeriod: '2026-03',
      totalAmountUsd: 7500.00, // Exceeds remaining 5000
      lineItems: [{ description: 'High Volume Inference', amountUsd: 7500.00 }]
    };

    const report = FinOpsReconciliationAgent.reconcile(largeInvoice, validPO, 4000.00);
    expect(report.status).toBe('BUDGET_EXCEEDED');
    expect(report.varianceUsd).toBe(2500.00);
    expect(report.executionGateStatus).toBe('HELD_FOR_REVIEW');
    expect(report.approvalToken).toBeDefined();
  });

  it('should detect anomalous spend spikes above 15% baseline', () => {
    const spikedInvoice: VendorInvoice = {
      invoiceId: 'INV-SPIKE',
      vendorName: 'Anthropic PBC',
      billingPeriod: '2026-03',
      totalAmountUsd: 2500.00,
      lineItems: [{ description: 'Spike in Claude usage', amountUsd: 2500.00 }]
    };

    // Historical average was 1000 -> 2500 is 150% spike
    const report = FinOpsReconciliationAgent.reconcile(spikedInvoice, validPO, 1000.00);
    expect(report.status).toBe('ANOMALOUS_SPIKE');
    expect(report.anomalies.some(a => a.includes('Unusual spend spike'))).toBe(true);
    expect(report.executionGateStatus).toBe('HELD_FOR_REVIEW');
  });
});
