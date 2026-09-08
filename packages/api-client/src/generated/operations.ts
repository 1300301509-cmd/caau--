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
  listEvents: {
    path: '/api/v1/events',
    method: 'GET',
    responses: {
      '200': {
        items: {
          properties: {
            createdAt: { format: 'date-time', type: 'string' },
            description: { maxLength: 2000, type: 'string' },
            id: { format: 'uuid', type: 'string' },
            name: { maxLength: 120, type: 'string' },
          },
          required: ['name', 'description', 'id', 'createdAt'],
          type: 'object',
        },
        type: 'array',
      },
    },
    parameters: [],
    body: null,
    authenticated: true,
  },
  createEvent: {
    path: '/api/v1/events',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          createdAt: { format: 'date-time', type: 'string' },
          description: { maxLength: 2000, type: 'string' },
          id: { format: 'uuid', type: 'string' },
          name: { maxLength: 120, type: 'string' },
        },
        required: ['name', 'description', 'id', 'createdAt'],
        type: 'object',
      },
    },
    parameters: [],
    body: {
      properties: {
        description: { maxLength: 2000, type: 'string' },
        name: { maxLength: 120, type: 'string' },
      },
      required: ['name', 'description'],
      type: 'object',
    },
    authenticated: true,
  },
  getEvent: {
    path: '/api/v1/events/{id}',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          createdAt: { format: 'date-time', type: 'string' },
          description: { maxLength: 2000, type: 'string' },
          id: { format: 'uuid', type: 'string' },
          name: { maxLength: 120, type: 'string' },
        },
        required: ['name', 'description', 'id', 'createdAt'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: null,
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
  listMaterialTasks: {
    path: '/api/v1/material-tasks',
    method: 'GET',
    responses: {
      '200': {
        items: {
          properties: {
            eventId: { format: 'uuid', type: 'string' },
            handlerMemberId: { format: 'uuid', type: 'string' },
            id: { format: 'uuid', type: 'string' },
            organizationId: { format: 'uuid', type: 'string' },
            publishedAt: {
              format: 'date-time',
              nullable: true,
              type: 'string',
            },
            requirementVersion: { nullable: true, type: 'integer' },
            requirements: {
              allOf: [{ $ref: '#/components/schemas/RequirementsDto' }],
              nullable: true,
              type: 'object',
              properties: {},
            },
            reviewerMemberId: { format: 'uuid', type: 'string' },
            revision: { type: 'integer' },
            state: { enum: ['DRAFT', 'PUBLISHED'], type: 'string' },
            title: { maxLength: 160, type: 'string' },
          },
          required: [
            'organizationId',
            'handlerMemberId',
            'reviewerMemberId',
            'eventId',
            'title',
            'id',
            'state',
            'revision',
            'requirements',
            'requirementVersion',
            'publishedAt',
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
  createMaterialTask: {
    path: '/api/v1/material-tasks',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          eventId: { format: 'uuid', type: 'string' },
          handlerMemberId: { format: 'uuid', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          organizationId: { format: 'uuid', type: 'string' },
          publishedAt: { format: 'date-time', nullable: true, type: 'string' },
          requirementVersion: { nullable: true, type: 'integer' },
          requirements: {
            allOf: [{ $ref: '#/components/schemas/RequirementsDto' }],
            nullable: true,
            type: 'object',
            properties: {},
          },
          reviewerMemberId: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: { enum: ['DRAFT', 'PUBLISHED'], type: 'string' },
          title: { maxLength: 160, type: 'string' },
        },
        required: [
          'organizationId',
          'handlerMemberId',
          'reviewerMemberId',
          'eventId',
          'title',
          'id',
          'state',
          'revision',
          'requirements',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [],
    body: {
      properties: {
        eventId: { format: 'uuid', type: 'string' },
        handlerMemberId: { format: 'uuid', type: 'string' },
        organizationId: { format: 'uuid', type: 'string' },
        reviewerMemberId: { format: 'uuid', type: 'string' },
        title: { maxLength: 160, type: 'string' },
      },
      required: [
        'organizationId',
        'handlerMemberId',
        'reviewerMemberId',
        'eventId',
        'title',
      ],
      type: 'object',
    },
    authenticated: true,
  },
  getMaterialTask: {
    path: '/api/v1/material-tasks/{id}',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          eventId: { format: 'uuid', type: 'string' },
          handlerMemberId: { format: 'uuid', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          organizationId: { format: 'uuid', type: 'string' },
          publishedAt: { format: 'date-time', nullable: true, type: 'string' },
          requirementVersion: { nullable: true, type: 'integer' },
          requirements: {
            allOf: [{ $ref: '#/components/schemas/RequirementsDto' }],
            nullable: true,
            type: 'object',
            properties: {},
          },
          reviewerMemberId: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: { enum: ['DRAFT', 'PUBLISHED'], type: 'string' },
          title: { maxLength: 160, type: 'string' },
        },
        required: [
          'organizationId',
          'handlerMemberId',
          'reviewerMemberId',
          'eventId',
          'title',
          'id',
          'state',
          'revision',
          'requirements',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: null,
    authenticated: true,
  },
  assignMaterialTask: {
    path: '/api/v1/material-tasks/{id}/assignment',
    method: 'PATCH',
    responses: {
      '200': {
        properties: {
          eventId: { format: 'uuid', type: 'string' },
          handlerMemberId: { format: 'uuid', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          organizationId: { format: 'uuid', type: 'string' },
          publishedAt: { format: 'date-time', nullable: true, type: 'string' },
          requirementVersion: { nullable: true, type: 'integer' },
          requirements: {
            allOf: [{ $ref: '#/components/schemas/RequirementsDto' }],
            nullable: true,
            type: 'object',
            properties: {},
          },
          reviewerMemberId: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: { enum: ['DRAFT', 'PUBLISHED'], type: 'string' },
          title: { maxLength: 160, type: 'string' },
        },
        required: [
          'organizationId',
          'handlerMemberId',
          'reviewerMemberId',
          'eventId',
          'title',
          'id',
          'state',
          'revision',
          'requirements',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: {
      properties: {
        expectedRevision: { minimum: 1, type: 'integer' },
        handlerMemberId: { format: 'uuid', type: 'string' },
        organizationId: { format: 'uuid', type: 'string' },
        reviewerMemberId: { format: 'uuid', type: 'string' },
      },
      required: [
        'organizationId',
        'handlerMemberId',
        'reviewerMemberId',
        'expectedRevision',
      ],
      type: 'object',
    },
    authenticated: true,
  },
  publishMaterialTask: {
    path: '/api/v1/material-tasks/{id}/publish',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          eventId: { format: 'uuid', type: 'string' },
          handlerMemberId: { format: 'uuid', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          organizationId: { format: 'uuid', type: 'string' },
          publishedAt: { format: 'date-time', nullable: true, type: 'string' },
          requirementVersion: { nullable: true, type: 'integer' },
          requirements: {
            allOf: [{ $ref: '#/components/schemas/RequirementsDto' }],
            nullable: true,
            type: 'object',
            properties: {},
          },
          reviewerMemberId: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: { enum: ['DRAFT', 'PUBLISHED'], type: 'string' },
          title: { maxLength: 160, type: 'string' },
        },
        required: [
          'organizationId',
          'handlerMemberId',
          'reviewerMemberId',
          'eventId',
          'title',
          'id',
          'state',
          'revision',
          'requirements',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: {
      properties: { expectedRevision: { minimum: 1, type: 'integer' } },
      required: ['expectedRevision'],
      type: 'object',
    },
    authenticated: true,
  },
  configureMaterialTask: {
    path: '/api/v1/material-tasks/{id}/requirements',
    method: 'PATCH',
    responses: {
      '200': {
        properties: {
          eventId: { format: 'uuid', type: 'string' },
          handlerMemberId: { format: 'uuid', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          organizationId: { format: 'uuid', type: 'string' },
          publishedAt: { format: 'date-time', nullable: true, type: 'string' },
          requirementVersion: { nullable: true, type: 'integer' },
          requirements: {
            allOf: [{ $ref: '#/components/schemas/RequirementsDto' }],
            nullable: true,
            type: 'object',
            properties: {},
          },
          reviewerMemberId: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: { enum: ['DRAFT', 'PUBLISHED'], type: 'string' },
          title: { maxLength: 160, type: 'string' },
        },
        required: [
          'organizationId',
          'handlerMemberId',
          'reviewerMemberId',
          'eventId',
          'title',
          'id',
          'state',
          'revision',
          'requirements',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    body: {
      properties: {
        expectedRevision: { minimum: 1, type: 'integer' },
        requirements: {
          properties: {
            deadline: { format: 'date-time', type: 'string' },
            materials: {
              items: {
                properties: {
                  acceptanceStandard: { maxLength: 2000, type: 'string' },
                  deadline: { format: 'date-time', type: 'string' },
                  formats: {
                    items: { type: 'string' },
                    minItems: 1,
                    type: 'array',
                  },
                  id: { format: 'uuid', type: 'string' },
                  instructions: { maxLength: 2000, type: 'string' },
                  maxBytes: {
                    maximum: 2147483647,
                    minimum: 1,
                    type: 'integer',
                  },
                  required: { type: 'boolean' },
                  templateVersion: { maxLength: 120, type: 'string' },
                  title: { maxLength: 160, type: 'string' },
                },
                required: [
                  'id',
                  'title',
                  'required',
                  'instructions',
                  'templateVersion',
                  'formats',
                  'maxBytes',
                  'deadline',
                  'acceptanceStandard',
                ],
                type: 'object',
              },
              maxItems: 50,
              minItems: 1,
              type: 'array',
            },
          },
          required: ['deadline', 'materials'],
          type: 'object',
        },
      },
      required: ['expectedRevision', 'requirements'],
      type: 'object',
    },
    authenticated: true,
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
  getWorkspaceDirectory: {
    path: '/api/v1/workspace/directory',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          members: {
            items: {
              properties: {
                id: { format: 'uuid', type: 'string' },
                organizationId: { format: 'uuid', type: 'string' },
                role: {
                  enum: [
                    'EVENT_MANAGER',
                    'ORGANIZER',
                    'REVIEWER',
                    'SYSTEM_ADMIN',
                  ],
                  type: 'string',
                },
                userId: { format: 'uuid', type: 'string' },
              },
              required: ['id', 'userId', 'organizationId', 'role'],
              type: 'object',
            },
            type: 'array',
          },
          organizations: {
            items: {
              properties: {
                id: { format: 'uuid', type: 'string' },
                name: { type: 'string' },
              },
              required: ['id', 'name'],
              type: 'object',
            },
            type: 'array',
          },
          users: {
            items: {
              properties: {
                displayName: { type: 'string' },
                id: { format: 'uuid', type: 'string' },
              },
              required: ['id', 'displayName'],
              type: 'object',
            },
            type: 'array',
          },
        },
        required: ['users', 'organizations', 'members'],
        type: 'object',
      },
    },
    parameters: [],
    body: null,
    authenticated: true,
  },
  getWorkspaceIdentity: {
    path: '/api/v1/workspace/identity',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          displayName: { type: 'string' },
          id: { format: 'uuid', type: 'string' },
          roles: { items: { type: 'string' }, type: 'array' },
        },
        required: ['id', 'displayName', 'roles'],
        type: 'object',
      },
    },
    parameters: [],
    body: null,
    authenticated: true,
  },
} as const;
