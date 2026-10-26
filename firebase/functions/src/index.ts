// Cloud Functions entry point. Functions are exported here as milestones land
// (claimInvites, gradeAttempt, issueCertificate, setRoles); see .plan/.
export { isAllowedEmail, rolesFromClaims } from './roles.js';
export type { Role, RoleClaims } from './roles.js';
