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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
            templateFiles: {
              items: {
                properties: {
                  bytes: { type: 'integer' },
                  extension: { type: 'string' },
                  id: { format: 'uuid', type: 'string' },
                  materialId: { format: 'uuid', type: 'string' },
                  name: { type: 'string' },
                  originalNameKnown: { type: 'boolean' },
                },
                required: [
                  'id',
                  'materialId',
                  'name',
                  'extension',
                  'bytes',
                  'originalNameKnown',
                ],
                type: 'object',
              },
              type: 'array',
            },
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
            'templateFiles',
            'requirementVersion',
            'publishedAt',
          ],
          type: 'object',
        },
        type: 'array',
      },
    },
    parameters: [],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
          templateFiles: {
            items: {
              properties: {
                bytes: { type: 'integer' },
                extension: { type: 'string' },
                id: { format: 'uuid', type: 'string' },
                materialId: { format: 'uuid', type: 'string' },
                name: { type: 'string' },
                originalNameKnown: { type: 'boolean' },
              },
              required: [
                'id',
                'materialId',
                'name',
                'extension',
                'bytes',
                'originalNameKnown',
              ],
              type: 'object',
            },
            type: 'array',
          },
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
          'templateFiles',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
          templateFiles: {
            items: {
              properties: {
                bytes: { type: 'integer' },
                extension: { type: 'string' },
                id: { format: 'uuid', type: 'string' },
                materialId: { format: 'uuid', type: 'string' },
                name: { type: 'string' },
                originalNameKnown: { type: 'boolean' },
              },
              required: [
                'id',
                'materialId',
                'name',
                'extension',
                'bytes',
                'originalNameKnown',
              ],
              type: 'object',
            },
            type: 'array',
          },
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
          'templateFiles',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
          templateFiles: {
            items: {
              properties: {
                bytes: { type: 'integer' },
                extension: { type: 'string' },
                id: { format: 'uuid', type: 'string' },
                materialId: { format: 'uuid', type: 'string' },
                name: { type: 'string' },
                originalNameKnown: { type: 'boolean' },
              },
              required: [
                'id',
                'materialId',
                'name',
                'extension',
                'bytes',
                'originalNameKnown',
              ],
              type: 'object',
            },
            type: 'array',
          },
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
          'templateFiles',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
  closeMaterialTask: {
    path: '/api/v1/material-tasks/{id}/close',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          currentSubmissionId: { nullable: true, type: 'string' },
          deadlines: {
            properties: {
              materials: {
                items: {
                  properties: {
                    deadline: { format: 'date-time', type: 'string' },
                    id: { type: 'string' },
                  },
                  required: ['id', 'deadline'],
                  type: 'object',
                },
                type: 'array',
              },
              task: { format: 'date-time', type: 'string' },
            },
            required: ['task', 'materials'],
            type: 'object',
          },
          generation: { type: 'integer' },
          id: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: {
            enum: ['EDITING', 'SUBMITTED', 'APPROVED', 'CLOSED'],
            type: 'string',
          },
        },
        required: [
          'id',
          'state',
          'revision',
          'generation',
          'currentSubmissionId',
          'deadlines',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        expectedRevision: { minimum: 1, type: 'integer' },
        reason: { maxLength: 2000, type: 'string' },
      },
      required: ['expectedRevision', 'reason'],
      type: 'object',
    },
    authenticated: true,
  },
  getMaterialDraft: {
    path: '/api/v1/material-tasks/{id}/draft',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          baseSubmissionId: { nullable: true, type: 'string' },
          entries: {
            items: {
              properties: {
                fileIds: {
                  items: { type: 'string' },
                  maxItems: 10,
                  type: 'array',
                },
                materialId: { format: 'uuid', type: 'string' },
                text: { maxLength: 4000, type: 'string' },
              },
              required: ['materialId', 'text', 'fileIds'],
              type: 'object',
            },
            type: 'array',
          },
          id: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
        },
        required: ['id', 'revision', 'entries', 'baseSubmissionId'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  saveMaterialDraft: {
    path: '/api/v1/material-tasks/{id}/draft',
    method: 'PATCH',
    responses: {
      '200': {
        properties: {
          baseSubmissionId: { nullable: true, type: 'string' },
          entries: {
            items: {
              properties: {
                fileIds: {
                  items: { type: 'string' },
                  maxItems: 10,
                  type: 'array',
                },
                materialId: { format: 'uuid', type: 'string' },
                text: { maxLength: 4000, type: 'string' },
              },
              required: ['materialId', 'text', 'fileIds'],
              type: 'object',
            },
            type: 'array',
          },
          id: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
        },
        required: ['id', 'revision', 'entries', 'baseSubmissionId'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        entries: {
          items: {
            properties: {
              fileIds: {
                items: { type: 'string' },
                maxItems: 10,
                type: 'array',
              },
              materialId: { format: 'uuid', type: 'string' },
              text: { maxLength: 4000, type: 'string' },
            },
            required: ['materialId', 'text', 'fileIds'],
            type: 'object',
          },
          maxItems: 50,
          type: 'array',
        },
        expectedRevision: { minimum: 1, type: 'integer' },
      },
      required: ['expectedRevision', 'entries'],
      type: 'object',
    },
    authenticated: true,
  },
  getDraftHistory: {
    path: '/api/v1/material-tasks/{id}/draft-history',
    method: 'GET',
    responses: {
      '200': {
        items: {
          properties: {
            actorId: { format: 'uuid', type: 'string' },
            entries: {
              items: {
                properties: {
                  fileIds: {
                    items: { type: 'string' },
                    maxItems: 10,
                    type: 'array',
                  },
                  materialId: { format: 'uuid', type: 'string' },
                  text: { maxLength: 4000, type: 'string' },
                },
                required: ['materialId', 'text', 'fileIds'],
                type: 'object',
              },
              type: 'array',
            },
            id: { format: 'uuid', type: 'string' },
            kind: { type: 'string' },
            occurredAt: { format: 'date-time', type: 'string' },
            revision: { type: 'integer' },
          },
          required: [
            'id',
            'revision',
            'entries',
            'actorId',
            'kind',
            'occurredAt',
          ],
          type: 'object',
        },
        type: 'array',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  getTaskExecution: {
    path: '/api/v1/material-tasks/{id}/execution',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          currentSubmissionId: { nullable: true, type: 'string' },
          deadlines: {
            properties: {
              materials: {
                items: {
                  properties: {
                    deadline: { format: 'date-time', type: 'string' },
                    id: { type: 'string' },
                  },
                  required: ['id', 'deadline'],
                  type: 'object',
                },
                type: 'array',
              },
              task: { format: 'date-time', type: 'string' },
            },
            required: ['task', 'materials'],
            type: 'object',
          },
          generation: { type: 'integer' },
          id: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: {
            enum: ['EDITING', 'SUBMITTED', 'APPROVED', 'CLOSED'],
            type: 'string',
          },
        },
        required: [
          'id',
          'state',
          'revision',
          'generation',
          'currentSubmissionId',
          'deadlines',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  listDeadlineExtensions: {
    path: '/api/v1/material-tasks/{id}/extensions',
    method: 'GET',
    responses: {
      '200': {
        items: {
          properties: {
            actorId: { format: 'uuid', type: 'string' },
            actorName: { type: 'string' },
            id: { format: 'uuid', type: 'string' },
            next: {
              properties: {
                materials: {
                  items: {
                    properties: {
                      deadline: { format: 'date-time', type: 'string' },
                      id: { type: 'string' },
                    },
                    required: ['id', 'deadline'],
                    type: 'object',
                  },
                  type: 'array',
                },
                task: { format: 'date-time', type: 'string' },
              },
              required: ['task', 'materials'],
              type: 'object',
            },
            occurredAt: { format: 'date-time', type: 'string' },
            previous: {
              properties: {
                materials: {
                  items: {
                    properties: {
                      deadline: { format: 'date-time', type: 'string' },
                      id: { type: 'string' },
                    },
                    required: ['id', 'deadline'],
                    type: 'object',
                  },
                  type: 'array',
                },
                task: { format: 'date-time', type: 'string' },
              },
              required: ['task', 'materials'],
              type: 'object',
            },
            reason: { type: 'string' },
          },
          required: [
            'id',
            'actorName',
            'actorId',
            'occurredAt',
            'reason',
            'previous',
            'next',
          ],
          type: 'object',
        },
        type: 'array',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  extendTaskDeadline: {
    path: '/api/v1/material-tasks/{id}/extensions',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          currentSubmissionId: { nullable: true, type: 'string' },
          deadlines: {
            properties: {
              materials: {
                items: {
                  properties: {
                    deadline: { format: 'date-time', type: 'string' },
                    id: { type: 'string' },
                  },
                  required: ['id', 'deadline'],
                  type: 'object',
                },
                type: 'array',
              },
              task: { format: 'date-time', type: 'string' },
            },
            required: ['task', 'materials'],
            type: 'object',
          },
          generation: { type: 'integer' },
          id: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: {
            enum: ['EDITING', 'SUBMITTED', 'APPROVED', 'CLOSED'],
            type: 'string',
          },
        },
        required: [
          'id',
          'state',
          'revision',
          'generation',
          'currentSubmissionId',
          'deadlines',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        expectedRevision: { minimum: 1, type: 'integer' },
        newDeadline: { format: 'date-time', type: 'string' },
        reason: { maxLength: 2000, type: 'string' },
      },
      required: ['expectedRevision', 'newDeadline', 'reason'],
      type: 'object',
    },
    authenticated: true,
  },
  handoverTaskHandler: {
    path: '/api/v1/material-tasks/{id}/handover',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          currentSubmissionId: { nullable: true, type: 'string' },
          deadlines: {
            properties: {
              materials: {
                items: {
                  properties: {
                    deadline: { format: 'date-time', type: 'string' },
                    id: { type: 'string' },
                  },
                  required: ['id', 'deadline'],
                  type: 'object',
                },
                type: 'array',
              },
              task: { format: 'date-time', type: 'string' },
            },
            required: ['task', 'materials'],
            type: 'object',
          },
          generation: { type: 'integer' },
          id: { format: 'uuid', type: 'string' },
          revision: { type: 'integer' },
          state: {
            enum: ['EDITING', 'SUBMITTED', 'APPROVED', 'CLOSED'],
            type: 'string',
          },
        },
        required: [
          'id',
          'state',
          'revision',
          'generation',
          'currentSubmissionId',
          'deadlines',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        expectedRevision: { minimum: 1, type: 'integer' },
        handlerMemberId: { format: 'uuid', type: 'string' },
      },
      required: ['expectedRevision', 'handlerMemberId'],
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
          templateFiles: {
            items: {
              properties: {
                bytes: { type: 'integer' },
                extension: { type: 'string' },
                id: { format: 'uuid', type: 'string' },
                materialId: { format: 'uuid', type: 'string' },
                name: { type: 'string' },
                originalNameKnown: { type: 'boolean' },
              },
              required: [
                'id',
                'materialId',
                'name',
                'extension',
                'bytes',
                'originalNameKnown',
              ],
              type: 'object',
            },
            type: 'array',
          },
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
          'templateFiles',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
          templateFiles: {
            items: {
              properties: {
                bytes: { type: 'integer' },
                extension: { type: 'string' },
                id: { format: 'uuid', type: 'string' },
                materialId: { format: 'uuid', type: 'string' },
                name: { type: 'string' },
                originalNameKnown: { type: 'boolean' },
              },
              required: [
                'id',
                'materialId',
                'name',
                'extension',
                'bytes',
                'originalNameKnown',
              ],
              type: 'object',
            },
            type: 'array',
          },
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
          'templateFiles',
          'requirementVersion',
          'publishedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
  reviewMaterialPackage: {
    path: '/api/v1/material-tasks/{id}/reviews',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          actorId: { format: 'uuid', type: 'string' },
          actorName: { type: 'string' },
          decision: { enum: ['PASS', 'RETURN'], type: 'string' },
          id: { format: 'uuid', type: 'string' },
          issues: {
            items: {
              properties: {
                instruction: { maxLength: 2000, type: 'string' },
                materialId: { format: 'uuid', type: 'string' },
                reason: { maxLength: 2000, type: 'string' },
              },
              required: ['materialId', 'reason', 'instruction'],
              type: 'object',
            },
            maxItems: 50,
            type: 'array',
          },
          reviewedAt: { format: 'date-time', type: 'string' },
          submissionId: { format: 'uuid', type: 'string' },
        },
        required: [
          'submissionId',
          'decision',
          'issues',
          'actorName',
          'id',
          'actorId',
          'reviewedAt',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        decision: { enum: ['PASS', 'RETURN'], type: 'string' },
        issues: {
          items: {
            properties: {
              instruction: { maxLength: 2000, type: 'string' },
              materialId: { format: 'uuid', type: 'string' },
              reason: { maxLength: 2000, type: 'string' },
            },
            required: ['materialId', 'reason', 'instruction'],
            type: 'object',
          },
          maxItems: 50,
          type: 'array',
        },
        submissionId: { format: 'uuid', type: 'string' },
      },
      required: ['submissionId', 'decision', 'issues'],
      type: 'object',
    },
    authenticated: true,
  },
  listSubmissionVersions: {
    path: '/api/v1/material-tasks/{id}/submissions',
    method: 'GET',
    responses: {
      '200': {
        items: {
          properties: {
            actorId: { format: 'uuid', type: 'string' },
            actorName: { type: 'string' },
            deadlines: {
              properties: {
                materials: {
                  items: {
                    properties: {
                      deadline: { format: 'date-time', type: 'string' },
                      id: { type: 'string' },
                    },
                    required: ['id', 'deadline'],
                    type: 'object',
                  },
                  type: 'array',
                },
                task: { format: 'date-time', type: 'string' },
              },
              required: ['task', 'materials'],
              type: 'object',
            },
            entries: {
              items: {
                properties: {
                  fileIds: {
                    items: { type: 'string' },
                    maxItems: 10,
                    type: 'array',
                  },
                  materialId: { format: 'uuid', type: 'string' },
                  text: { maxLength: 4000, type: 'string' },
                },
                required: ['materialId', 'text', 'fileIds'],
                type: 'object',
              },
              type: 'array',
            },
            generation: { type: 'integer' },
            id: { format: 'uuid', type: 'string' },
            requirementVersionId: { format: 'uuid', type: 'string' },
            review: {
              allOf: [{ $ref: '#/components/schemas/ReviewViewDto' }],
              nullable: true,
              type: 'object',
              properties: {},
            },
            submittedAt: { format: 'date-time', type: 'string' },
            taskId: { format: 'uuid', type: 'string' },
            version: { type: 'integer' },
          },
          required: [
            'id',
            'actorName',
            'taskId',
            'requirementVersionId',
            'version',
            'generation',
            'actorId',
            'submittedAt',
            'entries',
            'deadlines',
            'review',
          ],
          type: 'object',
        },
        type: 'array',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  submitMaterialPackage: {
    path: '/api/v1/material-tasks/{id}/submissions',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          actorId: { format: 'uuid', type: 'string' },
          actorName: { type: 'string' },
          deadlines: {
            properties: {
              materials: {
                items: {
                  properties: {
                    deadline: { format: 'date-time', type: 'string' },
                    id: { type: 'string' },
                  },
                  required: ['id', 'deadline'],
                  type: 'object',
                },
                type: 'array',
              },
              task: { format: 'date-time', type: 'string' },
            },
            required: ['task', 'materials'],
            type: 'object',
          },
          entries: {
            items: {
              properties: {
                fileIds: {
                  items: { type: 'string' },
                  maxItems: 10,
                  type: 'array',
                },
                materialId: { format: 'uuid', type: 'string' },
                text: { maxLength: 4000, type: 'string' },
              },
              required: ['materialId', 'text', 'fileIds'],
              type: 'object',
            },
            type: 'array',
          },
          generation: { type: 'integer' },
          id: { format: 'uuid', type: 'string' },
          requirementVersionId: { format: 'uuid', type: 'string' },
          review: {
            allOf: [{ $ref: '#/components/schemas/ReviewViewDto' }],
            nullable: true,
            type: 'object',
            properties: {},
          },
          submittedAt: { format: 'date-time', type: 'string' },
          taskId: { format: 'uuid', type: 'string' },
          version: { type: 'integer' },
        },
        required: [
          'id',
          'actorName',
          'taskId',
          'requirementVersionId',
          'version',
          'generation',
          'actorId',
          'submittedAt',
          'entries',
          'deadlines',
          'review',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        expectedDraftRevision: { minimum: 1, type: 'integer' },
        idempotencyKey: { format: 'uuid', type: 'string' },
      },
      required: ['idempotencyKey', 'expectedDraftRevision'],
      type: 'object',
    },
    authenticated: true,
  },
  createTemplateUploadIntent: {
    path: '/api/v1/material-tasks/{id}/templates',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          expiresAt: { format: 'date-time', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          state: { enum: ['PENDING', 'CONFIRMED'], type: 'string' },
        },
        required: ['id', 'state', 'expiresAt'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        expectedBytes: { maximum: 10485760, minimum: 1, type: 'integer' },
        extension: {
          enum: ['txt', 'pdf', 'png', 'jpg', 'jpeg'],
          type: 'string',
        },
        materialId: { format: 'uuid', type: 'string' },
        originalName: { maxLength: 1024, type: 'string' },
        sha256: { pattern: '^[a-f0-9]{64}$', type: 'string' },
      },
      required: [
        'materialId',
        'originalName',
        'extension',
        'expectedBytes',
        'sha256',
      ],
      type: 'object',
    },
    authenticated: true,
  },
  createUploadIntent: {
    path: '/api/v1/material-tasks/{id}/uploads',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          expiresAt: { format: 'date-time', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          state: { enum: ['PENDING', 'CONFIRMED'], type: 'string' },
        },
        required: ['id', 'state', 'expiresAt'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: {
      properties: {
        expectedBytes: { maximum: 10485760, minimum: 1, type: 'integer' },
        extension: {
          enum: ['txt', 'pdf', 'png', 'jpg', 'jpeg'],
          type: 'string',
        },
        materialId: { format: 'uuid', type: 'string' },
        originalName: { maxLength: 1024, type: 'string' },
        sha256: { pattern: '^[a-f0-9]{64}$', type: 'string' },
      },
      required: ['materialId', 'extension', 'expectedBytes', 'sha256'],
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: false,
  },
  confirmTemplateUpload: {
    path: '/api/v1/templates/{id}/confirm',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          expiresAt: { format: 'date-time', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          state: { enum: ['PENDING', 'CONFIRMED'], type: 'string' },
        },
        required: ['id', 'state', 'expiresAt'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  downloadTemplateContent: {
    path: '/api/v1/templates/{id}/content',
    method: 'GET',
    responses: { '200': { format: 'binary', type: 'string' } },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/octet-stream',
    body: null,
    authenticated: true,
  },
  uploadTemplateContent: {
    path: '/api/v1/templates/{id}/content',
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
    requestMediaType: 'application/octet-stream',
    responseMediaType: 'application/json',
    body: { format: 'binary', type: 'string' },
    authenticated: true,
  },
  getTemplateInfo: {
    path: '/api/v1/templates/{id}/info',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          bytes: { type: 'integer' },
          extension: { type: 'string' },
          id: { format: 'uuid', type: 'string' },
          materialId: { format: 'uuid', type: 'string' },
          name: { type: 'string' },
          originalNameKnown: { type: 'boolean' },
        },
        required: [
          'id',
          'materialId',
          'name',
          'extension',
          'bytes',
          'originalNameKnown',
        ],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  removeDraftTemplate: {
    path: '/api/v1/templates/{id}/remove',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  confirmPrivateUpload: {
    path: '/api/v1/uploads/{id}/confirm',
    method: 'POST',
    responses: {
      '200': {
        properties: {
          expiresAt: { format: 'date-time', type: 'string' },
          id: { format: 'uuid', type: 'string' },
          state: { enum: ['PENDING', 'CONFIRMED'], type: 'string' },
        },
        required: ['id', 'state', 'expiresAt'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  downloadPrivateContent: {
    path: '/api/v1/uploads/{id}/content',
    method: 'GET',
    responses: { '200': { format: 'binary', type: 'string' } },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/octet-stream',
    body: null,
    authenticated: true,
  },
  uploadPrivateContent: {
    path: '/api/v1/uploads/{id}/content',
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
    requestMediaType: 'application/octet-stream',
    responseMediaType: 'application/json',
    body: { format: 'binary', type: 'string' },
    authenticated: true,
  },
  getPrivateFileInfo: {
    path: '/api/v1/uploads/{id}/info',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          bytes: { type: 'integer' },
          extension: { type: 'string' },
          id: { format: 'uuid', type: 'string' },
          name: { type: 'string' },
          originalNameKnown: { type: 'boolean' },
        },
        required: ['id', 'name', 'extension', 'bytes', 'originalNameKnown'],
        type: 'object',
      },
    },
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
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
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
  getUploadCapabilities: {
    path: '/api/v1/workspace/upload-capabilities',
    method: 'GET',
    responses: {
      '200': {
        properties: {
          formats: { items: { type: 'string' }, type: 'array' },
          maxBytes: { type: 'integer' },
        },
        required: ['formats', 'maxBytes'],
        type: 'object',
      },
    },
    parameters: [],
    requestMediaType: 'application/json',
    responseMediaType: 'application/json',
    body: null,
    authenticated: true,
  },
} as const;
