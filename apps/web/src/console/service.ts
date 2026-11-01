import type { Functions } from 'firebase/functions';
import { callApi } from '../api';
import type {
  AssignRequest,
  EmailTemplateView,
  AssignResult,
  ConsoleService,
  SetRolesRequest,
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
      callApi<{ courseId?: string; emails?: string[] }, { sent: number; skipped: number }>(
        functions,
        'remindLearners',
        request,
      ),
    listEmailTemplates: () =>
      callApi<Record<string, never>, EmailTemplateView[]>(functions, 'listEmailTemplates', {}),
    sendTestEmail: (request) =>
      callApi<{ templateId: string; recipients: string[] }, { to: string[] }>(functions, 'sendTestEmail', request),
    async revokeCertificate(request) {
      await callApi(functions, 'revokeCertificate', request);
    },
  };
}
