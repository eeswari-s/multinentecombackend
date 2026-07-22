const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const bannerService = require('../../services/clientAdmin/bannerService');
const productService = require('../../services/customer/productService');

/**
 * Single aggregator for the storefront landing page — banners, featured
 * products, and top-level categories in one round trip rather than three.
 */
const getHome = asyncHandler(async (req, res) => {
  const [banners, featuredProducts, categories] = await Promise.all([
    bannerService.listActiveBanners({}),
    productService.listFeaturedProducts(),
    productService.listCategories(),
  ]);

  sendSuccess(res, { data: { banners, featuredProducts, categories } });
});

module.exports = { getHome };
