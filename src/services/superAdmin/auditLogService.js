const { AuditLog } = require('../../models/auditLog.model');

async function recordAuditLog({ action, actorUserId, actorEmail, tenantId = null, targetUserId = null, metadata = {}, ipAddress }) {
  await AuditLog.create({ action, actorUserId, actorEmail, tenantId, targetUserId, metadata, ipAddress });
}

module.exports = { recordAuditLog };
