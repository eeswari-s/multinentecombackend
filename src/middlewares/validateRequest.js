/**
 * Wraps a Zod schema so every mutating/query endpoint validates
 * req.body / req.query / req.params before reaching controller logic.
 *
 * Usage: router.post('/products', validateRequest({ body: createProductSchema }), controller.create)
 */
function validateRequest(schemas) {
  return function validate(req, res, next) {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validateRequest;
