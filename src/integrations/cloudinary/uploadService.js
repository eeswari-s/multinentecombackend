const sharp = require('sharp');
const cloudinary = require('./client');
const { Tenant } = require('../../models/tenant.model');
const requestContext = require('../../utils/requestContext');
const ApiError = require('../../utils/ApiError');

const MAX_DIMENSION_PX = 1920;

/**
 * Downscales oversized photos and re-encodes at quality 80 before anything
 * reaches Cloudinary — phone camera photos routinely arrive at 4000px+ and
 * several MB, which burns through a tenant's storage quota (see
 * assertStorageQuota below) for no visible gain at typical storefront
 * display sizes. Format is auto-detected (not passed in) so a transparent
 * PNG is re-encoded as PNG, never flattened to JPEG and losing its alpha
 * channel. Falls back to the original buffer if sharp can't parse it (e.g.
 * a corrupt file, or a non-image such as a generated PDF) so upload doesn't
 * hard-fail on this alone.
 */
async function compressImage(buffer) {
  try {
    const image = sharp(buffer);
    const { format } = await image.metadata();
    const pipeline = image.resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: 'inside',
      withoutEnlargement: true,
    });

    if (format === 'png') return await pipeline.png({ quality: 80, compressionLevel: 8 }).toBuffer();
    if (format === 'webp') return await pipeline.webp({ quality: 80 }).toBuffer();
    if (format === 'jpeg' || format === 'jpg') return await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return buffer; // not a recognized image format (e.g. raw PDF bytes) — leave untouched
  } catch {
    return buffer;
  }
}

/**
 * Storage quota is checked against the file's byte size BEFORE it's
 * uploaded (Multer already knows this from `file.buffer.length` /
 * `file.size`, no Cloudinary call needed to find out). tenant.storageUsedBytes
 * itself is the running counter uploadBuffer maintains on every upload.
 */
async function assertStorageQuota(additionalBytes) {
  const tenantId = requestContext.getTenantId();
  if (!tenantId) return; // no tenant context (e.g. Super Admin's own uploads, if any) — nothing to enforce against

  // Always fetched fresh with the plan populated — requestContext.getTenant()
  // is a lean snapshot from tenant resolution time with subscription.planId
  // as a bare ObjectId, never populated, so relying on it here would make
  // this check silently never fire.
  const tenant = await Tenant.findById(tenantId).populate('subscription.planId').lean();
  const maxStorageMB = tenant?.subscription?.planId?.limits?.maxStorageMB;
  if (maxStorageMB == null) return; // no plan assigned, or plan has no storage limit configured

  const maxBytes = maxStorageMB * 1024 * 1024;
  const currentBytes = tenant.storageUsedBytes || 0;
  if (currentBytes + additionalBytes > maxBytes) {
    throw ApiError.forbidden(
      `Storage quota exceeded: this store's plan allows ${maxStorageMB} MB and is already using ${(currentBytes / (1024 * 1024)).toFixed(1)} MB.`
    );
  }
}

async function adjustTenantStorage(bytesDelta) {
  const tenantId = requestContext.getTenantId();
  if (!tenantId || !bytesDelta) return;
  await Tenant.updateOne({ _id: tenantId }, { $inc: { storageUsedBytes: bytesDelta } });
}

/**
 * Only the secure Cloudinary URL (+ publicId, for later deletion) is ever
 * persisted to MongoDB — the binary itself never touches the database.
 * `resourceType` is 'image' for product/category photos, 'raw' for
 * generated PDFs (invoices, packing slips, reports).
 */
async function uploadBuffer(buffer, folder, resourceType = 'image') {
  const outgoing = resourceType === 'image' ? await compressImage(buffer) : buffer;
  await assertStorageQuota(outgoing.length);

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: resourceType }, (err, uploaded) => {
      if (err) return reject(err);
      resolve(uploaded);
    });
    stream.end(outgoing);
  });

  await adjustTenantStorage(result.bytes);
  return { url: result.secure_url, publicId: result.public_id, bytes: result.bytes };
}

async function uploadMany(files, folder) {
  const results = [];
  for (const file of files) {
    // Sequential, not Promise.all: each call re-checks the quota against
    // the running total, so a batch can't blow through the limit by having
    // every file's check race against the same stale "current usage" read.
    results.push(await uploadBuffer(file.buffer, folder));
  }
  return results;
}

async function deleteImage(publicId, resourceType = 'image', bytes = 0) {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  await adjustTenantStorage(-bytes);
}

async function deleteMany(publicIds, resourceType = 'image', totalBytes = 0) {
  if (publicIds.length === 0) return;
  await cloudinary.api.delete_resources(publicIds, { resource_type: resourceType });
  await adjustTenantStorage(-totalBytes);
}

module.exports = { uploadBuffer, uploadMany, deleteImage, deleteMany };
