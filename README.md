# 🏢 Enterprise Ops Agent

> **Production Non-Engineering Agentic Workflows for HR Operations, FinOps Invoice Reconciliation, and Human-in-the-Loop Governance.**

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![FinOps](https://img.shields.io/badge/FinOps-Automated_Reconciliation-0284c7)
![HR Ops](https://img.shields.io/badge/HR_Ops-PII_Masked_Screening-10b981)
![HITL](https://img.shields.io/badge/HITL-Cryptographic_Auth-7c3aed)
![Vitest](https://img.shields.io/badge/Vitest-Passing-729b1b)

---

## 🌟 Overview

Built directly to fulfill the cross-functional requirement in Conrad Labs' AI-First Operating Model:
> *"partner with Operations to bring agentic workflows to non-engineering functions like HR and Finance"*

---

## 🛠️ Workflows & Capabilities

### 1. 💰 FinOps Cloud Spend & Invoice Reconciliation
- Ingests cloud vendor invoices (AWS, Anthropic, OpenAI, Datadog).
- Matches against active Purchase Orders (PO) and calculates budget variance.
- Detects anomalous spend spikes (>15% increase MoM).
- Low financial risk (<= $500) is auto-approved; high amounts (> $500) trigger human approval workflows.

### 2. 👥 People Operations & HR Candidate Screening
- Evaluates candidate experience and skills against job requirement matrices.
- Anonymizes PII (emails, phone numbers) before review to prevent demographic bias.
- Generates structured match scoring (0-100%) and drafts personalized offer letters for qualified candidates.

### 3. 🔐 Human-in-the-Loop (HITL) Governance & Tamper-Evident Audit Trail
- Cryptographically signed tokens for approving sensitive budget disbursements or candidate status transitions.
- Generates interactive **Slack Block Kit** approval cards.
- SHA-256 hash-chained audit logging for regulatory compliance.

---

## 🚀 Quickstart & Testing

```bash
# Install dependencies
npm install

# Run unit & integration test suites
npm test
```
