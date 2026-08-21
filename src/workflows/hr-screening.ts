import { CandidateProfile, JobRequirement } from '../types/index.js';
import { HitlGate } from '../governance/hitl-gate.js';

export interface CandidateScreeningResult {
  candidateId: string;
  sanitizedResumeText: string;
  matchScore: number; // 0 - 100
  qualified: boolean;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  experienceDeltaYears: number;
  recommendation: 'STRONG_MATCH' | 'POTENTIAL_MATCH' | 'UNQUALIFIED';
  draftOfferText?: string;
  executionGateStatus: 'AUTO_APPROVED' | 'HELD_FOR_REVIEW';
  actionId: string;
}

export class HrScreeningAgent {
  /**
   * Screen a candidate resume against job requirements with PII redaction and skills matching
   */
  public static screenCandidate(candidate: CandidateProfile, job: JobRequirement): CandidateScreeningResult {
    // 1. Redact PII (emails, phone numbers) for unbiased initial review
    const sanitizedResumeText = candidate.rawResumeText
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/\+?(\d{1,3})?[-. ]?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g, '[REDACTED_PHONE]');

    // 2. Evaluate Experience & Skills
    const candidateSkillsLower = candidate.skills.map(s => s.toLowerCase());
    const matchedSkills: string[] = [];
    const missingRequiredSkills: string[] = [];

    for (const req of job.requiredSkills) {
      if (candidateSkillsLower.some(s => s.includes(req.toLowerCase()) || req.toLowerCase().includes(s))) {
        matchedSkills.push(req);
      } else {
        missingRequiredSkills.push(req);
      }
    }

    const expDelta = candidate.yearsOfExperience - job.minYearsExperience;
    const skillMatchRatio = job.requiredSkills.length > 0 ? matchedSkills.length / job.requiredSkills.length : 1.0;
    const expScore = Math.min(1.0, Math.max(0.0, 1.0 + (expDelta * 0.1)));

    const matchScore = Math.round(((skillMatchRatio * 0.7) + (expScore * 0.3)) * 100);
    const qualified = missingRequiredSkills.length === 0 && expDelta >= 0;

    let recommendation: CandidateScreeningResult['recommendation'] = 'UNQUALIFIED';
    if (matchScore >= 85) {
      recommendation = 'STRONG_MATCH';
    } else if (matchScore >= 65) {
      recommendation = 'POTENTIAL_MATCH';
    }

    // 3. Draft Offer Template if Strong Match
    let draftOfferText: string | undefined;
    if (recommendation === 'STRONG_MATCH') {
      const midpointSalary = (job.budgetMinUsd + job.budgetMaxUsd) / 2;
      draftOfferText = `Dear ${candidate.name},\n\nWe are pleased to extend an offer for the position of ${job.roleTitle} at Conrad Labs. Your starting base compensation will be $${midpointSalary.toLocaleString()} USD annually.\n\nWelcome to the team!`;
    }

    // 4. HITL Governance Gate for Candidate Status Transitions
    const gateResult = HitlGate.requestAction({
      workflow: 'HR_SCREENING',
      actionType: 'ADVANCE_CANDIDATE_STAGE',
      description: `Advance candidate ${candidate.name} for ${job.roleTitle} (Score: ${matchScore}%)`,
      payload: {
        candidateId: candidate.candidateId,
        matchScore,
        recommendation,
        qualified
      },
      forceReview: true // HR status updates always require human confirmation
    });

    return {
      candidateId: candidate.candidateId,
      sanitizedResumeText,
      matchScore,
      qualified,
      matchedSkills,
      missingRequiredSkills,
      experienceDeltaYears: expDelta,
      recommendation,
      draftOfferText,
      executionGateStatus: gateResult.status,
      actionId: gateResult.actionId
    };
  }
}
