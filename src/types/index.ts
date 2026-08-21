export type ActionApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'AUTO_EXECUTED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  workflow: 'FINOPS_RECONCILIATION' | 'HR_SCREENING' | 'GENERIC_OPS';
  actor: string;
  action: string;
  payload: Record<string, any>;
  approvalStatus: ActionApprovalStatus;
  authorizedBy?: string;
  hash: string;
}

export interface VendorInvoice {
  invoiceId: string;
  vendorName: string;
  billingPeriod: string;
  totalAmountUsd: number;
  lineItems: Array<{
    description: string;
    amountUsd: number;
  }>;
}

export interface PurchaseOrder {
  poNumber: string;
  vendorName: string;
  approvedBudgetUsd: number;
  remainingBudgetUsd: number;
  expiryDate: string;
}

export interface CandidateProfile {
  candidateId: string;
  name: string;
  email: string;
  rawResumeText: string;
  yearsOfExperience: number;
  skills: string[];
}

export interface JobRequirement {
  jobId: string;
  roleTitle: string;
  minYearsExperience: number;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  budgetMinUsd: number;
  budgetMaxUsd: number;
}
