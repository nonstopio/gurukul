import type { Functions } from 'firebase/functions';
import { callApi } from '../api';
import type {
  AssignRequest,
  EmailTemplateView,
  AssignResult,
  ConsoleService,
  RemindRequest,
  SetRolesRequest,
  TeamReport,
} from './types';

export function firebaseConsoleService(functions: Functions): ConsoleService {
  return {
    assignCourses: (request) =>
      callApi<AssignRequest, AssignResult>(functions, 'assignCourses', request),
    setRoles: (request) =>
      callApi<SetRolesRequest, { roles: string[] }>(functions, 'setRoles', request),
    async resetCooldown(request) {
      await callApi(functions, 'resetCooldown', request);
    },
    remindLearners: (request) =>
      callApi<RemindRequest, { sent: number; skipped: number }>(
        functions,
        'remindLearners',
        request,
      ),
    teamReport: (request) =>
      callApi<{ teamId: string }, TeamReport>(functions, 'teamReport', request),
    updateAssignment: (request) =>
      callApi<
        { assignmentId: string; dueAt: number | null },
        { assignmentId: string; dueAt: number | null }
      >(functions, 'updateAssignment', request),
    removeAssignment: (request) =>
      callApi<{ assignmentId: string }, { assignmentId: string }>(
        functions,
        'removeAssignment',
        request,
      ),
    listEmailTemplates: () =>
      callApi<Record<string, never>, EmailTemplateView[]>(functions, 'listEmailTemplates', {}),
    sendTestEmail: (request) =>
      callApi<{ templateId: string; recipients: string[] }, { to: string[] }>(
        functions,
        'sendTestEmail',
        request,
      ),
    async revokeCertificate(request) {
      await callApi(functions, 'revokeCertificate', request);
    },
  };
}
