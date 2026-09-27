import { BadGatewayException } from '@nestjs/common';

// This catalog is executable policy, not editable Skill text. Model output may
// select only a registered name; every implementation still re-authorizes the
// current actor and resource at the point of use.
export const agentToolRegistry = {
  'schedule.list': {
    version: 'v1',
    risk: 'READ',
    permission: 'schedule.read',
    confirmation: 'NONE',
  },
  'schedule.match': {
    version: 'v1',
    risk: 'READ',
    permission: 'schedule.read',
    confirmation: 'NONE',
  },
  'schedule.requirements.collect': {
    version: 'v1',
    risk: 'REQUIREMENTS',
    permission: 'event.operations',
    confirmation: 'SEPARATE_REQUIREMENTS_BUTTON',
  },
  'schedule.candidate.preview': {
    version: 'v1',
    risk: 'PREVIEW',
    permission: 'event.operations',
    confirmation: 'NONE',
  },
  'schedule.adjust.preview': {
    version: 'v1',
    risk: 'PREVIEW',
    permission: 'schedule.read',
    confirmation: 'NONE',
  },
  'schedule.draft.adjust': {
    version: 'v1',
    risk: 'DRAFT_WRITE',
    permission: 'schedule.draft.adjust',
    confirmation: 'BOUND_TICKET_BUTTON',
  },
  'schedule.draft.generate': {
    version: 'v1',
    risk: 'DRAFT_WRITE',
    permission: 'schedule.draft.generate',
    confirmation: 'BOUND_TICKET_BUTTON',
  },
} as const;

export type AgentToolName = keyof typeof agentToolRegistry;
export function requireAgentTool(name: string, risk: string) {
  const tool = agentToolRegistry[name as AgentToolName];
  if (!tool || tool.risk !== risk)
    throw new BadGatewayException(
      'Tool proposal is not registered for this action',
    );
  return tool;
}

export function agentToolCatalog() {
  return Object.entries(agentToolRegistry).map(([name, value]) => ({
    name,
    ...value,
  }));
}
