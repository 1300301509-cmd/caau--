/** Generated from the Nest OpenAPI contract. DO NOT EDIT. */
export interface paths {
  '/api/v1/admin/hosting-application-handler-grants': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Grant application handling permission */
    post: operations['HostingController_handlerGrant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/hosting-application-handler-grants/{id}': {
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
    patch: operations['HostingController_handlerGrantActive'];
    trace?: never;
  };
  '/api/v1/admin/hosting-application-review-grants': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_reviewGrant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/hosting-application-review-grants/{id}': {
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
    patch: operations['HostingController_reviewGrantActive'];
    trace?: never;
  };
  '/api/v1/agent/candidate-save-tickets/{ticketId}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['cancelAgentCandidateDraftSave'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/candidate-save-tickets/{ticketId}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Re-authorize and atomically save one DRAFT schedule version and immutable receipt. */
    post: operations['confirmAgentCandidateDraftSave'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/confirmation-tickets/{ticketId}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['cancelAgentScheduleAdjustment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/confirmation-tickets/{ticketId}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['confirmAgentScheduleAdjustment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/memories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAgentMemories'];
    put?: never;
    post: operations['createAgentMemory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/memories/{memoryId}/delete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['deleteAgentMemory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/model-status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAgentModelStatus'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/model-status/test': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['testAgentModelConnection'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/planning-requests/{planningId}/candidates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Calculate and persist a non-executable whole-schedule candidate only; never saves a formal schedule. */
    post: operations['previewAgentScheduleCandidate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/planning-requests/{planningId}/candidates/latest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getLatestAgentScheduleCandidate'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/planning-requests/{planningId}/candidates/{candidateId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAgentScheduleCandidate'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/planning-requests/{planningId}/candidates/{candidateId}/save-ticket': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Create a bound, expiring ticket for one fresh candidate; no schedule write. */
    post: operations['prepareAgentCandidateDraftSave'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/planning-requests/{planningId}/candidates/{candidateId}/save-ticket/latest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getLatestAgentCandidateDraftSaveTicket'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/planning-requests/{planningId}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Confirm a requirements revision only; does not generate schedules or issue execution tickets. */
    post: operations['confirmAgentPlanningRequest'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAgentSessions'];
    put?: never;
    post: operations['createAgentSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAgentSession'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/agent/sessions/{sessionId}/messages': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Route authorized chat, read-only queries, requirement collection and single-match scheduling; requirement confirmation cannot write a schedule. */
    post: operations['sendAgentMessage'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ai-usage/accounts/{id}/assignment': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['setAiCostAssignment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ai-usage/bills': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createAiSupplierBill'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ai-usage/calls/{id}/resolve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['resolveAiUsage'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ai-usage/prices': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createAiModelPrice'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ai-usage/quotas': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['setAiUsageQuota'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/change-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['changePassword'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['passwordLogin'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['passwordLogout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/mode': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthenticationMode'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/session': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthenticationSession'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/wechat/bind': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['bindWechatMiniapp'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/wechat/binding-intents': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createWechatBindingIntent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authentication/wechat/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['wechatMiniappLogin'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/accounts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAccounts'];
    put?: never;
    post: operations['createAccount'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authorization/accounts/{id}/reset-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['resetAccountPassword'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
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
  '/api/v1/competition-events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** listCompetitionEvents */
    get: operations['listCompetitionEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/event-grants/{id}/active': {
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
    patch: operations['setEventGrantActive'];
    trace?: never;
  };
  '/api/v1/event-materials': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['HostingController_listMaterials'];
    put?: never;
    post: operations['HostingController_createMaterials'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/event-materials/{id}/confirm-permit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_confirmPermit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/event-supply-photos/{id}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** confirmEventSupplyPhoto */
    post: operations['confirmEventSupplyPhoto'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/event-supply-photos/{id}/content': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['EventSuppliesController_download'];
    put: operations['EventSuppliesController_upload'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/event-supply-photos/{id}/remove': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** removeEventSupplyPhoto */
    post: operations['removeEventSupplyPhoto'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
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
  '/api/v1/events/{eventId}/matches/{matchId}/staff': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** replaceEventMatchStaff */
    put: operations['replaceEventMatchStaff'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/schedule': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getEventSchedule'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/schedule/generate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['generateEventSchedule'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/schedule/matches/{matchId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['adjustEventScheduleMatch'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/schedule/preview-adjustment': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['previewEventScheduleAdjustment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/schedule/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['publishEventSchedule'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/situation': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** getEventSituation */
    get: operations['getEventSituation'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/staff': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listEventStaff'];
    put?: never;
    post: operations['createEventStaff'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/staff/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['updateEventStaff'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/staff/{id}/history': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getEventStaffHistory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/supplies': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** listEventSupplies */
    get: operations['listEventSupplies'];
    put?: never;
    /** createEventSupply */
    post: operations['createEventSupply'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/supplies/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** updateEventSupply */
    put: operations['updateEventSupply'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/supplies/{id}/history': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** getEventSupplyHistory */
    get: operations['getEventSupplyHistory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/supplies/{id}/photos': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** createEventSupplyPhoto */
    post: operations['createEventSupplyPhoto'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/teams': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** listEventTeams */
    get: operations['listEventTeams'];
    put?: never;
    /** addEventTeam */
    post: operations['addEventTeam'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/teams/{eventTeamId}/roster': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** replaceEventTeamRoster */
    put: operations['replaceEventTeamRoster'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events/{eventId}/teams/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** updateEventTeam */
    put: operations['updateEventTeam'];
    post?: never;
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
  '/api/v1/hosting-applications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['HostingController_list'];
    put?: never;
    post: operations['HostingController_create'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['HostingController_detail'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_approve'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}/draft': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['HostingController_save'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}/reject': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_reject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}/request-supplement': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_supplement'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}/start-review': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_startReview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}/submit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_submit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-applications/{id}/uploads': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_uploadIntent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-journeys': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['HostingController_journeys'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-uploads/{id}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_confirmUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-uploads/{id}/content': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['HostingController_download'];
    put: operations['HostingController_uploadContent'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/hosting-uploads/{id}/remove': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['HostingController_removeUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-material-tasks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createIndividualMaterialTask'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createIndividualMaterial'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials/snapshot': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getIndividualSnapshot'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials/{id}/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['approveIndividualMaterial'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials/{id}/draft': {
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
    patch: operations['saveIndividualDraft'];
    trace?: never;
  };
  '/api/v1/individual-materials/{id}/history': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getIndividualHistory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials/{id}/return': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['returnIndividualMaterial'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials/{id}/start-review': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startIndividualReview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials/{id}/submit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['submitIndividualMaterial'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-materials/{id}/uploads': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createIndividualUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-uploads/{id}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['confirmIndividualUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-uploads/{id}/content': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['downloadIndividualContent'];
    put?: never;
    post: operations['uploadIndividualContent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/individual-uploads/{id}/info': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getIndividualFileInfo'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/local-test-identities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listLocalTestIdentities'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/local-test-identities/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createLocalTestSession'];
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
  '/api/v1/material-tasks/{id}/individual-channel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['activateIndividualChannel'];
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
  '/api/v1/material-tasks/{id}/templates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createTemplateUploadIntent'];
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
  '/api/v1/observability/accounts/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getGovernanceAccount'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/accounts/{id}/permission': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['explainGovernancePermission'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/accounts/{id}/revoke': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['revokeGovernanceSessions'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/agent/skills': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAgentSkillVersions'];
    put?: never;
    post: operations['createAgentSkillVersion'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/agent/skills/tools/catalog': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAgentToolCatalog'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/agent/skills/{id}/activate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['activateAgentSkillVersion'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/alerts/{id}/acknowledge': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['acknowledgeGovernanceAlert'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/audit/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['exportGovernanceAudit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/dialogues/{id}/review': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['reviewGovernanceDialogue'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/overview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getGovernanceOverview'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/observability/{kind}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listGovernanceRecords'];
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
  '/api/v1/server-test-identities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listServerTestIdentities'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/server-test-identities/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createServerTestSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/teams': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** listTeams */
    get: operations['listTeams'];
    put?: never;
    /** createTeam */
    post: operations['createTeam'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/teams/organizations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** listTeamOrganizations */
    get: operations['listTeamOrganizations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/teams/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** updateTeam */
    put: operations['updateTeam'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{id}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['confirmTemplateUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{id}/content': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['downloadTemplateContent'];
    put?: never;
    post: operations['uploadTemplateContent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{id}/info': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getTemplateInfo'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{id}/remove': {
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
    patch: operations['removeDraftTemplate'];
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
  '/api/v1/uploads/{id}/info': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getPrivateFileInfo'];
    put?: never;
    post?: never;
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
  '/api/v1/workspace/upload-capabilities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getUploadCapabilities'];
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
    AccountEventGrantDto: {
      active: boolean;
      /** Format: uuid */
      eventId: string;
      eventName: string | null;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      memberId: string;
    };
    AccountHostingGrantDto: {
      active: boolean;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      memberId: string;
      /** Format: uuid */
      organizationId: string | null;
    };
    AccountMembershipDto: {
      active: boolean;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      organizationId: string;
      organizationName: string;
      /** @enum {string} */
      role:
        | 'EVENT_MANAGER'
        | 'ORGANIZER'
        | 'REVIEWER'
        | 'SYSTEM_ADMIN'
        | 'HEADQUARTERS_SUPER_ADMIN';
    };
    AccountMembershipInputDto: {
      /** Format: uuid */
      organizationId: string;
      /** @enum {string} */
      role:
        | 'EVENT_MANAGER'
        | 'ORGANIZER'
        | 'REVIEWER'
        | 'SYSTEM_ADMIN'
        | 'HEADQUARTERS_SUPER_ADMIN';
    };
    AccountSummaryDto: {
      active: boolean;
      displayName: string;
      eventGrantIds: string[];
      eventGrants: components['schemas']['AccountEventGrantDto'][];
      hostingHandlerGrant:
        | components['schemas']['AccountHostingGrantDto']
        | null;
      /** Format: uuid */
      hostingHandlerGrantId: string | null;
      hostingReviewGrant:
        | components['schemas']['AccountHostingGrantDto']
        | null;
      /** Format: uuid */
      hostingReviewGrantId: string | null;
      /** Format: uuid */
      id: string;
      loginName: string | null;
      memberships: components['schemas']['AccountMembershipDto'][];
      mustChangePassword: boolean;
      passwordConfigured: boolean;
    };
    ActivateIndividualDto: {
      expectedRevision: number;
      reason: string;
    };
    ActiveDto: {
      active: boolean;
    };
    AddEventTeamDto: {
      teamId: string;
    };
    AdjustScheduleMatchDto: {
      commandId: string;
      expectedRevision: number;
      startAt: string;
      venue: string;
    };
    AgentCancelConfirmationDto: {
      id: string;
      /** @enum {string} */
      state: 'CANCELLED';
    };
    AgentCandidateChangeDto: {
      afterStartAt: string;
      afterVenue: string;
      awayLabel: string;
      beforeStartAt: string;
      beforeVenue: string;
      homeLabel: string;
      matchId: string;
    };
    AgentCandidateDto: {
      detail?: string;
      id: string;
      label: string;
    };
    AgentCandidatePreferenceDto: {
      conditionId: string;
      reason: string;
      /** @enum {string} */
      status: 'SATISFIED' | 'UNMET' | 'NOT_APPLICABLE';
    };
    AgentCandidateSaveCancelledDto: {
      eventId: string;
      id: string;
      /** @enum {string} */
      state: 'CANCELLED';
    };
    AgentCandidateSaveReceiptDto: {
      candidateId: string;
      commandId: string;
      eventId: string;
      matchCount: number;
      replayed: boolean;
      revision: number;
      /** @enum {string} */
      status: 'DRAFT';
      ticketId: string;
    };
    AgentCandidateSaveTicketDto: {
      baselineRevision: number;
      canConfirm: boolean;
      candidateHash: string;
      candidateId: string;
      commandId: string;
      eventId: string;
      expiresAt: string;
      id: string;
      matchCount: number;
      planningId: string;
      planningRevision: number;
      receipt?: components['schemas']['AgentCandidateSaveReceiptDto'] | null;
      /** @enum {string} */
      state: 'PENDING' | 'EXECUTED' | 'CANCELLED';
    };
    AgentConfirmationSummaryDto: {
      afterStartAt: string;
      afterVenue: string;
      awayLabel: string;
      beforeStartAt: string;
      beforeVenue: string;
      homeLabel: string;
    };
    AgentConfirmationTicketViewDto: {
      actorDisplayName: string;
      actorId: string;
      eventId: string;
      eventName: string;
      expectedRevision: number;
      expiresAt: string;
      id: string;
      matchId: string;
      parameterHash: string;
      parameterSummary: components['schemas']['AgentConfirmationSummaryDto'];
      /** @enum {string} */
      state: 'PENDING' | 'EXECUTED' | 'CANCELLED';
      toolVersion: string;
    };
    AgentExecutionReceiptDto: {
      executedAt: string;
      result: components['schemas']['AgentScheduleAdjustmentResultDto'];
    };
    AgentMemoryDeletedDto: {
      id: string;
      /** @enum {string} */
      status: 'DELETED';
    };
    AgentMemoryInputDto: {
      /** @description Explicit personal preference; never a business rule or execution instruction. */
      content: string;
    };
    AgentMemoryViewDto: {
      content: string;
      createdAt: string;
      id: string;
      revision: number;
      updatedAt: string;
    };
    AgentMessageInputDto: {
      eventId?: string;
      matchId?: string;
      message: string;
      newTask?: boolean;
      planningId?: string;
      planningRevision?: number;
      taskId?: string;
      teamId?: string;
    };
    AgentModelConnectionResultDto: {
      message: string;
      /** @enum {string} */
      status: 'NOT_TESTED' | 'SUCCEEDED' | 'FAILED' | 'NOT_APPLICABLE';
      testedAt?: string | null;
    };
    AgentModelStatusDto: {
      baseUrlHost?: string | null;
      credentialsConfigured: boolean;
      lastConnectionTest: components['schemas']['AgentModelConnectionResultDto'];
      /** @enum {string} */
      mode: 'SIMULATED' | 'QWEN';
      modelName: string;
    };
    AgentPendingQuestionDto: {
      expiresAt: string;
      kind: string;
      planningId: string;
      planningRevision: number;
      question: string;
    };
    AgentPlanningConditionDto: {
      /** @enum {string} */
      availability?: 'AVAILABLE' | 'ONLY' | 'BLOCK';
      /** @enum {string} */
      capacityScope?: 'EVENT' | 'VENUE';
      /** @enum {string} */
      confirmation: 'PENDING' | 'CONFIRMED';
      /** @enum {string} */
      dateSource?: 'USER' | 'EVENT_PROFILE' | 'EVENT_SCHEDULE';
      dates?: string[];
      /** @enum {string} */
      daypart?: 'MORNING' | 'AFTERNOON' | 'EVENING';
      durationDays?: number;
      endTime?: string;
      eventId: string;
      /** @enum {string} */
      format?: 'ROUND_ROBIN';
      from?: string;
      id: string;
      /** @enum {string} */
      kind:
        | 'DATE_RANGE'
        | 'TEAM_WINDOW'
        | 'MATCHUP'
        | 'FORMAT'
        | 'DAYPART_CAPACITY';
      /** @enum {string} */
      matchup?: 'PREFER' | 'AVOID';
      maxMatchesPerDay?: number;
      opponentId?: string;
      opponentLabel?: string;
      /** @enum {string} */
      priority: 'MUST' | 'PREFER';
      scheduleGoal?: boolean;
      sourceTurnIds: string[];
      startTime?: string;
      teamId?: string;
      teamLabel?: string;
      to?: string;
      weekdays?: number[];
    };
    AgentPlanningRequestViewDto: {
      conditions: components['schemas']['AgentPlanningConditionDto'][];
      confirmedRevision?: number | null;
      eventId: string;
      eventName: string;
      id: string;
      issues: string[];
      pending: string[];
      revision: number;
      sourceTurns: components['schemas']['AgentPlanningSourceTurnDto'][];
      /** @enum {string} */
      status: 'COLLECTING' | 'CONFIRMED' | 'STALE';
      summary: string;
      /** @enum {string} */
      type: 'SCHEDULE_PLANNING';
      updatedAt: string;
    };
    AgentPlanningSourceTurnDto: {
      content: string;
      id: string;
    };
    AgentReplyDto: {
      candidates: components['schemas']['AgentCandidateDto'][];
      message: string;
      pendingQuestion?: components['schemas']['AgentPendingQuestionDto'] | null;
      planningRequest?:
        | components['schemas']['AgentPlanningRequestViewDto']
        | null;
      sessionId: string;
      /** @enum {string} */
      status:
        | 'NEED_EVENT'
        | 'NEED_MATCH'
        | 'NEED_PARAMETERS'
        | 'PREVIEW'
        | 'STALE'
        | 'ERROR'
        | 'CHAT'
        | 'CLARIFY'
        | 'UNSUPPORTED'
        | 'QUERY'
        | 'PLAN'
        | 'NEED_TEAM';
      suggestedMemory?: string | null;
      task?: components['schemas']['AgentTaskViewDto'] | null;
    };
    AgentScheduleAdjustmentResultDto: {
      commandId: string;
      eventId: string;
      issues: components['schemas']['ScheduleIssueDto'][];
      matchId: string;
      replayed: boolean;
      revision: number;
      /** @enum {string} */
      status: 'DRAFT';
      ticketId: string;
    };
    AgentScheduleCandidateViewDto: {
      baselineRevision: number;
      canSave: boolean;
      changes: components['schemas']['AgentCandidateChangeDto'][];
      config: components['schemas']['ScheduleConfigDto'];
      configSource: string;
      createdAt: string;
      eventId: string;
      explored: number;
      fixedMatchIds: string[];
      /** @enum {string} */
      format: 'ROUND_ROBIN';
      id: string;
      issues: components['schemas']['ScheduleIssueDto'][];
      matches: components['schemas']['ScheduleMatchDto'][];
      planningId: string;
      planningRevision: number;
      preferences: components['schemas']['AgentCandidatePreferenceDto'][];
      /** @enum {string} */
      status: 'FOUND' | 'PROVEN_CONFLICT' | 'SEARCH_LIMIT' | 'STALE';
      warning: string;
    };
    AgentSessionInputDto: {
      currentEventId?: string;
    };
    AgentSessionViewDto: {
      currentEventId?: string | null;
      currentMatchId?: string | null;
      id: string;
      lastExecution?: components['schemas']['AgentExecutionReceiptDto'] | null;
      pendingQuestion?: components['schemas']['AgentPendingQuestionDto'] | null;
      planningRequest?:
        | components['schemas']['AgentPlanningRequestViewDto']
        | null;
      summary: string;
      task?: components['schemas']['AgentTaskViewDto'] | null;
      turns: components['schemas']['AgentTurnViewDto'][];
      updatedAt: string;
    };
    AgentSkillInputDto: {
      instructions: string;
      /** @enum {string} */
      skillKey: 'INTENT_ROUTING' | 'TOOL_SELECTION' | 'SCHEDULE_PLANNING';
    };
    AgentSkillVersionDto: {
      activatedAt?: string | null;
      createdAt: string;
      id: string;
      instructions: string;
      /** @enum {string} */
      skillKey: 'INTENT_ROUTING' | 'TOOL_SELECTION' | 'SCHEDULE_PLANNING';
      /** @enum {string} */
      state: 'DRAFT' | 'ACTIVE' | 'RETIRED';
      version: number;
    };
    AgentTaskParametersDto: {
      sourceMatchId?: string;
      sourceOrdinal?: number;
      sourceWeekday?: number;
      targetDate?: string;
      targetHour?: number;
      targetMinute?: number;
      targetStartAt?: string;
      targetWeekday?: number;
      venue?: string;
    };
    AgentTaskViewDto: {
      baselineRevision?: number | null;
      confirmation?:
        | components['schemas']['AgentConfirmationTicketViewDto']
        | null;
      eventId?: string | null;
      expiresAt?: string | null;
      goal: string;
      id: string;
      matchId?: string | null;
      parameters: components['schemas']['AgentTaskParametersDto'];
      pendingFields: string[];
      preview?: components['schemas']['ScheduleAdjustmentPreviewDto'] | null;
      /** @enum {string} */
      step:
        | 'LOCATE_EVENT'
        | 'LOCATE_MATCH'
        | 'WAITING_PARAMETERS'
        | 'PREVIEW_READY'
        | 'STALE'
        | 'FAILED'
        | 'EXECUTED'
        | 'CANCELLED';
    };
    AgentToolDefinitionDto: {
      confirmation: string;
      name: string;
      permission: string;
      /** @enum {string} */
      risk: 'READ' | 'REQUIREMENTS' | 'PREVIEW' | 'DRAFT_WRITE';
      version: string;
    };
    AgentTurnViewDto: {
      content: string;
      createdAt: string;
      id: string;
      /** @enum {string} */
      role: 'USER' | 'ASSISTANT';
    };
    AiAssignmentDto: {
      organizationId: string | null;
      reason: string;
    };
    AiBillInputDto: {
      amountMicros: string;
      currency: string;
      from: string;
      note: string;
      provider: string;
      to: string;
    };
    AiPriceInputDto: {
      cachedMicrosPerMillion: string | null;
      currency: string;
      effectiveAt: string;
      inputMicrosPerMillion: string;
      model: string;
      outputMicrosPerMillion: string;
      provider: string;
      reason: string;
    };
    AiQuotaInputDto: {
      dailyTokens: number | null;
      enabled: boolean;
      expectedRevision: number;
      monthlyTokens: number | null;
      paused: boolean;
      reason: string;
      /** @enum {string} */
      scope: 'ACCOUNT' | 'ORGANIZATION';
      subjectId: string;
    };
    AiResolveUsageDto: {
      inputTokens: number;
      outputTokens: number;
      reason: string;
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
    AuthenticationModeDto: {
      localIdentityEnabled: boolean;
      serverTestIdentityEnabled: boolean;
      wechatMiniappEnabled: boolean;
    };
    AuthenticationSessionDto: {
      csrfToken: string;
      displayName: string;
      /** Format: date-time */
      expiresAt: string;
      /** Format: uuid */
      id: string;
      mustChangePassword: boolean;
      roles: (
        | 'EVENT_MANAGER'
        | 'ORGANIZER'
        | 'REVIEWER'
        | 'SYSTEM_ADMIN'
        | 'HEADQUARTERS_SUPER_ADMIN'
      )[];
    };
    ChangePasswordDto: {
      currentPassword: string;
      newPassword: string;
    };
    CloseDto: {
      expectedRevision: number;
      reason: string;
    };
    CompetitionEventViewDto: {
      /** Format: uuid */
      id: string;
      name: string;
    };
    ConfigureTaskDto: {
      expectedRevision: number;
      requirements: components['schemas']['RequirementsDto'];
    };
    ConfirmAgentCandidateSaveDto: {
      candidateHash: string;
      candidateId: string;
    };
    ConfirmAgentPlanningRequestDto: {
      expectedRevision: number;
    };
    ConfirmAgentScheduleAdjustmentDto: {
      eventId: string;
      matchId: string;
      parameterHash: string;
    };
    ConfirmHostingPermitDto: {
      /** Format: uuid */
      key: string;
      /** Format: uuid */
      submissionId: string;
    };
    CreateAccountDto: {
      displayName: string;
      loginName: string;
      memberships: components['schemas']['AccountMembershipInputDto'][];
      temporaryPassword: string;
    };
    CreateEventMaterialsDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      key: string;
    };
    CreateEventStaffDto: {
      id: string;
      profile: components['schemas']['EventStaffProfileDto'];
    };
    CreateEventSupplyItemDto: {
      /** Format: uuid */
      id: string;
      name: string;
      notes?: string;
      quantity: number;
    };
    CreateEventSupplyPhotoDto: {
      expectedBytes: number;
      /** @enum {string} */
      extension: 'png' | 'jpg' | 'jpeg';
      /** Format: uuid */
      id: string;
      originalName: string;
      sha256: string;
    };
    CreateHostingApplicationDto: {
      /** Format: uuid */
      applicantOrganizationId: string;
      /** @enum {number} */
      formVersion?: 1 | 2;
      /** Format: uuid */
      key: string;
    };
    CreateIndividualDto: {
      content: components['schemas']['IndividualContentDto'];
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      key: string;
      requirementItemId?: string | null;
      /** Format: uuid */
      taskId: string;
    };
    CreateIndividualTaskDto: {
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      handlerMemberId: string;
      /** Format: uuid */
      organizationId: string;
      title: string;
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
    CreateTeamDto: {
      eventId?: string;
      id: string;
      organizationId: string;
      profile: components['schemas']['TeamProfileDto'];
    };
    DeadlineDto: {
      /** Format: date-time */
      deadline: string;
      id: string;
    };
    DeadlineHistoryDto: {
      /** Format: uuid */
      actorId: string;
      actorName: string;
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
    EventParticipantDto: {
      contactPhone: string;
      id: string;
      jerseyNumber: string;
      name: string;
      notes: string;
      position: string;
      /** @enum {string} */
      role: 'PLAYER' | 'COACH' | 'MANAGER' | 'MEDICAL' | 'OTHER';
    };
    EventSituationMatchDto: {
      awayLabel: string;
      awayTeam: components['schemas']['EventTeamRosterViewDto'] | null;
      homeLabel: string;
      homeTeam: components['schemas']['EventTeamRosterViewDto'] | null;
      id: string;
      order: number;
      round: number;
      staff: components['schemas']['MatchStaffMemberDto'][];
      staffRevision: number;
      startAt: string;
      venue: string;
    };
    EventSituationViewDto: {
      eventId: string;
      eventName: string;
      exists: boolean;
      matches: components['schemas']['EventSituationMatchDto'][];
      scheduleRevision: number;
      /** @enum {string} */
      scheduleStatus: 'DRAFT' | 'PUBLISHED';
      updatedAt: string;
    };
    EventStaffHistoryDto: {
      active: boolean;
      actorId: string;
      actorName: string;
      createdAt: string;
      profile: components['schemas']['EventStaffProfileDto'];
      revision: number;
    };
    EventStaffProfileDto: {
      contactPhone: string;
      duties: string;
      name: string;
      notes: string;
      organization: string;
      roles: string[];
    };
    EventStaffViewDto: {
      active: boolean;
      eventId: string;
      id: string;
      profile: components['schemas']['EventStaffProfileDto'];
      revision: number;
      updatedAt: string;
    };
    EventSupplyHistoryDto: {
      action: string;
      /** Format: uuid */
      actorId: string;
      /** Format: uuid */
      id: string;
      /** Format: date-time */
      occurredAt: string;
      revision: number;
      snapshot: {
        [key: string]: unknown;
      };
    };
    EventSupplyItemViewDto: {
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      createdBy: string;
      /** Format: uuid */
      eventId: string;
      /** Format: uuid */
      id: string;
      name: string;
      notes: string;
      photos: components['schemas']['EventSupplyPhotoViewDto'][];
      quantity: number;
      revision: number;
      /** @enum {string} */
      status: 'TO_PREPARE' | 'PREPARING' | 'READY' | 'SHORTAGE';
      /** Format: date-time */
      updatedAt: string;
      /** Format: uuid */
      updatedBy: string;
    };
    EventSupplyPhotoViewDto: {
      /** Format: date-time */
      confirmedAt: string | null;
      expectedBytes: number;
      /** @enum {string} */
      extension: 'png' | 'jpg' | 'jpeg';
      /** Format: uuid */
      id: string;
      originalName: string;
      /** @enum {string} */
      state: 'PENDING' | 'CONFIRMED' | 'REMOVED';
    };
    EventTeamRosterViewDto: {
      eventTeamId: string;
      members: components['schemas']['EventParticipantDto'][];
      revision: number;
      teamName: string;
      updatedAt: string;
    };
    EventViewDto: {
      /** Format: date-time */
      createdAt: string;
      description: string;
      /** Format: uuid */
      id: string;
      /** @enum {string|null} */
      lifecycleState?: 'PREPARING_INTERNAL' | null;
      name: string;
      profile: Record<string, never> | null;
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
    FileInfoDto: {
      bytes: number;
      extension: string;
      /** Format: uuid */
      id: string;
      name: string;
      originalNameKnown: boolean;
    };
    GenerateAgentScheduleCandidateDto: {
      baselineRevision: number;
      config: components['schemas']['ScheduleConfigDto'];
      /** @enum {string} */
      configSource: 'EVENT_SCHEDULE' | 'EXPLICIT';
      expectedRevision: number;
      fixedMatchIds: string[];
      /** @enum {string} */
      format: 'ROUND_ROBIN';
    };
    GenerateScheduleDto: {
      commandId: string;
      config: components['schemas']['ScheduleConfigDto'];
      /** @enum {string} */
      format: 'ROUND_ROBIN' | 'SINGLE_ELIMINATION';
    };
    GovernanceAlertUpdateDto: {
      note: string;
      ownerId: string | null;
    };
    GovernanceExportDto: {
      count: number;
      csv: string;
    };
    GovernanceFieldDto: {
      label: string;
      value: string;
    };
    GovernanceOverviewDto: {
      asOf: string;
      metrics: components['schemas']['GovernanceFieldDto'][];
    };
    GovernancePageDto: {
      asOf: string;
      items: components['schemas']['GovernanceRowDto'][];
      nextCursor: string | null;
    };
    GovernanceQueryDto: {
      action?: string;
      actorId?: string;
      cursor?: string;
      eventId?: string;
      from?: string;
      limit?: string;
      mode?: string;
      model?: string;
      organizationId?: string;
      outcome?: string;
      phase?: string;
      requestId?: string;
      resourceId?: string;
      to?: string;
    };
    GovernanceReasonDto: {
      cursor?: string;
      reason: string;
    };
    GovernanceResultDto: {
      id: string;
      message: string;
    };
    GovernanceRevokeDto: {
      reason: string;
      sessionId?: string;
    };
    GovernanceRowDto: {
      actorId: string | null;
      at: string;
      fields: components['schemas']['GovernanceFieldDto'][];
      id: string;
      requestId: string | null;
      resourceId: string | null;
      status: string;
      title: string;
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
    HostingActionViewDto: {
      action: string;
      /** Format: uuid */
      actorId: string;
      detail: {
        [key: string]: unknown;
      };
      /** @enum {string} */
      fromState:
        | 'DRAFT'
        | 'PENDING_REVIEW'
        | 'IN_REVIEW'
        | 'NEEDS_SUPPLEMENT'
        | 'REJECTED'
        | 'APPROVED';
      /** Format: uuid */
      id: string;
      /** Format: date-time */
      occurredAt: string;
      /** @enum {string} */
      toState:
        | 'DRAFT'
        | 'PENDING_REVIEW'
        | 'IN_REVIEW'
        | 'NEEDS_SUPPLEMENT'
        | 'REJECTED'
        | 'APPROVED';
    };
    HostingAdministrativeAreaDto: {
      city: string;
      district: string | null;
      province: string;
    };
    HostingApplicantOrganizationDto: {
      /** Format: uuid */
      id: string;
      name: string;
    };
    HostingApplicationDetailDto: {
      actions: components['schemas']['HostingActionViewDto'][];
      /** Format: uuid */
      applicantOrganizationId: string;
      applicantOrganizationName: string;
      /** Format: uuid */
      approvedEventId: string | null;
      /** @description Current actor has active application review access */
      canReview: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      currentSubmissionId: string | null;
      diffs: components['schemas']['HostingDiffViewDto'][];
      draft: {
        [key: string]: unknown;
      } | null;
      draftRevision: number;
      formVersion: number;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      materialEventId: string | null;
      revision: number;
      /** @enum {string} */
      status:
        | 'DRAFT'
        | 'PENDING_REVIEW'
        | 'IN_REVIEW'
        | 'NEEDS_SUPPLEMENT'
        | 'REJECTED'
        | 'APPROVED';
      submissions: components['schemas']['HostingSubmissionViewDto'][];
      uploads: components['schemas']['HostingUploadViewDto'][];
    };
    HostingApplicationListItemDto: {
      /** Format: uuid */
      applicantOrganizationId: string;
      applicantOrganizationName: string;
      /** Format: uuid */
      approvedEventId: string | null;
      /** @description Current actor has active application review access */
      canReview: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      currentSubmissionId: string | null;
      draftRevision: number;
      formVersion: number;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      materialEventId: string | null;
      revision: number;
      /** @enum {string} */
      status:
        | 'DRAFT'
        | 'PENDING_REVIEW'
        | 'IN_REVIEW'
        | 'NEEDS_SUPPLEMENT'
        | 'REJECTED'
        | 'APPROVED';
    };
    HostingDiffViewDto: {
      attachmentChanges: {
        [key: string]: unknown;
      }[];
      fieldChanges: {
        [key: string]: unknown;
      }[];
      /** Format: uuid */
      fromSubmissionId: string;
      /** Format: uuid */
      toSubmissionId: string;
    };
    HostingDraftFormDto: {
      additionalNotes?: string | null;
      bankAccountName?: string | null;
      bankAccountNumber?: string | null;
      bankName?: string | null;
      contactName?: string | null;
      contactPhone?: string | null;
      /** Format: date */
      endDate: string | null;
      endTime?: string | null;
      eventExperienceIntroduction: string | null;
      eventName: string | null;
      location: components['schemas']['HostingLocationDto'] | null;
      registrationEnd?: string | null;
      registrationStart?: string | null;
      /** Format: date */
      startDate: string | null;
      startTime?: string | null;
    };
    HostingGrantActiveDto: {
      active: boolean;
    };
    HostingGrantInputDto: {
      /** Format: uuid */
      memberId: string;
    };
    HostingGrantViewDto: {
      active: boolean;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      memberId: string;
      /** Format: uuid */
      organizationId: string | null;
    };
    HostingJourneyDto: {
      /** Format: uuid */
      applicationId: string;
      applicationStatus: string;
      canConfirm: boolean;
      eventName: string;
      history: components['schemas']['HostingActionViewDto'][];
      materialApplicationId: string | null;
      materialStatus: string | null;
      organizationName: string;
      permit: components['schemas']['HostingPermitDto'] | null;
      /** @enum {string} */
      stage: 'APPLICATION' | 'MATERIALS' | 'CONTRACT' | 'PERMITTED';
      updatedAt: string;
    };
    HostingLocationDto: {
      administrativeArea: components['schemas']['HostingAdministrativeAreaDto'];
      detailedAddress: string;
      venueName: string;
    };
    HostingPermitDto: {
      /** Format: date-time */
      confirmedAt: string;
      /** Format: uuid */
      confirmedBy: string;
    };
    HostingReasonCommandDto: {
      expectedRevision: number;
      /** Format: uuid */
      key: string;
      reason: string;
      /** Format: uuid */
      submissionId: string;
    };
    HostingReviewCommandDto: {
      expectedRevision: number;
      /** Format: uuid */
      key: string;
      /** Format: uuid */
      submissionId: string;
    };
    HostingSubmissionViewDto: {
      attachments: components['schemas']['HostingUploadViewDto'][];
      form: {
        [key: string]: unknown;
      };
      /** Format: uuid */
      id: string;
      /** Format: date-time */
      submittedAt: string;
      /** Format: uuid */
      submittedBy: string;
      version: number;
    };
    HostingSubmitDto: {
      expectedDraftRevision: number;
      expectedRevision: number;
      /** Format: uuid */
      key: string;
    };
    HostingUploadInputDto: {
      expectedBytes: number;
      /** @enum {string} */
      extension: 'pdf' | 'png' | 'jpg' | 'jpeg';
      originalName: string;
      /** @enum {string} */
      requirementCode: 'BUSINESS_LICENSE' | 'VENUE_PHOTO' | 'OTHER_DOCUMENT';
      sha256: string;
    };
    HostingUploadMutationDto: {
      expectedDraftRevision: number;
    };
    HostingUploadViewDto: {
      bound: boolean;
      expectedBytes: number;
      /** Format: date-time */
      expiresAt: string;
      extension: string;
      /** Format: uuid */
      id: string;
      originalName: string;
      /** @enum {string} */
      requirementCode: 'BUSINESS_LICENSE' | 'VENUE_PHOTO' | 'OTHER_DOCUMENT';
      /** @enum {string} */
      state: 'PENDING' | 'CONFIRMED';
    };
    IdDto: {
      /** Format: uuid */
      id: string;
    };
    IdentityBindingIntentDto: {
      bindingToken: string;
      /** Format: date-time */
      expiresAt: string;
    };
    IndividualActionDto: {
      action: string;
      actorId: string;
      actorName: string;
      content: components['schemas']['IndividualContentDto'] | null;
      /** @enum {string} */
      fromState:
        | 'DRAFT'
        | 'PENDING_REVIEW'
        | 'IN_REVIEW'
        | 'RETURNED'
        | 'APPROVED';
      id: string;
      modification: string;
      occurredAt: string;
      reason: string;
      revision: number;
      submissionId: string | null;
      /** @enum {string} */
      toState:
        | 'DRAFT'
        | 'PENDING_REVIEW'
        | 'IN_REVIEW'
        | 'RETURNED'
        | 'APPROVED';
    };
    IndividualCommandDto: {
      expectedDraftRevision?: number;
      expectedRevision: number;
      generation: number;
      /** Format: uuid */
      key: string;
      modification?: string;
      reason?: string;
      /** Format: uuid */
      submissionId?: string;
    };
    IndividualConflictDto: {
      code: string;
      current: components['schemas']['IndividualViewDto'];
      message: string;
    };
    IndividualContentDto: {
      category: string;
      fileIds: string[];
      text: string;
      title: string;
    };
    IndividualGrantDto: {
      active: boolean;
    };
    IndividualHistoryDto: {
      actions: components['schemas']['IndividualActionDto'][];
      materialRevision: number;
      serverTime: string;
      submissions: components['schemas']['IndividualSubmissionDto'][];
      total: number;
    };
    IndividualResultDto: {
      current: components['schemas']['IndividualViewDto'];
      resultRevision: number;
      resultSubmissionId: string | null;
    };
    IndividualSnapshotDto: {
      items: components['schemas']['IndividualViewDto'][];
      selected: components['schemas']['IndividualViewDto'] | null;
      serverTime: string;
      total: number;
    };
    IndividualSubmissionDto: {
      actorId: string;
      actorName: string;
      content: components['schemas']['IndividualContentDto'];
      deadline: string;
      generation: number;
      id: string;
      occurredAt: string;
      version: number;
    };
    IndividualUploadDto: {
      expectedBytes: number;
      extension: string;
      id: string;
      originalName: string;
      /** @enum {string} */
      state: 'PENDING' | 'CONFIRMED';
    };
    IndividualUploadInputDto: {
      expectedBytes: number;
      extension: string;
      generation: number;
      originalName: string;
      sha256: string;
    };
    IndividualViewDto: {
      closed: boolean;
      contextRevision: number;
      currentSubmissionId: string | null;
      deadline: string;
      draft: components['schemas']['IndividualContentDto'] | null;
      draftRevision: number;
      generation: number;
      id: string;
      lastAction: components['schemas']['IndividualActionDto'] | null;
      revision: number;
      /** @enum {string} */
      state: 'DRAFT' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'RETURNED' | 'APPROVED';
      submission: components['schemas']['IndividualSubmissionDto'] | null;
      taskId: string;
    };
    IssueDto: {
      instruction: string;
      /** Format: uuid */
      materialId: string;
      reason: string;
    };
    LocalIdentityChoiceDto: {
      displayName: string;
      /** @enum {string} */
      key:
        | 'super-admin'
        | 'event-manager'
        | 'reviewer-a'
        | 'reviewer-b'
        | 'organizer-a'
        | 'organizer-b';
      organizationName: string;
      /** @enum {string} */
      role:
        | 'EVENT_MANAGER'
        | 'ORGANIZER'
        | 'REVIEWER'
        | 'SYSTEM_ADMIN'
        | 'HEADQUARTERS_SUPER_ADMIN';
    };
    LocalSessionDto: {
      /** Format: date-time */
      expiresAt: string;
      /** @enum {string} */
      identity:
        | 'super-admin'
        | 'event-manager'
        | 'reviewer-a'
        | 'reviewer-b'
        | 'organizer-a'
        | 'organizer-b';
      token: string;
    };
    LocalSessionRequestDto: {
      /** @enum {string} */
      identity:
        | 'super-admin'
        | 'event-manager'
        | 'reviewer-a'
        | 'reviewer-b'
        | 'organizer-a'
        | 'organizer-b';
    };
    LoginRequestDto: {
      loginName: string;
      password: string;
    };
    MatchStaffMemberDto: {
      contactPhone: string;
      id: string;
      name: string;
      notes: string;
      organization: string;
      role: string;
      sourceStaffId?: string;
      sourceStaffRevision?: number;
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
      role:
        | 'EVENT_MANAGER'
        | 'ORGANIZER'
        | 'REVIEWER'
        | 'SYSTEM_ADMIN'
        | 'HEADQUARTERS_SUPER_ADMIN';
      /** Format: uuid */
      userId: string;
    };
    MemberDto: {
      /** Format: uuid */
      organizationId: string;
      /** @enum {string} */
      role:
        | 'EVENT_MANAGER'
        | 'ORGANIZER'
        | 'REVIEWER'
        | 'SYSTEM_ADMIN'
        | 'HEADQUARTERS_SUPER_ADMIN';
      /** Format: uuid */
      userId: string;
    };
    MutateEventSupplyPhotoDto: {
      expectedRevision: number;
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
    PrepareAgentCandidateSaveDto: {
      expectedBaselineRevision: number;
      expectedPlanningRevision: number;
    };
    PreviewScheduleAdjustmentDto: {
      expectedRevision: number;
      matchId: string;
      startAt: string;
      venue: string;
    };
    PublishScheduleDto: {
      commandId: string;
      expectedRevision: number;
    };
    ReadyDto: {
      /** @enum {string} */
      service: 'caau-api';
      /** @enum {string} */
      status: 'ready';
    };
    ReplaceEventTeamRosterDto: {
      expectedRevision: number;
      members: components['schemas']['EventParticipantDto'][];
    };
    ReplaceMatchStaffDto: {
      expectedRevision: number;
      expectedScheduleRevision: number;
      staff: components['schemas']['MatchStaffMemberDto'][];
    };
    RequirementsDto: {
      /** Format: date-time */
      deadline: string;
      /** @description Empty allowed only for individual channel tasks */
      materials: components['schemas']['MaterialRequirementDto'][];
    };
    ResetPasswordDto: {
      temporaryPassword: string;
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
      actorName: string;
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
    SaveHostingDraftDto: {
      expectedDraftRevision: number;
      form: components['schemas']['HostingDraftFormDto'];
    };
    SaveIndividualDto: {
      content: components['schemas']['IndividualContentDto'];
      expectedDraftRevision: number;
      generation: number;
    };
    ScheduleAdjustmentPreviewDto: {
      after: components['schemas']['ScheduleMatchDto'];
      baselineRevision: number;
      before: components['schemas']['ScheduleMatchDto'];
      eventId: string;
      expiresAt: string;
      issues: components['schemas']['ScheduleIssueDto'][];
    };
    ScheduleConfigDto: {
      bufferMinutes: number;
      dailyEnd: string;
      dailyStart: string;
      durationMinutes: number;
      endDate: string;
      minRestMinutes: number;
      startDate: string;
      teamIds: string[];
      venues: string[];
    };
    ScheduleIssueDto: {
      code: string;
      matchIds: string[];
      message: string;
    };
    ScheduleMatchDto: {
      awayEventTeamId: string;
      awayLabel: string;
      awaySourceMatchId: string;
      homeEventTeamId: string;
      homeLabel: string;
      homeSourceMatchId: string;
      id: string;
      order: number;
      round: number;
      startAt: string;
      venue: string;
    };
    ScheduleViewDto: {
      config: components['schemas']['ScheduleConfigDto'];
      eventId: string;
      exists: boolean;
      /** @enum {string} */
      format: 'ROUND_ROBIN' | 'SINGLE_ELIMINATION';
      issues: components['schemas']['ScheduleIssueDto'][];
      matches: components['schemas']['ScheduleMatchDto'][];
      publishedAt: string;
      revision: number;
      /** @enum {string} */
      status: 'DRAFT' | 'PUBLISHED';
      updatedAt: string;
    };
    SubmissionViewDto: {
      /** Format: uuid */
      actorId: string;
      actorName: string;
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
      individualChannel: boolean;
      /** Format: uuid */
      organizationId: string;
      organizationName: string;
      /** Format: date-time */
      publishedAt: string | null;
      requirementVersion: number | null;
      requirements: components['schemas']['RequirementsDto'] | null;
      reviewerMemberId: string | null;
      revision: number;
      /** @enum {string} */
      state: 'DRAFT' | 'PUBLISHED';
      templateFiles: components['schemas']['TemplateFileDto'][];
      title: string;
    };
    TeamOrganizationDto: {
      id: string;
      name: string;
    };
    TeamProfileDto: {
      address: string;
      city: string;
      clubName: string;
      contactName: string;
      contactPhone: string;
      district: string;
      introduction: string;
      name: string;
      notes: string;
      province: string;
      shortName: string;
    };
    TeamViewDto: {
      active: boolean;
      bound: boolean;
      canEdit: boolean;
      eventId: string;
      id: string;
      organizationId: string;
      profile: components['schemas']['TeamProfileDto'];
      revision: number;
      sourceTeamRevision: number;
      teamId: string;
      updatedAt: string;
    };
    TemplateFileDto: {
      bytes: number;
      extension: string;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      materialId: string;
      name: string;
      originalNameKnown: boolean;
    };
    TemplateUploadDto: {
      expectedBytes: number;
      /** @enum {string} */
      extension: 'txt' | 'pdf' | 'png' | 'jpg' | 'jpeg';
      /** Format: uuid */
      materialId: string;
      originalName: string;
      sha256: string;
    };
    TemplateUploadViewDto: {
      /** Format: date-time */
      expiresAt: string;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      state: 'PENDING' | 'CONFIRMED';
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
    UpdateEventStaffDto: {
      active: boolean;
      expectedRevision: number;
      profile: components['schemas']['EventStaffProfileDto'];
    };
    UpdateEventSupplyItemDto: {
      expectedRevision: number;
      name: string;
      notes: string;
      quantity: number;
      /** @enum {string} */
      status: 'TO_PREPARE' | 'PREPARING' | 'READY' | 'SHORTAGE';
    };
    UpdateTeamDto: {
      active: boolean;
      expectedRevision: number;
      profile: components['schemas']['TeamProfileDto'];
    };
    UploadCapabilitiesDto: {
      formats: string[];
      maxBytes: number;
    };
    UploadDto: {
      expectedBytes: number;
      /** @enum {string} */
      extension: 'txt' | 'pdf' | 'png' | 'jpg' | 'jpeg';
      /** Format: uuid */
      materialId: string;
      originalName?: string;
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
    WechatBindRequestDto: {
      bindingToken: string;
      code: string;
    };
    WechatLoginRequestDto: {
      code: string;
    };
    WechatSessionDto: {
      /** Format: date-time */
      expiresAt: string;
      token: string;
    };
    WorkspaceIdentityDto: {
      /** @description Current actor may administer internal accounts */
      canManageAccounts: boolean;
      /** @description Active headquarters hosting application review access */
      canReviewHostingApplications: boolean;
      displayName: string;
      /** @description Organizations where the current actor has active hosting application handling access */
      hostingApplicantOrganizations: components['schemas']['HostingApplicantOrganizationDto'][];
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
  HostingController_handlerGrant: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['HostingGrantInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingGrantViewDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_handlerGrantActive: {
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
        'application/json': components['schemas']['HostingGrantActiveDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingGrantViewDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_reviewGrant: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['HostingGrantInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingGrantViewDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_reviewGrantActive: {
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
        'application/json': components['schemas']['HostingGrantActiveDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingGrantViewDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  cancelAgentCandidateDraftSave: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        ticketId: string;
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
          'application/json': components['schemas']['AgentCandidateSaveCancelledDto'];
        };
      };
    };
  };
  confirmAgentCandidateDraftSave: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        ticketId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConfirmAgentCandidateSaveDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentCandidateSaveReceiptDto'];
        };
      };
    };
  };
  cancelAgentScheduleAdjustment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        ticketId: string;
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
          'application/json': components['schemas']['AgentCancelConfirmationDto'];
        };
      };
    };
  };
  confirmAgentScheduleAdjustment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        ticketId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConfirmAgentScheduleAdjustmentDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentScheduleAdjustmentResultDto'];
        };
      };
    };
  };
  listAgentMemories: {
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
          'application/json': components['schemas']['AgentMemoryViewDto'][];
        };
      };
    };
  };
  createAgentMemory: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AgentMemoryInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentMemoryViewDto'];
        };
      };
    };
  };
  deleteAgentMemory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        memoryId: string;
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
          'application/json': components['schemas']['AgentMemoryDeletedDto'];
        };
      };
    };
  };
  getAgentModelStatus: {
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
          'application/json': components['schemas']['AgentModelStatusDto'];
        };
      };
    };
  };
  testAgentModelConnection: {
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
          'application/json': components['schemas']['AgentModelStatusDto'];
        };
      };
    };
  };
  previewAgentScheduleCandidate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        planningId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GenerateAgentScheduleCandidateDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentScheduleCandidateViewDto'];
        };
      };
    };
  };
  getLatestAgentScheduleCandidate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        planningId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Most recent candidate; 404 when absent. Re-authorized and freshness-checked. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentScheduleCandidateViewDto'];
        };
      };
    };
  };
  getAgentScheduleCandidate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        planningId: string;
        candidateId: string;
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
          'application/json': components['schemas']['AgentScheduleCandidateViewDto'];
        };
      };
    };
  };
  prepareAgentCandidateDraftSave: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        planningId: string;
        candidateId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PrepareAgentCandidateSaveDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentCandidateSaveTicketDto'];
        };
      };
    };
  };
  getLatestAgentCandidateDraftSaveTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        planningId: string;
        candidateId: string;
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
          'application/json': components['schemas']['AgentCandidateSaveTicketDto'];
        };
      };
    };
  };
  confirmAgentPlanningRequest: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        planningId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConfirmAgentPlanningRequestDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentPlanningRequestViewDto'];
        };
      };
    };
  };
  listAgentSessions: {
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
          'application/json': components['schemas']['AgentSessionViewDto'][];
        };
      };
    };
  };
  createAgentSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AgentSessionInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentSessionViewDto'];
        };
      };
    };
  };
  getAgentSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
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
          'application/json': components['schemas']['AgentSessionViewDto'];
        };
      };
    };
  };
  sendAgentMessage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AgentMessageInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentReplyDto'];
        };
      };
    };
  };
  setAiCostAssignment: {
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
        'application/json': components['schemas']['AiAssignmentDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceResultDto'];
        };
      };
    };
  };
  createAiSupplierBill: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AiBillInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceResultDto'];
        };
      };
    };
  };
  resolveAiUsage: {
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
        'application/json': components['schemas']['AiResolveUsageDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceResultDto'];
        };
      };
    };
  };
  createAiModelPrice: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AiPriceInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceResultDto'];
        };
      };
    };
  };
  setAiUsageQuota: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AiQuotaInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceResultDto'];
        };
      };
    };
  };
  changePassword: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ChangePasswordDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthenticationSessionDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  passwordLogin: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LoginRequestDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthenticationSessionDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  passwordLogout: {
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
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getAuthenticationMode: {
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
          'application/json': components['schemas']['AuthenticationModeDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getAuthenticationSession: {
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
          'application/json': components['schemas']['AuthenticationSessionDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  bindWechatMiniapp: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['WechatBindRequestDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WechatSessionDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createWechatBindingIntent: {
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
          'application/json': components['schemas']['IdentityBindingIntentDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  wechatMiniappLogin: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['WechatLoginRequestDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WechatSessionDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication required or failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Origin, CSRF or access denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Sign-in temporarily unavailable */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Authentication unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAccounts: {
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
          'application/json': components['schemas']['AccountSummaryDto'][];
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
  createAccount: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateAccountDto'];
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
  resetAccountPassword: {
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
        'application/json': components['schemas']['ResetPasswordDto'];
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
  listCompetitionEvents: {
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
          'application/json': components['schemas']['CompetitionEventViewDto'][];
        };
      };
    };
  };
  setEventGrantActive: {
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
        'application/json': components['schemas']['IndividualGrantDto'];
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
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_listMaterials: {
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
          'application/json': components['schemas']['HostingApplicationListItemDto'][];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_createMaterials: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEventMaterialsDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingApplicationListItemDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_confirmPermit: {
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
        'application/json': components['schemas']['ConfirmHostingPermitDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingPermitDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  confirmEventSupplyPhoto: {
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
        'application/json': components['schemas']['MutateEventSupplyPhotoDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventSupplyPhotoViewDto'];
        };
      };
    };
  };
  EventSuppliesController_download: {
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
    };
  };
  EventSuppliesController_upload: {
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
          'application/json': {
            /** Format: uuid */
            id?: string;
          };
        };
      };
    };
  };
  removeEventSupplyPhoto: {
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
        'application/json': components['schemas']['MutateEventSupplyPhotoDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventSupplyPhotoViewDto'];
        };
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
  replaceEventMatchStaff: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
        matchId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReplaceMatchStaffDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventSituationViewDto'];
        };
      };
    };
  };
  getEventSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
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
          'application/json': components['schemas']['ScheduleViewDto'];
        };
      };
      /** @description Revision, command, or validation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  generateEventSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GenerateScheduleDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ScheduleViewDto'];
        };
      };
      /** @description Revision, command, or validation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adjustEventScheduleMatch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
        matchId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AdjustScheduleMatchDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ScheduleViewDto'];
        };
      };
      /** @description Revision, command, or validation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  previewEventScheduleAdjustment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PreviewScheduleAdjustmentDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ScheduleAdjustmentPreviewDto'];
        };
      };
      /** @description Revision, command, or validation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  publishEventSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishScheduleDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ScheduleViewDto'];
        };
      };
      /** @description Revision, command, or validation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getEventSituation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
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
          'application/json': components['schemas']['EventSituationViewDto'];
        };
      };
    };
  };
  listEventStaff: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
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
          'application/json': components['schemas']['EventStaffViewDto'][];
        };
      };
    };
  };
  createEventStaff: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEventStaffDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventStaffViewDto'];
        };
      };
    };
  };
  updateEventStaff: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateEventStaffDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventStaffViewDto'];
        };
      };
    };
  };
  getEventStaffHistory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
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
          'application/json': components['schemas']['EventStaffHistoryDto'][];
        };
      };
    };
  };
  listEventSupplies: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
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
          'application/json': components['schemas']['EventSupplyItemViewDto'][];
        };
      };
    };
  };
  createEventSupply: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEventSupplyItemDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventSupplyItemViewDto'];
        };
      };
    };
  };
  updateEventSupply: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateEventSupplyItemDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventSupplyItemViewDto'];
        };
      };
    };
  };
  getEventSupplyHistory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
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
          'application/json': components['schemas']['EventSupplyHistoryDto'][];
        };
      };
    };
  };
  createEventSupplyPhoto: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEventSupplyPhotoDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventSupplyPhotoViewDto'];
        };
      };
    };
  };
  listEventTeams: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
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
          'application/json': components['schemas']['TeamViewDto'][];
        };
      };
    };
  };
  addEventTeam: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AddEventTeamDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamViewDto'];
        };
      };
    };
  };
  replaceEventTeamRoster: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
        eventTeamId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReplaceEventTeamRosterDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventTeamRosterViewDto'];
        };
      };
    };
  };
  updateEventTeam: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        eventId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateTeamDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamViewDto'];
        };
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
  HostingController_list: {
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
          'application/json': components['schemas']['HostingApplicationListItemDto'][];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateHostingApplicationDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingApplicationListItemDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_detail: {
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
          'application/json': components['schemas']['HostingApplicationDetailDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_approve: {
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
        'application/json': components['schemas']['HostingReviewCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_save: {
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
        'application/json': components['schemas']['SaveHostingDraftDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingApplicationDetailDto'];
        };
      };
      /** @description Invalid draft form */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_reject: {
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
        'application/json': components['schemas']['HostingReasonCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_supplement: {
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
        'application/json': components['schemas']['HostingReasonCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_startReview: {
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
        'application/json': components['schemas']['HostingReviewCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_submit: {
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
        'application/json': components['schemas']['HostingSubmitDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_uploadIntent: {
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
        'application/json': components['schemas']['HostingUploadInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingUploadViewDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_journeys: {
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
          'application/json': components['schemas']['HostingJourneyDto'][];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_confirmUpload: {
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
        'application/json': components['schemas']['HostingUploadMutationDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingUploadViewDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_download: {
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
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_uploadContent: {
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
          'application/json': {
            /** Format: uuid */
            id?: string;
          };
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HostingController_removeUpload: {
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
        'application/json': components['schemas']['HostingUploadMutationDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HostingUploadViewDto'];
        };
      };
      /** @description No active application permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Revision, state, or idempotency conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createIndividualMaterialTask: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateIndividualTaskDto'];
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
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createIndividualMaterial: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateIndividualDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualResultDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getIndividualSnapshot: {
    parameters: {
      query?: {
        limit?: number;
        offset?: number;
        state?: string;
        selectedId?: string;
        taskId?: string;
      };
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
          'application/json': components['schemas']['IndividualSnapshotDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  approveIndividualMaterial: {
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
        'application/json': components['schemas']['IndividualCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualResultDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  saveIndividualDraft: {
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
        'application/json': components['schemas']['SaveIndividualDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualResultDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getIndividualHistory: {
    parameters: {
      query?: {
        limit?: number;
        offset?: number;
      };
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
          'application/json': components['schemas']['IndividualHistoryDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  returnIndividualMaterial: {
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
        'application/json': components['schemas']['IndividualCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualResultDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  startIndividualReview: {
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
        'application/json': components['schemas']['IndividualCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualResultDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  submitIndividualMaterial: {
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
        'application/json': components['schemas']['IndividualCommandDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualResultDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createIndividualUpload: {
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
        'application/json': components['schemas']['IndividualUploadInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualUploadDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  confirmIndividualUpload: {
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
          'application/json': components['schemas']['IndividualUploadDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  downloadIndividualContent: {
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
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  uploadIndividualContent: {
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
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getIndividualFileInfo: {
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
          'application/json': components['schemas']['IndividualUploadDto'];
        };
      };
      /** @description Invalid input */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listLocalTestIdentities: {
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
          'application/json': components['schemas']['LocalIdentityChoiceDto'][];
        };
      };
      /** @description Invalid fixed identity */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Fixed identity is inactive */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Local test mode unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createLocalTestSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LocalSessionRequestDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LocalSessionDto'];
        };
      };
      /** @description Invalid fixed identity */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Fixed identity is inactive */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Local test mode unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
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
  activateIndividualChannel: {
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
        'application/json': components['schemas']['ActivateIndividualDto'];
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
      /** @description Session expired or revoked */
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
      /** @description State, revision, deadline or command conflict; current only when authorized */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IndividualConflictDto'];
        };
      };
      /** @description Database, audit or storage unavailable */
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
  createTemplateUploadIntent: {
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
        'application/json': components['schemas']['TemplateUploadDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TemplateUploadViewDto'];
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
  getGovernanceAccount: {
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
          'application/json': components['schemas']['GovernanceOverviewDto'];
        };
      };
    };
  };
  explainGovernancePermission: {
    parameters: {
      query?: {
        actorId?: string;
        eventId?: string;
        requestId?: string;
        resourceId?: string;
        phase?: string;
        mode?: string;
        action?: string;
        outcome?: string;
        organizationId?: string;
        model?: string;
        from?: string;
        to?: string;
        cursor?: string;
        limit?: string;
      };
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
          'application/json': components['schemas']['GovernanceOverviewDto'];
        };
      };
    };
  };
  revokeGovernanceSessions: {
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
        'application/json': components['schemas']['GovernanceRevokeDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceResultDto'];
        };
      };
    };
  };
  listAgentSkillVersions: {
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
          'application/json': components['schemas']['AgentSkillVersionDto'][];
        };
      };
    };
  };
  createAgentSkillVersion: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AgentSkillInputDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AgentSkillVersionDto'];
        };
      };
    };
  };
  listAgentToolCatalog: {
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
          'application/json': components['schemas']['AgentToolDefinitionDto'][];
        };
      };
    };
  };
  activateAgentSkillVersion: {
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
          'application/json': components['schemas']['AgentSkillVersionDto'];
        };
      };
    };
  };
  acknowledgeGovernanceAlert: {
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
        'application/json': components['schemas']['GovernanceAlertUpdateDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceResultDto'];
        };
      };
    };
  };
  exportGovernanceAudit: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GovernanceQueryDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernanceExportDto'];
        };
      };
    };
  };
  reviewGovernanceDialogue: {
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
        'application/json': components['schemas']['GovernanceReasonDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GovernancePageDto'];
        };
      };
    };
  };
  getGovernanceOverview: {
    parameters: {
      query?: {
        actorId?: string;
        eventId?: string;
        requestId?: string;
        resourceId?: string;
        phase?: string;
        mode?: string;
        action?: string;
        outcome?: string;
        organizationId?: string;
        model?: string;
        from?: string;
        to?: string;
        cursor?: string;
        limit?: string;
      };
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
          'application/json': components['schemas']['GovernanceOverviewDto'];
        };
      };
    };
  };
  listGovernanceRecords: {
    parameters: {
      query?: {
        actorId?: string;
        eventId?: string;
        requestId?: string;
        resourceId?: string;
        phase?: string;
        mode?: string;
        action?: string;
        outcome?: string;
        organizationId?: string;
        model?: string;
        from?: string;
        to?: string;
        cursor?: string;
        limit?: string;
      };
      header?: never;
      path: {
        kind: string;
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
          'application/json': components['schemas']['GovernancePageDto'];
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
  listServerTestIdentities: {
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
          'application/json': components['schemas']['LocalIdentityChoiceDto'][];
        };
      };
      /** @description Formal sign-in required */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Super administrator required */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Server test mode unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  createServerTestSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LocalSessionRequestDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LocalSessionDto'];
        };
      };
      /** @description Formal sign-in required */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Super administrator required */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Server test mode unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listTeams: {
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
          'application/json': components['schemas']['TeamViewDto'][];
        };
      };
    };
  };
  createTeam: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateTeamDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamViewDto'];
        };
      };
    };
  };
  listTeamOrganizations: {
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
          'application/json': components['schemas']['TeamOrganizationDto'][];
        };
      };
    };
  };
  updateTeam: {
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
        'application/json': components['schemas']['UpdateTeamDto'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamViewDto'];
        };
      };
    };
  };
  confirmTemplateUpload: {
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
          'application/json': components['schemas']['TemplateUploadViewDto'];
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
  downloadTemplateContent: {
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
  uploadTemplateContent: {
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
  getTemplateInfo: {
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
          'application/json': components['schemas']['TemplateFileDto'];
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
  removeDraftTemplate: {
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
  getPrivateFileInfo: {
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
          'application/json': components['schemas']['FileInfoDto'];
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
  getUploadCapabilities: {
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
          'application/json': components['schemas']['UploadCapabilitiesDto'];
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
