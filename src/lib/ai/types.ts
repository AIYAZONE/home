export type CopilotCard =
  | { type: 'navigate'; label: string; description?: string; payload: { href: string } & Record<string, unknown> }
  | { type: 'open_modal'; label: string; description?: string; payload: { modal: string; draftId?: string } & Record<string, unknown> }
  | { type: 'apply_draft'; label: string; description?: string; payload: { draftId: string } & Record<string, unknown> }
  | { type: 'open_inbox'; label: string; description?: string; payload: { href?: string } & Record<string, unknown> }
  | { type: 'copy_text'; label: string; description?: string; payload: { text: string } & Record<string, unknown> };

export type CopilotDraftKind = 'transaction' | 'transaction_import' | 'budget_adjustment' | 'health_action_plan' | 'health_metric' | 'action_item';

export type CopilotDraft = {
  draftId: string;
  kind: CopilotDraftKind;
  title: string;
  data: Record<string, unknown>;
  requiresConfirm: true;
};

export type CopilotResponse = {
  summary: string;
  cards: CopilotCard[];
  drafts?: CopilotDraft[];
  warnings?: string[];
  meta?: { traceId: string; toolId?: string; confidence?: number };
};

export type CopilotChatRequest = {
  message: string;
  module?: string;
  page?: string;
  context?: Record<string, unknown>;
};

