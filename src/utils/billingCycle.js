/**
 * Computes the subscription period end date for a given billing cycle,
 * starting from `periodStart`. "lifetime" is modeled as a 100-year period
 * rather than a nullable end date, so downstream expiry checks (`now >
 * currentPeriodEnd`) work uniformly without a special case.
 */
function addBillingCycle(periodStart, billingCycle) {
  const end = new Date(periodStart);
  switch (billingCycle) {
    case 'monthly':
      end.setMonth(end.getMonth() + 1);
      break;
    case 'quarterly':
      end.setMonth(end.getMonth() + 3);
      break;
    case 'half_yearly':
      end.setMonth(end.getMonth() + 6);
      break;
    case 'yearly':
      end.setFullYear(end.getFullYear() + 1);
      break;
    case 'lifetime':
      end.setFullYear(end.getFullYear() + 100);
      break;
    default:
      throw new Error(`Unknown billing cycle "${billingCycle}"`);
  }
  return end;
}

module.exports = { addBillingCycle };
