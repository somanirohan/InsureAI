const Policy = require('../models/Policy');
const PolicyComparison = require('../models/PolicyComparison');

class ComparisonService {
  /**
   * Compare multiple policies owned by user and generate diff snapshot (FR-07)
   */
  async comparePolicies(userId, policyIds) {
    if (!policyIds || policyIds.length < 2) {
      throw new Error('At least 2 policies are required for comparison');
    }

    // Verify all policies belong to user (NFR 5.3)
    const policies = await Policy.find({
      _id: { $in: policyIds },
      user_id: userId,
    });

    if (policies.length !== policyIds.length) {
      throw new Error('One or more selected policies do not exist or access is restricted');
    }

    const metadata = policies.map((p) => ({
      policy_id: p._id,
      insurer_name: p.insurer_name,
      policy_type: p.policy_type,
      policy_number: p.policy_number,
      sum_insured: p.sum_insured,
      premium_amount: p.premium_amount,
    }));

    const helperExtractFact = (policy, category) => {
      if (!policy.facts) return 'Not Specified';
      const f = policy.facts.find((fact) => fact.category === category);
      return f ? f.fact_value : 'Standard / None';
    };

    const coverageDiff = {};
    const premiumDiff = {};
    const roomRentDiff = {};
    const waitingPeriodsDiff = {};
    const copayDiff = {};
    const exclusionsDiff = {};

    policies.forEach((p) => {
      const pid = p._id.toString();
      coverageDiff[pid] = p.sum_insured ? `INR ${p.sum_insured.toLocaleString('en-IN')}` : 'Not Specified';
      premiumDiff[pid] = p.premium_amount ? `INR ${p.premium_amount.toLocaleString('en-IN')}/yr` : 'Not Specified';
      roomRentDiff[pid] = helperExtractFact(p, 'room_rent_limit');
      copayDiff[pid] = helperExtractFact(p, 'co_payment');

      // Waiting periods
      const waiting = (p.facts || []).filter((f) => f.category === 'waiting_period').map((f) => f.fact_value);
      waitingPeriodsDiff[pid] = waiting.length > 0 ? waiting : ['Standard IRDAI waiting periods'];

      // Red flag exclusions
      const exclusions = (p.red_flag_summary && p.red_flag_summary.major_exclusions) || [];
      exclusionsDiff[pid] = exclusions;
    });

    const comparisonResult = {
      policies_metadata: metadata,
      coverage_comparison: coverageDiff,
      premium_comparison: premiumDiff,
      room_rent_comparison: roomRentDiff,
      waiting_periods_comparison: waitingPeriodsDiff,
      copay_comparison: copayDiff,
      exclusions_diff: exclusionsDiff,
    };

    // Save snapshot to policy_comparisons collection (Collection 7)
    const comparisonRecord = new PolicyComparison({
      user_id: userId,
      policy_ids: policyIds,
      comparison_result: comparisonResult,
    });

    await comparisonRecord.save();

    return comparisonRecord;
  }
}

module.exports = new ComparisonService();
