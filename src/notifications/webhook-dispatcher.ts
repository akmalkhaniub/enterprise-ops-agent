import { PendingAction } from '../governance/hitl-gate.js';

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

export class WebhookDispatcher {
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
