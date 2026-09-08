/** Generated from the Nest OpenAPI contract. DO NOT EDIT. */
export interface paths {
  '/api/v1/authorization/audit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSecurityAudit'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/event-grants': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createEventGrant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/event-grants/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['deleteEventGrant'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/event-scopes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createEventScope'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/event-scopes/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getEventScope'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getIdentity'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/members': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createOrganizationMember'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/members/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['setMemberActive'];
    trace?: never;
  };
  '/api/v1/authorization/organizations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createOrganization'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/task-scopes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createTaskScope'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/task-scopes/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getTaskScope'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/task-scopes/{id}/access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Policy probe only; does not read or change material or transfer files. */
    post: operations['checkTaskAccess'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/task-scopes/{id}/reviewer': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['assignTaskReviewer'];
    trace?: never;
  };
  '/api/v1/authorization/users': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createInternalUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/users/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['setUserActive'];
    trace?: never;
  };
  '/api/v1/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listEvents'];
    put?: never;
    post: operations['createEvent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getEvent'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** API process liveness; independent of database */
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listMaterialTasks'];
    put?: never;
    post: operations['createMaterialTask'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getMaterialTask'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/assignment': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['assignMaterialTask'];
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/close': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['closeMaterialTask'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/draft': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getMaterialDraft'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['saveMaterialDraft'];
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/draft-history': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getDraftHistory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/execution': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getTaskExecution'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/extensions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listDeadlineExtensions'];
    put?: never;
    post: operations['extendTaskDeadline'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/handover': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['handoverTaskHandler'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['publishMaterialTask'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/requirements': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['configureMaterialTask'];
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/reviews': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['reviewMaterialPackage'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/submissions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listSubmissionVersions'];
    put?: never;
    post: operations['submitMaterialPackage'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/material-tasks/{id}/uploads': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createUploadIntent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ready': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Database connectivity; 1500ms application deadline, not schema readiness */
    get: operations['getReadiness'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/uploads/{id}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['confirmPrivateUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/uploads/{id}/content': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['downloadPrivateContent'];
    put?: never;
    post: operations['uploadPrivateContent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/workspace/directory': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getWorkspaceDirectory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/workspace/identity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getWorkspaceIdentity'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    AccessDto: {
      /** @enum {string} */
      action: 'task.read' | 'content.write' | 'review' | 'file.download';
    };
    ActiveDto: {
      active: boolean;
    };
    AuditDto: {
      action: string;
      actorId: string | null;
      context: {
        [key: string]: unknown;
      };
      /** Format: uuid */
      id: string;
      /** Format: date-time */
      occurredAt: string;
      outcome: string;
      /** Format: uuid */
      requestId: string;
      resourceId: string | null;
    };
    CloseDto: {
      expectedRevision: number;
      reason: string;
    };
    ConfigureTaskDto: {
      expectedRevision: number;
      requirements: components['schemas']['RequirementsDto'];
    };
    CreateTaskDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      handlerMemberId: string;
      /** Format: uuid */
      organizationId: string;
      /** Format: uuid */
      reviewerMemberId: string;
      title: string;
    };
    DeadlineDto: {
      /** Format: date-time */
      deadline: string;
      id: string;
    };
    DeadlineHistoryDto: {
      /** Format: uuid */
      actorId: string;
      /** Format: uuid */
      id: string;
      next: components['schemas']['DeadlinesDto'];
      /** Format: date-time */
      occurredAt: string;
      previous: components['schemas']['DeadlinesDto'];
      reason: string;
    };
    DeadlinesDto: {
      materials: components['schemas']['DeadlineDto'][];
      /** Format: date-time */
      task: string;
    };
    DirectoryDto: {
      members: components['schemas']['MemberChoiceDto'][];
      organizations: components['schemas']['OrganizationChoiceDto'][];
      users: components['schemas']['PersonDto'][];
    };
    DraftEditViewDto: {
      /** Format: uuid */
      actorId: string;
      entries: components['schemas']['EntryDto'][];
      /** Format: uuid */
      id: string;
      kind: string;
      /** Format: date-time */
      occurredAt: string;
      revision: number;
    };
    DraftViewDto: {
      baseSubmissionId: string | null;
      entries: components['schemas']['EntryDto'][];
      /** Format: uuid */
      id: string;
      revision: number;
    };
    EntryDto: {
      fileIds: string[];
      /** Format: uuid */
      materialId: string;
      text: string;
    };
    EventInputDto: {
      description: string;
      name: string;
    };
    EventViewDto: {
      /** Format: date-time */
      createdAt: string;
      description: string;
      /** Format: uuid */
      id: string;
      name: string;
    };
    ExecutionViewDto: {
      currentSubmissionId: string | null;
      deadlines: components['schemas']['DeadlinesDto'];
      generation: number;
      /** Format: uuid */
      id: string;
      revision: number;
      /** @enum {string} */
      state: 'EDITING' | 'SUBMITTED' | 'APPROVED' | 'CLOSED';
    };
    ExtendDto: {
      expectedRevision: number;
      /** Format: date-time */
      newDeadline: string;
      reason: string;
    };
    GrantDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      memberId: string;
    };
    HandoverDto: {
      expectedRevision: number;
      /** Format: uuid */
      handlerMemberId: string;
    };
    HealthDto: {
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'ok';
    };
    IdDto: {
      /** Format: uuid */
      id: string;
    };
    IssueDto: {
      instruction: string;
      /** Format: uuid */
      materialId: string;
      reason: string;
    };
    MaterialRequirementDto: {
      acceptanceStandard: string;
      /** Format: date-time */
      deadline: string;
      formats: string[];
      /** Format: uuid */
      id: string;
      instructions: string;
      maxBytes: number;
      required: boolean;
      templateVersion: string;
      title: string;
    };
    MemberChoiceDto: {
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      organizationId: string;
      /** @enum {string} */
      role: 'EVENT_MANAGER' | 'ORGANIZER' | 'REVIEWER' | 'SYSTEM_ADMIN';
      /** Format: uuid */
      userId: string;
    };
    MemberDto: {
      /** Format: uuid */
      organizationId: string;
      /** @enum {string} */
      role: 'EVENT_MANAGER' | 'ORGANIZER' | 'REVIEWER' | 'SYSTEM_ADMIN';
      /** Format: uuid */
      userId: string;
    };
    NotReadyDto: {
      /** @enum {string} */
      code: 'DATABASE_UNAVAILABLE';
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'not_ready';
    };
    OrganizationChoiceDto: {
      /** Format: uuid */
      id: string;
      name: string;
    };
    OrganizationDto: {
      name: string;
    };
    PersonDto: {
      displayName: string;
      /** Format: uuid */
      id: string;
    };
    ReadyDto: {
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'ready';
    };
    RequirementsDto: {
      /** Format: date-time */
      deadline: string;
      materials: components['schemas']['MaterialRequirementDto'][];
    };
    ReviewDto: {
      /** @enum {string} */
      decision: 'PASS' | 'RETURN';
      issues: components['schemas']['IssueDto'][];
      /** Format: uuid */
      submissionId: string;
    };
    ReviewViewDto: {
      /** Format: uuid */
      actorId: string;
      /** @enum {string} */
      decision: 'PASS' | 'RETURN';
      /** Format: uuid */
      id: string;
      issues: components['schemas']['IssueDto'][];
      /** Format: date-time */
      reviewedAt: string;
      /** Format: uuid */
      submissionId: string;
    };
    ReviewerDto: {
      /** Format: uuid */
      reviewerGrantId: string | null;
    };
    RevisionDto: {
      expectedRevision: number;
    };
    SaveDraftDto: {
      entries: components['schemas']['EntryDto'][];
      expectedRevision: number;
    };
    SubmissionViewDto: {
      /** Format: uuid */
      actorId: string;
      deadlines: components['schemas']['DeadlinesDto'];
      entries: components['schemas']['EntryDto'][];
      generation: number;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      requirementVersionId: string;
      review: components['schemas']['ReviewViewDto'] | null;
      /** Format: date-time */
      submittedAt: string;
      /** Format: uuid */
      taskId: string;
      version: number;
    };
    SubmitDto: {
      expectedDraftRevision: number;
      /** Format: uuid */
      idempotencyKey: string;
    };
    TaskDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      handlerGrantId: string;
    };
    TaskViewDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      handlerMemberId: string;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      organizationId: string;
      /** Format: date-time */
      publishedAt: string | null;
      requirementVersion: number | null;
      requirements: components['schemas']['RequirementsDto'] | null;
      /** Format: uuid */
      reviewerMemberId: string;
      revision: number;
      /** @enum {string} */
      state: 'DRAFT' | 'PUBLISHED';
      title: string;
    };
    UpdateAssignmentDto: {
      expectedRevision: number;
      /** Format: uuid */
      handlerMemberId: string;
      /** Format: uuid */
      organizationId: string;
      /** Format: uuid */
      reviewerMemberId: string;
    };
    UploadDto: {
      expectedBytes: number;
      /** @enum {string} */
      extension: 'txt' | 'pdf' | 'png' | 'jpg' | 'jpeg';
      /** Format: uuid */
      materialId: string;
      sha256: string;
    };
    UploadViewDto: {
      /** Format: date-time */
      expiresAt: string;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      state: 'PENDING' | 'CONFIRMED';
    };
    UserDto: {
      displayName: string;
    };
    WorkspaceIdentityDto: {
      displayName: string;
      /** Format: uuid */
      id: string;
      roles: string[];
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getSecurityAudit: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuditDto'][];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createEventGrant: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GrantDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  deleteEventGrant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createEventScope: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getEventScope: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getIdentity: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createOrganizationMember: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['MemberDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  setMemberActive: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ActiveDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createOrganization: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['OrganizationDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createTaskScope: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TaskDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getTaskScope: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  checkTaskAccess: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AccessDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  assignTaskReviewer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReviewerDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createInternalUser: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UserDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  setUserActive: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ActiveDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Missing, expired or revoked local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Constraint or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Identity, database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listEvents: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventViewDto'][];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createEvent: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EventInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventViewDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventViewDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HealthDto'];
        };
      };
    };
  };
  listMaterialTasks: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskViewDto'][];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createMaterialTask: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateTaskDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskViewDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getMaterialTask: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskViewDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  assignMaterialTask: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateAssignmentDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskViewDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  closeMaterialTask: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CloseDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExecutionViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getMaterialDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  saveMaterialDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaveDraftDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getDraftHistory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftEditViewDto'][];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getTaskExecution: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExecutionViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listDeadlineExtensions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DeadlineHistoryDto'][];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  extendTaskDeadline: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExtendDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExecutionViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  handoverTaskHandler: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['HandoverDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExecutionViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  publishMaterialTask: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RevisionDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskViewDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  configureMaterialTask: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConfigureTaskDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskViewDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  reviewMaterialPackage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReviewDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReviewViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listSubmissionVersions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SubmissionViewDto'][];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  submitMaterialPackage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SubmitDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SubmissionViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createUploadIntent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UploadDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UploadViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getReadiness: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReadyDto'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotReadyDto'];
        };
      };
    };
  };
  confirmPrivateUpload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UploadViewDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  downloadPrivateContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/octet-stream': string;
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  uploadPrivateContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/octet-stream': string;
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdDto'];
        };
      };
      /** @description Invalid material, upload, review or deadline input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Current task/organization/assignment does not allow access */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Deadline, revision, state, idempotency or concurrent change conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database, private storage or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getWorkspaceDirectory: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DirectoryDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getWorkspaceIdentity: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WorkspaceIdentityDto'];
        };
      };
      /** @description Invalid configuration or revision */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid local session */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Resource not accessible */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Concurrent change or published task protected */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Database or audit unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
}
