/** Generated from the Nest OpenAPI contract. DO NOT EDIT. */
export interface paths {
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
    HealthDto: {
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'ok';
    };
    NotReadyDto: {
      /** @enum {string} */
      code: 'DATABASE_UNAVAILABLE';
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'not_ready';
    };
    ReadyDto: {
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'ready';
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
