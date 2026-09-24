const { v4: uuidv4 } = require('uuid');
const CostEstimate = require('../models/CostEstimate');
const Policy = require('../models/Policy');

// Standard treatment cost benchmarks in INR by hospital tier
const TREATMENT_BENCHMARKS = {
  'knee replacement': { tier_1: 350000, tier_2: 250000, tier_3: 180000, sublimitKey: null },
  'angioplasty': { tier_1: 420000, tier_2: 300000, tier_3: 210000, sublimitKey: null },
  'cataract surgery': { tier_1: 65000, tier_2: 45000, tier_3: 30000, sublimitKey: 'cataract' },
  'appendectomy': { tier_1: 150000, tier_2: 110000, tier_3: 75000, sublimitKey: null },
  'chemotherapy (per cycle)': { tier_1: 95000, tier_2: 70000, tier_3: 50000, sublimitKey: null },
  'gallbladder removal': { tier_1: 180000, tier_2: 130000, tier_3: 90000, sublimitKey: null },
  'cardiac bypass (cabg)': { tier_1: 600000, tier_2: 450000, tier_3: 320000, sublimitKey: null },
};

class CostEstimatorService {
  /**
   * Calculate treatment cost breakdown grounded in policy facts (FR-14)
   */
  calculateCostBreakdown({ policy, treatmentName, hospitalTier, roomRentPerDay = 8000, stayDays = 4, voluntaryDeductible = 0, hasCopayRider = false }) {
    const tKey = treatmentName.toLowerCase().trim();
    const benchmark = TREATMENT_BENCHMARKS[tKey] || {
      tier_1: 250000,
      tier_2: 180000,
      tier_3: 120000,
    };

    const baseCost = benchmark[hospitalTier] || benchmark['tier_1'];
    const sumInsured = policy ? (policy.sum_insured || 1000000) : 1000000;

    // 1. Room rent cap calculation from policy facts
    let roomRentCap = sumInsured * 0.01; // Default 1%
    if (policy && policy.facts) {
      const roomFact = policy.facts.find((f) => f.category === 'room_rent_limit');
      if (roomFact && roomFact.fact_value_numeric) {
        roomRentCap = roomFact.fact_value_numeric;
      }
    }

    const totalRoomBill = roomRentPerDay * stayDays;
    let roomRentCopayPenalty = 0;

    // If selected room rent exceeds policy cap, apply proportionate deduction
    if (roomRentPerDay > roomRentCap && roomRentCap > 0) {
      const excessRatio = (roomRentPerDay - roomRentCap) / roomRentPerDay;
      roomRentCopayPenalty = Math.round(baseCost * (excessRatio * 0.4)); // proportionate penalty across total bill
    }

    // 2. Non-medical / excluded consumables (gloves, PPE, admin, syringes) ~ 7%
    const excludedItemsCost = Math.round(baseCost * 0.07);

    // 3. Sub-limit cap check (e.g. Cataract cap)
    let sublimitPenalty = 0;
    const sublimitsApplied = [];
    if (tKey.includes('cataract')) {
      const cataractCap = 40000;
      if (baseCost > cataractCap) {
        sublimitPenalty = baseCost - cataractCap;
        sublimitsApplied.push({ item: 'Cataract Procedure Cap', cap: cataractCap, deduction: sublimitPenalty });
      }
    }

    // 4. Co-pay calculation
    let copayPercentage = 0;
    if (!hasCopayRider && hospitalTier === 'tier_1') {
      // 10% copay in Tier 1 if applicable
      const copayFact = policy && policy.facts ? policy.facts.find((f) => f.category === 'co_payment') : null;
      copayPercentage = copayFact && copayFact.fact_value_numeric ? copayFact.fact_value_numeric : 10;
    }

    // Eligible amount after exclusions, penalties, and sublimits
    const eligibleAmount = Math.max(0, baseCost - roomRentCopayPenalty - excludedItemsCost - sublimitPenalty);

    // Deductible applied
    const deductibleDeducted = Math.min(eligibleAmount, voluntaryDeductible);
    const postDeductible = eligibleAmount - deductibleDeducted;

    // Co-pay amount
    const copayAmount = Math.round(postDeductible * (copayPercentage / 100));

    // Payable by Insurer (capped at sum insured)
    const payableByInsurer = Math.min(sumInsured, Math.max(0, postDeductible - copayAmount));

    // Total Out-Of-Pocket for User
    const outOfPocket = baseCost - payableByInsurer;

    const breakdown = {
      base_hospital_charges: baseCost,
      room_rent_applied: totalRoomBill,
      room_rent_cap_per_day: roomRentCap,
      room_rent_copay_penalty: roomRentCopayPenalty,
      deductible_deducted: deductibleDeducted,
      copay_percentage: copayPercentage,
      copay_amount: copayAmount,
      sub_limit_caps_applied: sublimitsApplied,
      excluded_items_cost: excludedItemsCost,
      final_payable_by_insurer: payableByInsurer,
      final_payable_by_user: outOfPocket,
    };

    return {
      estimated_total_cost: baseCost,
      covered_amount: payableByInsurer,
      out_of_pocket_amount: outOfPocket,
      cost_breakdown: breakdown,
    };
  }

