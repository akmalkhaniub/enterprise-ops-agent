# Google Cloud Professional Agentic Architect: Production Improvement Plan
## Repository: enterprise-ops-agent
**Audit Date:** November 6, 2026  
**Target Standard:** Google Cloud Professional Agentic Architect (Domain 5: Securing and Governing Agentic Workflows)

---

### Current Assessment
Delivers cross-functional enterprise workflows for Finance (cloud invoice & PO reconciliation with >15% spend anomaly detection) and HR (PII-masked resume screening & offer drafting) protected by cryptographic Human-In-The-Loop (HITL) authorization and Slack Block Kit cards.

### Critical Gaps
1. **Lacks Model Armor Integration:** Inbound prompts and candidate resumes are processed without inline Google Cloud Model Armor filtering to defend against indirect prompt injections hidden in submitted PDF resumes.
2. **Missing Database Row-Level Security (RLS) Propagation:** The agent queries financial databases using a service account identity rather than propagating the invoking employee's user-delegated OAuth token down to BigQuery.
3. **Monolithic Multi-Domain Topology:** Finance and HR are handled in a single monolithic prompt rather than decomposed into specialized peer sub-agents via the Agent-to-Agent (A2A) protocol.

---

### Actionable Implementation Steps

#### 1. Implement Model Armor for Indirect Prompt Injection Defense
Screen resumes and invoice attachments for malicious adversarial instructions:
```python
from google.cloud import modelarmor_v1

def audit_document_with_model_armor(extracted_text: str):
    client = modelarmor_v1.ModelArmorClient()
    template = "projects/enterprise-ops/locations/global/templates/resume-sanitizer"
    res = client.sanitize_user_prompt(name=template, user_prompt_data={"text": extracted_text})
    if res.sanitization_result.filter_match_state.is_matched:
        raise SecurityException("Prompt Injection / Malicious Instruction Detected in Uploaded Document.")
```

#### 2. Configure BigQuery Row-Level Security (RLS) Identity Propagation
Pass the invoking employee's OAuth JWT token to BigQuery connections so that row-level security (`SESSION_USER()`) restricts finance data automatically based on employee authorization.

#### 3. Decompose into Autonomous A2A Peer Agents
Split into two distinct agents:
* `FinanceReconciliationAgent` (Financial spend & invoice audit)
* `TalentOperationsAgent` (HR candidate triage)
Connect both through an A2A orchestrator utilizing cryptographically signed task delegation tokens.

#### 4. Audit Log Archival in Cloud Audit Logs
Export all HITL approval decisions and digital signatures into immutable Cloud Audit Logs to satisfy SOC2 compliance standards.
