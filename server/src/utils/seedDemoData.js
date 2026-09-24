const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { initChroma } = require('../config/chroma');
const chromaService = require('../services/chromaService');

// Models
const User = require('../models/User');
const Policy = require('../models/Policy');
const PolicyChunk = require('../models/PolicyChunk');
const Conversation = require('../models/Conversation');
const CostEstimate = require('../models/CostEstimate');
const PolicyComparison = require('../models/PolicyComparison');

async function seedData() {
  try {
    console.log('[Seed] Connecting to database...');
    await mongoose.connect(config.MONGO_URI);
    await initChroma();

    console.log('[Seed] Clearing existing demo collections...');
    await User.deleteMany({});
    await Policy.deleteMany({});
    await PolicyChunk.deleteMany({});
    await Conversation.deleteMany({});
    await CostEstimate.deleteMany({});
    await PolicyComparison.deleteMany({});

    // 1. Create Demo User (Collection: users)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    const user = await User.create({
      full_name: 'Dr. Arjun Verma',
      email: 'demo@medshield.ai',
      password_hash: passwordHash,
      phone: '+91 98765 43210',
      is_active: true,
      last_login_at: new Date(),
    });
    console.log(`[Seed] Created User: ${user.email} (ID: ${user._id})`);

    // 2. Create Policies with Embedded Facts (Collection: policies)
    const starPolicyId = new mongoose.Types.ObjectId();
    const hdfcPolicyId = new mongoose.Types.ObjectId();

    const starFacts = [
      {
        fact_id: uuidv4(),
        category: 'sum_insured',
        fact_key: 'base_sum_insured',
        fact_value: 'INR 10,00,000',
        fact_value_numeric: 1000000,
        unit: 'INR',
        source_page: 2,
        source_section: 'Section 1 - Schedule of Benefits',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'room_rent_limit',
        fact_key: 'room_rent_cap_per_day',
        fact_value: 'Single Private A/C Room or max 1% of Sum Insured per day (INR 10,000/day)',
        fact_value_numeric: 10000,
        unit: 'INR/day',
        source_page: 4,
        source_section: 'Section 3.1 - Inpatient Hospitalization Room Limits',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'sub_limit',
        fact_key: 'icu_charges_limit',
        fact_value: 'Up to 2% of Sum Insured per day (INR 20,000/day)',
        fact_value_numeric: 20000,
        unit: 'INR/day',
        source_page: 4,
        source_section: 'Section 3.2 - Intensive Care Unit Charges',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'co_payment',
        fact_key: 'co_payment_clause',
        fact_value: '10% co-payment for non-network metro hospitals; 0% in network facilities',
        fact_value_numeric: 10,
        unit: '%',
        source_page: 7,
        source_section: 'Section 5.4 - Co-Payment Terms',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'waiting_period',
        fact_key: 'pre_existing_disease_waiting_period',
        fact_value: '36 months from policy inception date',
        fact_value_numeric: 36,
        unit: 'months',
        source_page: 8,
        source_section: 'Section 6.1 - Pre-Existing Diseases',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'waiting_period',
        fact_key: 'initial_waiting_period',
        fact_value: '30 days from policy inception (accidents exempted)',
        fact_value_numeric: 30,
        unit: 'days',
        source_page: 8,
        source_section: 'Section 6.2 - Initial Waiting Period',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'exclusion',
        fact_key: 'cosmetic_and_obesity_treatments',
        fact_value: 'Aesthetic, cosmetic, obesity, and experimental procedures are permanently excluded',
        fact_value_numeric: null,
        unit: null,
        source_page: 11,
        source_section: 'Section 7.1 - Permanent Exclusions',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'deductible',
        fact_key: 'voluntary_deductible',
        fact_value: 'Nil standard deductible (INR 0)',
        fact_value_numeric: 0,
        unit: 'INR',
        source_page: 3,
        source_section: 'Section 2.1 - Deductible Specifications',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'claim_condition',
        fact_key: 'emergency_intimation_hours',
        fact_value: 'Intimation required within 24 hours of hospital admission',
        fact_value_numeric: 24,
        unit: 'hours',
        source_page: 13,
        source_section: 'Section 9.2 - Notice of Claim',
        extraction_confidence: 'high',
      },
    ];

    const starPolicy = await Policy.create({
      _id: starPolicyId,
      user_id: user._id,
      file_name: 'Star_Health_Premier_Policy.pdf',
      file_path: 'uploads/policies/demo_star_health.pdf',
      file_size_bytes: 3420100,
      insurer_name: 'Star Health & Allied Insurance',
      policy_type: 'individual_health',
      policy_number: 'SH-IND-2024-89214',
      sum_insured: 1000000,
      premium_amount: 14500,
      status: 'ready',
      ocr_used: false,
      red_flag_summary: {
        waiting_periods: [
          '36 months waiting period for Pre-Existing Diseases (PED)',
          '24 months specific ailment waiting period (Cataract, Hernia, Joint replacement)',
          '30 days initial waiting period',
        ],
        major_exclusions: [
          'Cosmetic & plastic surgery',
          'Weight management & bariatric surgeries',
          'External congenital diseases & genetic disorders',
          'Non-medical hospital consumables (PPE kits, gloves, sanitizers)',
        ],
        room_rent_cap: '1% of Sum Insured (INR 10,000/day). Proportionate deduction applies if breached.',
        copay_percentage: '10% co-payment applicable in non-network metro hospitals.',
        notes: ['Automatic restoration of 100% sum insured upon full exhaustion.'],
      },
      facts: starFacts,
      uploaded_at: new Date(Date.now() - 3600000 * 24 * 5),
      indexed_at: new Date(Date.now() - 3600000 * 24 * 5 + 120000),
      updated_at: new Date(),
    });

    const hdfcFacts = [
      {
        fact_id: uuidv4(),
        category: 'sum_insured',
        fact_key: 'base_sum_insured',
        fact_value: 'INR 15,00,000 + 100% Secure Benefit',
        fact_value_numeric: 1500000,
        unit: 'INR',
        source_page: 1,
        source_section: 'Benefits Overview',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'room_rent_limit',
        fact_key: 'room_rent_cap_per_day',
        fact_value: 'No Room Rent Capping (Any room up to Suite allowed)',
        fact_value_numeric: null,
        unit: null,
        source_page: 3,
        source_section: 'Room Rent Clause',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'co_payment',
        fact_key: 'co_payment_clause',
        fact_value: 'Zero Co-payment across all tiers and hospital networks',
        fact_value_numeric: 0,
        unit: '%',
        source_page: 5,
        source_section: 'Co-Payment Terms',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'waiting_period',
        fact_key: 'pre_existing_disease_waiting_period',
        fact_value: '24 months waiting period for Pre-Existing Diseases',
        fact_value_numeric: 24,
        unit: 'months',
        source_page: 7,
        source_section: 'Waiting Period Clauses',
        extraction_confidence: 'high',
      },
    ];

    const hdfcPolicy = await Policy.create({
      _id: hdfcPolicyId,
      user_id: user._id,
      file_name: 'HDFC_ERGO_Optima_Secure.pdf',
      file_path: 'uploads/policies/demo_hdfc_ergo.pdf',
      file_size_bytes: 4120000,
      insurer_name: 'HDFC ERGO General Insurance',
      policy_type: 'family_floater',
      policy_number: 'HE-OPT-2024-55092',
      sum_insured: 1500000,
      premium_amount: 22800,
      status: 'ready',
      ocr_used: false,
      red_flag_summary: {
        waiting_periods: [
          '24 months waiting period for Pre-Existing Diseases (PED)',
          '24 months for named specific procedures',
          '30 days initial waiting period',
        ],
        major_exclusions: [
          'Dental care unless required due to traumatic accidental injury',
          'Rest cures, convalescence, rehabilitation and general debility',
          'Vitamins and tonics without direct therapeutic medical necessity',
        ],
        room_rent_cap: 'No Room Rent Capping. Zero proportionate deduction risk.',
        copay_percentage: '0% co-payment (Cashless everywhere).',
        notes: ['2X protection doubles sum insured from Day 1.'],
      },
      facts: hdfcFacts,
      uploaded_at: new Date(Date.now() - 3600000 * 24 * 2),
      indexed_at: new Date(Date.now() - 3600000 * 24 * 2 + 90000),
      updated_at: new Date(),
    });

    console.log(`[Seed] Created 2 Policies: ${starPolicy.insurer_name} and ${hdfcPolicy.insurer_name}`);

    // 3. Create Policy Chunks (Collection: policy_chunks) + ChromaDB Vectors
    const rawChunks = [
      {
        policy_id: starPolicy._id,
        user_id: user._id,
        chunk_index: 0,
        chunk_text: 'Section 1: The insured is entitled to hospital room boarding, nursing, doctor consultation fees up to Sum Insured INR 10,00,000 for all medically necessary inpatient treatments.',
        page_number: 2,
        section_heading: 'Section 1 - Schedule of Benefits',
        token_count: 35,
        vector_id: uuidv4(),
        insurer_name: starPolicy.insurer_name,
        policy_type: starPolicy.policy_type,
      },
      {
        policy_id: starPolicy._id,
        user_id: user._id,
        chunk_index: 1,
        chunk_text: 'Section 3: Room rent cap is strictly set at Single Private AC Room or 1% of Sum Insured per day. ICU charges are capped at 2% of Sum Insured per day. Proportionate deductions apply if a higher room category is occupied.',
        page_number: 4,
        section_heading: 'Section 3 - Room Rent & ICU Caps',
        token_count: 42,
        vector_id: uuidv4(),
        insurer_name: starPolicy.insurer_name,
        policy_type: starPolicy.policy_type,
      },
      {
        policy_id: starPolicy._id,
        user_id: user._id,
        chunk_index: 2,
        chunk_text: 'Section 5: A 10% co-payment is mandatory for claims processed at Tier 1 non-network hospitals. In network hospitals, no co-payment applies. Cashless claims must be intimating 48 hours prior to planned admission.',
        page_number: 7,
        section_heading: 'Section 5 - Co-Payment Terms',
        token_count: 38,
        vector_id: uuidv4(),
        insurer_name: starPolicy.insurer_name,
        policy_type: starPolicy.policy_type,
      },
      {
        policy_id: starPolicy._id,
        user_id: user._id,
        chunk_index: 3,
        chunk_text: 'Section 6: Pre-existing diseases are covered after a waiting period of thirty-six (36) continuous months. Specific ailments such as cataract and joint replacement have a 24 months waiting period.',
        page_number: 8,
        section_heading: 'Section 6 - Waiting Periods',
        token_count: 36,
        vector_id: uuidv4(),
        insurer_name: starPolicy.insurer_name,
        policy_type: starPolicy.policy_type,
      },
    ];

    await PolicyChunk.insertMany(rawChunks);
    await chromaService.upsertChunks(rawChunks);
    console.log(`[Seed] Created ${rawChunks.length} policy chunks in MongoDB and ChromaDB`);

    // 4. Create Demo Conversation (Collection: conversations)
    const conversation = await Conversation.create({
      user_id: user._id,
      policy_id: starPolicy._id,
      title: 'What is my room rent limit and co-payment?',
      messages: [
        {
          message_id: uuidv4(),
          role: 'user',
          content: 'What is my room rent limit and is there any co-payment?',
          query_type: null,
          plain_language: null,
          confidence_level: null,
          verification_passed: null,
          verification_notes: null,
          citations: [],
          created_at: new Date(Date.now() - 3600000),
        },
        {
          message_id: uuidv4(),
          role: 'assistant',
          content: 'Your Room Rent Limit is: Single Private A/C Room or max 1% of Sum Insured per day (INR 10,000/day). If you occupy a room exceeding this limit, proportionate deduction penalties will be applied across doctor fees, nursing, and surgery billing.\n\nCo-payment: A 10% co-payment applies in Tier 1 non-network hospitals, while network facilities require 0% co-payment.',
          query_type: 'structured',
          plain_language: 'You are allowed a standard private A/C room up to ₹10,000 per day. If you choose an expensive deluxe room, you will have to pay extra out of your own pocket for everything, including doctor fees. Also, you pay 10% of the bill at non-network hospitals.',
          confidence_level: 'high',
          verification_passed: true,
          verification_notes: 'Verified against authoritative extracted policy facts table (Sections 3.1 and 5.4).',
          citations: [
            {
              policy_id: starPolicy._id,
              chunk_vector_id: rawChunks[1].vector_id,
              page_number: 4,
              section_heading: 'Section 3.1 - Room Rent Limits',
            },
            {
              policy_id: starPolicy._id,
              chunk_vector_id: rawChunks[2].vector_id,
              page_number: 7,
              section_heading: 'Section 5.4 - Co-Payment Terms',
            },
          ],
          created_at: new Date(Date.now() - 3590000),
        },
      ],
      created_at: new Date(Date.now() - 3600000),
      updated_at: new Date(Date.now() - 3590000),
    });
    console.log(`[Seed] Created Conversation: ${conversation.title}`);

    // 5. Create Demo Cost Estimate with What-If Variants (Collection: cost_estimates)
    const costEstimate = await CostEstimate.create({
      user_id: user._id,
      policy_id: starPolicy._id,
      treatment_name: 'Knee Replacement',
      hospital_tier: 'tier_1',
      estimated_total_cost: 350000,
      covered_amount: 284000,
      out_of_pocket_amount: 66000,
      cost_breakdown: {
        base_hospital_charges: 350000,
        room_rent_applied: 48000,
        room_rent_cap_per_day: 10000,
        room_rent_copay_penalty: 14000,
        deductible_deducted: 0,
        copay_percentage: 10,
        copay_amount: 27500,
        sub_limit_caps_applied: [],
        excluded_items_cost: 24500,
        final_payable_by_insurer: 284000,
        final_payable_by_user: 66000,
      },
      what_if_variants: [
        {
          variant_id: uuidv4(),
          changed_variable: 'hospital_tier',
          original_value: 'tier_1',
          new_value: 'tier_2',
          recalculated_total_cost: 250000,
          recalculated_covered_amount: 232500,
          recalculated_out_of_pocket: 17500,
          cost_breakdown: {
            base_hospital_charges: 250000,
            room_rent_applied: 32000,
            room_rent_cap_per_day: 10000,
            room_rent_copay_penalty: 0,
            deductible_deducted: 0,
            copay_percentage: 0,
            copay_amount: 0,
            sub_limit_caps_applied: [],
            excluded_items_cost: 17500,
            final_payable_by_insurer: 232500,
            final_payable_by_user: 17500,
          },
          created_at: new Date(Date.now() - 1800000),
        },
      ],
      created_at: new Date(Date.now() - 3600000 * 2),
    });
    console.log(`[Seed] Created Cost Estimate: ${costEstimate.treatment_name}`);

    // 6. Create Demo Policy Comparison (Collection: policy_comparisons)
    await PolicyComparison.create({
      user_id: user._id,
      policy_ids: [starPolicy._id, hdfcPolicy._id],
      comparison_result: {
        policies_metadata: [
          {
            policy_id: starPolicy._id,
            insurer_name: starPolicy.insurer_name,
            policy_type: starPolicy.policy_type,
            policy_number: starPolicy.policy_number,
            sum_insured: starPolicy.sum_insured,
            premium_amount: starPolicy.premium_amount,
          },
          {
            policy_id: hdfcPolicy._id,
            insurer_name: hdfcPolicy.insurer_name,
            policy_type: hdfcPolicy.policy_type,
            policy_number: hdfcPolicy.policy_number,
            sum_insured: hdfcPolicy.sum_insured,
            premium_amount: hdfcPolicy.premium_amount,
          },
        ],
        coverage_comparison: {
          [starPolicy._id]: 'INR 10,00,000',
          [hdfcPolicy._id]: 'INR 15,00,000 + 100% Secure Benefit',
        },
        premium_comparison: {
          [starPolicy._id]: 'INR 14,500/yr',
          [hdfcPolicy._id]: 'INR 22,800/yr',
        },
        room_rent_comparison: {
          [starPolicy._id]: '1% cap (INR 10,000/day) with proportionate deduction penalty',
          [hdfcPolicy._id]: 'No Room Rent Capping (Any room type covered)',
        },
        copay_comparison: {
          [starPolicy._id]: '10% in Tier 1 non-network hospitals',
          [hdfcPolicy._id]: '0% everywhere (Zero Co-payment)',
        },
        waiting_periods_comparison: {
          [starPolicy._id]: ['36 months Pre-Existing Diseases', '24 months Specific Named Ailments'],
          [hdfcPolicy._id]: ['24 months Pre-Existing Diseases', '24 months Specific Named Ailments'],
        },
        exclusions_diff: {
          [starPolicy._id]: starPolicy.red_flag_summary.major_exclusions,
          [hdfcPolicy._id]: hdfcPolicy.red_flag_summary.major_exclusions,
        },
      },
      created_at: new Date(Date.now() - 3600000 * 24),
    });
    console.log('[Seed] Created Policy Comparison snapshot');

    console.log('\n=============================================');
    console.log(' SEEDING COMPLETED SUCCESSFULLY! ');
    console.log(' Demo credentials:');
    console.log(' Email:    demo@medshield.ai');
    console.log(' Password: password123');
    console.log('=============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('[Seed] Error during seeding:', error);
    process.exit(1);
  }
}

seedData();
