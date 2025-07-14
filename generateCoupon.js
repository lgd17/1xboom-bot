const region = process.env.COUPON_REGION || 'europe';

let generator;
switch (region.toLowerCase()) {
  case 'africa':
    generator = require('./generateCouponAfrica');
    break;
  case 'america':
    generator = require('./generateCouponAmerica');
    break;
  case 'asia':
    generator = require('./generateCouponAsia');
    break;
  default:
    generator = require('./generateCouponEurope');
}

module.exports = async function generateCoupon() {
  return await generator();
};
