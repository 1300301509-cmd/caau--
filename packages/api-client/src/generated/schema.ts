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
    GrantDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      memberId: string;
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
    OrganizationDto: {
      name: string;
    };
    ReadyDto: {
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'ready';
    };
    ReviewerDto: {
      /** Format: uuid */
      reviewerGrantId: string | null;
    };
    TaskDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      handlerGrantId: string;
    };
    UserDto: {
      displayName: string;
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
}
