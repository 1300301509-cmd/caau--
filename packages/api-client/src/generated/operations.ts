/** Generated from the Nest OpenAPI contract. DO NOT EDIT. */
export const operations = {
  getSecurityAudit: {
    path: '/api/v1/authorization/audit',
    method: 'GET',
    responses: {
      '200': {
        items: {
          properties: {
            action: { type: 'string' },
            actorId: { nullable: true, type: 'string' },
            context: {
              additionalProperties: true,
              type: 'object',
              properties: {},
            },
            id: { format: 'uuid', type: 'string' },
            occurredAt: { format: 'date-time', type: 'string' },
            outcome: { type: 'string' },
            requestId: { format: 'uuid', type: 'string' },
            resourceId: { nullable: true, type: 'string' },
          },
          required: [
            'context',
            'id',
            'occurredAt',
            'actorId',
            'action',
            'resourceId',
            'outcome',
            'requestId',
          ],
          type: 'object',
        },
        type: 'array',
      },
    },
    parameters: [],
    body: null,
    authenticated: true,
  },
  createEventGrant: {
    path: '/api/v1/authorization/event-grants',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: {
      properties: {
        eventId: { format: 'uuid', type: 'string' },
        memberId: { format: 'uuid', type: 'string' },
      },
      required: ['eventId', 'memberId'],
      type: 'object',
    },
    authenticated: true,
  },
  deleteEventGrant: {
    path: '/api/v1/authorization/event-grants/{id}',
    method: 'DELETE',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: null,
    authenticated: true,
  },
  createEventScope: {
    path: '/api/v1/authorization/event-scopes',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: null,
    authenticated: true,
  },
  getEventScope: {
    path: '/api/v1/authorization/event-scopes/{id}',
    method: 'GET',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: null,
    authenticated: true,
  },
  logout: {
    path: '/api/v1/authorization/logout',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: null,
    authenticated: true,
  },
  getIdentity: {
    path: '/api/v1/authorization/me',
    method: 'GET',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: null,
    authenticated: true,
  },
  createOrganizationMember: {
    path: '/api/v1/authorization/members',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: {
      properties: {
        organizationId: { format: 'uuid', type: 'string' },
        role: {
          enum: ['EVENT_MANAGER', 'ORGANIZER', 'REVIEWER', 'SYSTEM_ADMIN'],
          type: 'string',
        },
        userId: { format: 'uuid', type: 'string' },
      },
      required: ['userId', 'organizationId', 'role'],
      type: 'object',
    },
    authenticated: true,
  },
  setMemberActive: {
    path: '/api/v1/authorization/members/{id}',
    method: 'PATCH',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: {
      properties: { active: { type: 'boolean' } },
      required: ['active'],
      type: 'object',
    },
    authenticated: true,
  },
  createOrganization: {
    path: '/api/v1/authorization/organizations',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: {
      properties: { name: { maxLength: 120, type: 'string' } },
      required: ['name'],
      type: 'object',
    },
    authenticated: true,
  },
  createTaskScope: {
    path: '/api/v1/authorization/task-scopes',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: {
      properties: {
        eventId: { format: 'uuid', type: 'string' },
        handlerGrantId: { format: 'uuid', type: 'string' },
      },
      required: ['eventId', 'handlerGrantId'],
      type: 'object',
    },
    authenticated: true,
  },
  getTaskScope: {
    path: '/api/v1/authorization/task-scopes/{id}',
    method: 'GET',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: null,
    authenticated: true,
  },
  checkTaskAccess: {
    path: '/api/v1/authorization/task-scopes/{id}/access',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: {
      properties: {
        action: {
          enum: ['task.read', 'content.write', 'review', 'file.download'],
          type: 'string',
        },
      },
      required: ['action'],
      type: 'object',
    },
    authenticated: true,
  },
  assignTaskReviewer: {
    path: '/api/v1/authorization/task-scopes/{id}/reviewer',
    method: 'PATCH',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: {
      properties: {
        reviewerGrantId: { format: 'uuid', nullable: true, type: 'string' },
      },
      required: ['reviewerGrantId'],
      type: 'object',
    },
    authenticated: true,
  },
  createInternalUser: {
    path: '/api/v1/authorization/users',
    method: 'POST',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [],
    body: {
      properties: { displayName: { maxLength: 80, type: 'string' } },
      required: ['displayName'],
      type: 'object',
    },
    authenticated: true,
  },
  setUserActive: {
    path: '/api/v1/authorization/users/{id}',
    method: 'PATCH',
    responses: {
      '200': {
        properties: { id: { format: 'uuid', type: 'string' } },
        required: ['id'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: {
      properties: { active: { type: 'boolean' } },
      required: ['active'],
      type: 'object',
    },
    authenticated: true,
  },
  getHealth: {
    path: '/api/v1/health',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          service: { enum: ['caau-api'], type: 'string' },
          status: { enum: ['ok'], type: 'string' },
        },
        required: ['status', 'service'],
        type: 'object',
      },
    },
    parameters: [],
    body: null,
    authenticated: false,
  },
  getReadiness: {
    path: '/api/v1/ready',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          service: { enum: ['caau-api'], type: 'string' },
          status: { enum: ['ready'], type: 'string' },
        },
        required: ['status', 'service'],
        type: 'object',
      },
      '503': {
        properties: {
          code: { enum: ['DATABASE_UNAVAILABLE'], type: 'string' },
          service: { enum: ['caau-api'], type: 'string' },
          status: { enum: ['not_ready'], type: 'string' },
        },
        required: ['status', 'service', 'code'],
        type: 'object',
      },
    },
    parameters: [],
    body: null,
    authenticated: false,
  },
} as const;
