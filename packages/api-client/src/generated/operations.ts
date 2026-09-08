/** Generated from the Nest OpenAPI contract. DO NOT EDIT. */
export const operations = {
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
  },
} as const;