  /**
   * Create and persist a new base cost estimate (FR-14)
   */
  async createEstimate({ userId, policyId, treatmentName, hospitalTier, roomRentPerDay, stayDays }) {
    const policy = await Policy.findOne({ _id: policyId, user_id: userId });
    if (!policy) {
      throw new Error('Policy not found or access denied');
    }

    const calculation = this.calculateCostBreakdown({
      policy,
      treatmentName,
      hospitalTier,
      roomRentPerDay,
      stayDays,
    });

    const costEstimate = new CostEstimate({
      user_id: userId,
      policy_id: policyId,
      treatment_name: treatmentName,
      hospital_tier: hospitalTier,
      estimated_total_cost: calculation.estimated_total_cost,
      covered_amount: calculation.covered_amount,
      out_of_pocket_amount: calculation.out_of_pocket_amount,
      cost_breakdown: calculation.cost_breakdown,
      what_if_variants: [],
    });

    await costEstimate.save();
    return costEstimate;
  }

  /**
   * What-If Scenario Calculation & Embedding (FR-15, FR-17)
   */
  async addWhatIfVariant({ userId, estimateId, changedVariable, newValue }) {
    const estimate = await CostEstimate.findOne({ _id: estimateId, user_id: userId });
    if (!estimate) {
      throw new Error('Cost estimate not found');
    }

    const policy = await Policy.findOne({ _id: estimate.policy_id, user_id: userId });

    let originalValue = '';
    let updatedHospitalTier = estimate.hospital_tier;
    let hasCopayRider = false;
    let customSumInsured = policy ? policy.sum_insured : 1000000;

    if (changedVariable === 'hospital_tier') {
      originalValue = estimate.hospital_tier;
      updatedHospitalTier = newValue; // e.g. 'tier_2' or 'tier_3'
    } else if (changedVariable === 'rider') {
      originalValue = 'No Copay Rider';
      hasCopayRider = newValue === 'zero_copay_rider' || newValue === 'true';
    } else if (changedVariable === 'sum_insured') {
      originalValue = String(policy ? policy.sum_insured : 1000000);
      customSumInsured = Number(newValue);
    }

    // Temporary policy object for calculation
    const simulatedPolicy = {
      ...policy.toObject(),
      sum_insured: customSumInsured,
    };

    const recalc = this.calculateCostBreakdown({
      policy: simulatedPolicy,
      treatmentName: estimate.treatment_name,
      hospitalTier: updatedHospitalTier,
      hasCopayRider,
    });

    const variant = {
      variant_id: uuidv4(),
      changed_variable: changedVariable,
      original_value: originalValue,
      new_value: newValue,
      recalculated_total_cost: recalc.estimated_total_cost,
      recalculated_covered_amount: recalc.covered_amount,
      recalculated_out_of_pocket: recalc.out_of_pocket_amount,
      cost_breakdown: recalc.cost_breakdown,
      created_at: new Date(),
    };

    estimate.what_if_variants.push(variant);
    await estimate.save();

    return { estimate, variant };
  }
}

module.exports = new CostEstimatorService();
