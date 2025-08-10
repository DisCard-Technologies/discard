import { Router } from 'express';
import {
  generateQuarterlyAudit,
  getComplianceStatus,
  logComplianceEvent,
  getAuditTrail,
  generateRegulatoryReport,
  monitorEmployeeAccess,
  getIsolationEffectiveness
} from '../../controllers/compliance/isolation-compliance.controller';
import {
  addPrivacyHeaders
} from '../../middleware/isolation.middleware';

const router = Router();

// Apply privacy headers
router.use(addPrivacyHeaders);

// Compliance reporting endpoints
router.get('/quarterly-audit', generateQuarterlyAudit);
router.get('/status', getComplianceStatus);
router.post('/log-event', logComplianceEvent);
router.get('/audit-trail/:contextHash', getAuditTrail);
router.get('/regulatory-report', generateRegulatoryReport);
router.get('/employee/:employeeId/access-patterns', monitorEmployeeAccess);
router.get('/isolation-effectiveness', getIsolationEffectiveness);

export default router;