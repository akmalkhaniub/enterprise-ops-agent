import { VendorInvoice, PurchaseOrder } from '../types/index.js';
import { HitlGate } from '../governance/hitl-gate.js';

export interface ReconciliationReport {
  invoiceId: string;
  vendorName: string;
  invoiceAmountUsd: number;
  matchedPoNumber?: string;
  status: 'RECONCILED' | 'DISCREPANCY_DETECTED' | 'BUDGET_EXCEEDED' | 'ANOMALOUS_SPIKE';
  varianceUsd: number;
  variancePercentage: number;
  anomalies: string[];
  executionGateStatus: 'AUTO_APPROVED' | 'HELD_FOR_REVIEW';
  actionId: string;
  approvalToken?: string;
}

export class FinOpsReconciliationAgent {
  /**
   * Reconcile an incoming vendor invoice against a purchase order and historical baseline
   */
  public static reconcile(
    invoice: VendorInvoice,
    purchaseOrder?: PurchaseOrder,
    historicalAvgMoMUsd?: number
  ): ReconciliationReport {
    const anomalies: string[] = [];
    let status: ReconciliationReport['status'] = 'RECONCILED';
    let varianceUsd = 0;
    let variancePercentage = 0;

    // 1. PO Validation
    if (!purchaseOrder) {
      anomalies.push(`No active Purchase Order found for vendor '${invoice.vendorName}'.`);
      status = 'DISCREPANCY_DETECTED';
    } else {
      if (invoice.totalAmountUsd > purchaseOrder.remainingBudgetUsd) {
        varianceUsd = invoice.totalAmountUsd - purchaseOrder.remainingBudgetUsd;
        variancePercentage = purchaseOrder.remainingBudgetUsd > 0
          ? Number(((varianceUsd / purchaseOrder.remainingBudgetUsd) * 100).toFixed(2))
          : 100;
        anomalies.push(`Invoice total ($${invoice.totalAmountUsd}) exceeds remaining PO budget ($${purchaseOrder.remainingBudgetUsd}) by $${varianceUsd}.`);
        status = 'BUDGET_EXCEEDED';
      }
    }

    // 2. Historical Spend Anomaly Detection (> 15% increase)
    if (historicalAvgMoMUsd && historicalAvgMoMUsd > 0) {
      const spendDiff = invoice.totalAmountUsd - historicalAvgMoMUsd;
      const spikePercentage = (spendDiff / historicalAvgMoMUsd) * 100;
      if (spikePercentage > 15.0) {
        anomalies.push(`Unusual spend spike: Invoice is ${spikePercentage.toFixed(1)}% above 3-month baseline ($${historicalAvgMoMUsd}).`);
        if (status === 'RECONCILED') {
          status = 'ANOMALOUS_SPIKE';
        }
      }
    }

    // 3. Dispatch through HITL Gate
    const gateResult = HitlGate.requestAction({
      workflow: 'FINOPS_RECONCILIATION',
      actionType: 'APPROVE_VENDOR_PAYMENT',
      description: `Payment approval for ${invoice.vendorName} (Invoice ${invoice.invoiceId})`,
      payload: {
        invoiceId: invoice.invoiceId,
        vendor: invoice.vendorName,
        amount: invoice.totalAmountUsd,
        status,
        anomalies
      },
      financialValueUsd: invoice.totalAmountUsd,
      forceReview: anomalies.length > 0
    });

    return {
      invoiceId: invoice.invoiceId,
      vendorName: invoice.vendorName,
      invoiceAmountUsd: invoice.totalAmountUsd,
      matchedPoNumber: purchaseOrder?.poNumber,
      status,
      varianceUsd,
      variancePercentage,
      anomalies,
      executionGateStatus: gateResult.status,
      actionId: gateResult.actionId,
      approvalToken: gateResult.approvalToken
    };
  }
}
