# AGENTS.md — Autonomous Agent Operating Contract

## 🎯 Repository Purpose & Architecture
`enterprise-ops-agent` delivers cross-functional agentic workflows for Finance (cloud invoice & PO reconciliation with spend anomaly detection) and HR (PII-masked resume screening & automated offer drafting) protected by cryptographic Human-In-The-Loop (HITL) authorization and Slack Block Kit cards.

### Tech Stack
- **Language**: TypeScript / Node.js
- **Testing**: Vitest
- **Key Modules**: `src/finops/`, `src/hr/`, `src/governance/`

---

## ⚡ Autonomous Execution Protocol
1. Pull task from `TASKS.json`.
2. Adhere to cryptographic authorization tokens and strict schema validations.
3. Run verification: `npm test`.
4. Commit with: `feat(task-id): description`.
