import * as crypto from 'crypto';
import { HitlGate, PendingAction } from '../governance/hitl-gate.js';

export interface SlackBlockKitMessage {
  text: string;
  blocks: Array<{
    type: string;
    text?: { type: string; text: string };
    elements?: Array<{
      type: string;
      text: { type: string; text: string };
      value: string;
      action_id: string;
      style?: 'primary' | 'danger';
    }>;
  }>;
}

export interface SlackSignatureVerifyParams {
  signingSecret: string;
  signatureHeader?: string;
  timestampHeader?: string;
  rawBody: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}

export interface SlackSignatureVerifyResult {
  valid: boolean;
  reason?: string;
}

export interface SlackInteractionCallbackParams {
  signingSecret: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}

export interface SlackInteractionCallbackResult {
  ok: boolean;
  statusCode: number;
  decision?: 'APPROVED' | 'REJECTED';
  actionId?: string;
  reviewer?: string;
  error?: string;
}

function getHeaderCaseInsensitive(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

export class WebhookDispatcher {
  public static readonly DEFAULT_MAX_TIMESTAMP_AGE_SECONDS = 300;

  /**
   * Compute Slack v0 HMAC-SHA256 signature for a timestamp and raw request body.
   */
  public static computeSlackSignature(
    signingSecret: string,
    timestampHeader: string,
    rawBody: string
  ): string {
    const baseString = `v0:${timestampHeader}:${rawBody}`;
    const digest = crypto.createHmac('sha256', signingSecret).update(baseString, 'utf8').digest('hex');
    return `v0=${digest}`;
  }

  /**
   * Verify Slack HMAC-SHA256 request signature and replay protection timestamp.
   */
  public static verifySlackSignature(params: SlackSignatureVerifyParams): SlackSignatureVerifyResult {
    const {
      signingSecret,
      signatureHeader,
      timestampHeader,
      rawBody,
      nowSeconds = Math.floor(Date.now() / 1000),
      maxAgeSeconds = this.DEFAULT_MAX_TIMESTAMP_AGE_SECONDS
    } = params;

    if (!signingSecret) {
      return { valid: false, reason: 'Missing Slack signing secret.' };
    }
    if (!signatureHeader || !timestampHeader) {
      return { valid: false, reason: 'Missing x-slack-signature or x-slack-request-timestamp header.' };
    }
    if (!/^\d+$/.test(timestampHeader.trim())) {
      return { valid: false, reason: 'Invalid x-slack-request-timestamp header format.' };
    }

    const requestTs = Number.parseInt(timestampHeader.trim(), 10);
    if (Math.abs(nowSeconds - requestTs) > maxAgeSeconds) {
      return { valid: false, reason: 'Expired or out-of-window Slack request timestamp.' };
    }

    if (!/^v0=[a-f0-9]{64}$/i.test(signatureHeader.trim())) {
      return { valid: false, reason: 'Malformed x-slack-signature header.' };
    }

    const expected = this.computeSlackSignature(signingSecret, timestampHeader.trim(), rawBody);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return { valid: false, reason: 'Invalid Slack HMAC-SHA256 signature.' };
    }

    return { valid: true };
  }

  /**
   * Verify Slack interaction webhook headers before parsing and applying approve/reject HITL decisions.
   */
  public static handleSlackInteractionCallback(
    params: SlackInteractionCallbackParams
  ): SlackInteractionCallbackResult {
    const signatureHeader = getHeaderCaseInsensitive(params.headers, 'x-slack-signature');
    const timestampHeader = getHeaderCaseInsensitive(params.headers, 'x-slack-request-timestamp');

    const verification = this.verifySlackSignature({
      signingSecret: params.signingSecret,
      signatureHeader,
      timestampHeader,
      rawBody: params.rawBody,
      nowSeconds: params.nowSeconds,
      maxAgeSeconds: params.maxAgeSeconds
    });

    if (!verification.valid) {
      return {
        ok: false,
        statusCode: 401,
        error: verification.reason
      };
    }

    let interaction: any;
    try {
      const trimmed = params.rawBody.trim();
      if (trimmed.startsWith('{')) {
        interaction = JSON.parse(trimmed);
      } else {
        const form = new URLSearchParams(params.rawBody);
        const payloadStr = form.get('payload');
        if (!payloadStr) {
          return { ok: false, statusCode: 400, error: 'Missing interaction payload.' };
        }
        interaction = JSON.parse(payloadStr);
      }
    } catch {
      return { ok: false, statusCode: 400, error: 'Malformed Slack interaction payload.' };
    }

    const rawValue = interaction?.actions?.[0]?.value;
    if (typeof rawValue !== 'string') {
      return { ok: false, statusCode: 400, error: 'Missing Slack action value.' };
    }

    let actionData: { actionId?: string; token?: string; action?: string };
    try {
      actionData = JSON.parse(rawValue);
    } catch {
      return { ok: false, statusCode: 400, error: 'Malformed Slack action value JSON.' };
    }

    const { actionId, token, action } = actionData;
    if (!actionId || !token || (action !== 'APPROVE' && action !== 'REJECT')) {
      return { ok: false, statusCode: 400, error: 'Invalid HITL action payload fields.' };
    }

    const reviewer =
      interaction?.user?.email ||
      interaction?.user?.username ||
      interaction?.user?.id ||
      'slack-reviewer';

    const applied =
      action === 'APPROVE'
        ? HitlGate.authorize(actionId, token, reviewer)
        : HitlGate.reject(actionId, token, reviewer);

    if (!applied) {
      return {
        ok: false,
        statusCode: 403,
        actionId,
        reviewer,
        error: 'Invalid approval token or action is no longer pending.'
      };
    }

    return {
      ok: true,
      statusCode: 200,
      decision: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      actionId,
      reviewer
    };
  }

  /**
   * Format a pending HITL action as an interactive Slack Block Kit notification
   */
  public static buildSlackApprovalCard(action: PendingAction): SlackBlockKitMessage {
    const riskBadge = action.riskLevel === 'HIGH' ? '🚨 *HIGH RISK ACTION*' : '⚠️ *REVIEW REQUIRED*';

    return {
      text: `Action Approval Request: ${action.actionType}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Agent Operations: Approval Required (${action.workflow})`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${riskBadge}\n*Description*: ${action.description}\n*Action ID*: \`${action.actionId}\``
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve & Execute' },
              style: 'primary',
              value: JSON.stringify({ actionId: action.actionId, token: action.approvalToken, action: 'APPROVE' }),
              action_id: 'approve_ops_action'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Reject' },
              style: 'danger',
              value: JSON.stringify({ actionId: action.actionId, token: action.approvalToken, action: 'REJECT' }),
              action_id: 'reject_ops_action'
            }
          ]
        }
      ]
    };
  }
}
