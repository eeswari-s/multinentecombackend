const multer = require('multer');
const ApiError = require('../utils/ApiError');
const requestContext = require('../utils/requestContext');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const rawUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPEG, PNG, and WEBP images are allowed'));
    }
    cb(null, true);
  },
});

/**
 * Multer's internal multipart parsing (busboy) processes the request
 * stream through callbacks that do not preserve AsyncLocalStorage context
 * — confirmed via a standalone repro (a value set in ALS before
 * upload.single() runs is gone by the time its `next()` fires). Since
 * every tenant-scoped model requires that context, ANY route combining
 * file upload with tenant scoping would silently break without this fix.
 * This wrapper snapshots the active context before handing off to multer
 * and re-enters it for whatever runs after.
 */
function preserveContext(multerMiddleware) {
  return function wrapped(req, res, next) {
    const snapshot = requestContext.getStore();
    multerMiddleware(req, res, (err) => {
      if (!snapshot) return next(err);
      requestContext.als.run(snapshot, () => next(err));
    });
  };
}

module.exports = {
  single: (field) => preserveContext(rawUpload.single(field)),
  array: (field, maxCount) => preserveContext(rawUpload.array(field, maxCount)),
};
