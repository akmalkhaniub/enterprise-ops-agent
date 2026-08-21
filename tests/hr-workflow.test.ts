import { describe, it, expect, beforeEach } from 'vitest';
import { HrScreeningAgent } from '../src/workflows/hr-screening.js';
import { HitlGate } from '../src/governance/hitl-gate.js';
import { CandidateProfile, JobRequirement } from '../src/types/index.js';

describe('HR Candidate Screening Workflow', () => {
  beforeEach(() => {
    HitlGate.clear();
  });

  const jobReq: JobRequirement = {
    jobId: 'JOB-AI-LEAD',
    roleTitle: 'Senior AI Platform Engineer',
    minYearsExperience: 5,
    requiredSkills: ['TypeScript', 'Model Context Protocol', 'Drizzle', 'Claude API'],
    niceToHaveSkills: ['Turborepo', 'Kubernetes'],
    budgetMinUsd: 120000,
    budgetMaxUsd: 160000
  };

  it('should sanitize PII and qualify strong candidates with draft offers', () => {
    const candidate: CandidateProfile = {
      candidateId: 'CAND-001',
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      rawResumeText: 'Contact: jane.doe@example.com, Phone: +1-555-019-2834. 6 years experience in TypeScript, Model Context Protocol, Drizzle, and Claude API.',
      yearsOfExperience: 6,
      skills: ['TypeScript', 'Model Context Protocol', 'Drizzle', 'Claude API', 'Turborepo']
    };

    const result = HrScreeningAgent.screenCandidate(candidate, jobReq);

    // Verify PII is redacted
    expect(result.sanitizedResumeText).toContain('[REDACTED_EMAIL]');
    expect(result.sanitizedResumeText).toContain('[REDACTED_PHONE]');
    expect(result.sanitizedResumeText).not.toContain('jane.doe@example.com');

    // Verify qualification
    expect(result.qualified).toBe(true);
    expect(result.recommendation).toBe('STRONG_MATCH');
    expect(result.matchScore).toBeGreaterThanOrEqual(85);
    expect(result.draftOfferText).toContain('Senior AI Platform Engineer at Conrad Labs');
    expect(result.draftOfferText).toContain('$140,000'); // Midpoint
    expect(result.executionGateStatus).toBe('HELD_FOR_REVIEW');
  });

  it('should flag under-qualified candidates missing required skills', () => {
    const candidate: CandidateProfile = {
      candidateId: 'CAND-002',
      name: 'Bob Smith',
      email: 'bob@example.com',
      rawResumeText: 'Junior dev with 2 years of Python experience.',
      yearsOfExperience: 2,
      skills: ['Python', 'Django']
    };

    const result = HrScreeningAgent.screenCandidate(candidate, jobReq);
    expect(result.qualified).toBe(false);
    expect(result.recommendation).toBe('UNQUALIFIED');
    expect(result.missingRequiredSkills.length).toBeGreaterThan(0);
    expect(result.draftOfferText).toBeUndefined();
  });
});
