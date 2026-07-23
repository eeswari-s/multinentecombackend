const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const tenantManagementService = require('../../services/superAdmin/tenantManagementService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const create = asyncHandler(async (req, res) => {
  const { tenant, owner } = await tenantManagementService.createClient({
    ...req.body,
    actor: actorFrom(req),
  });

  sendSuccess(res, {
    statusCode: 201,
    message: 'Client created',
    data: { tenant, owner: owner.toJSON() },
  });
});

const list = asyncHandler(async (req, res) => {
  const result = await tenantManagementService.listClients(req.query);
  sendSuccess(res, { data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const tenant = await tenantManagementService.getClient(req.params.tenantId);
  sendSuccess(res, { data: tenant });
});

const update = asyncHandler(async (req, res) => {
  const tenant = await tenantManagementService.updateClient({
    tenantId: req.params.tenantId,
    updates: req.body,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Client updated', data: tenant });
});

const setStatus = asyncHandler(async (req, res) => {
  const tenant = await tenantManagementService.setClientStatus({
    tenantId: req.params.tenantId,
    status: req.body.status,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Client status updated', data: tenant });
});

const resetOwnerPassword = asyncHandler(async (req, res) => {
  const result = await tenantManagementService.resetOwnerPassword({
    tenantId: req.params.tenantId,
    newPassword: req.body.newPassword,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Owner password reset', data: result });
});

const loginAs = asyncHandler(async (req, res) => {
  const result = await tenantManagementService.loginAsClient({
    tenantId: req.params.tenantId,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Impersonation token issued', data: result });
});

module.exports = { create, list, getOne, update, setStatus, resetOwnerPassword, loginAs };
