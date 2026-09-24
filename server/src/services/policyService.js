const { v4: uuidv4 } = require('uuid');
const Policy = require('../models/Policy');
const PolicyChunk = require('../models/PolicyChunk');
const Conversation = require('../models/Conversation');
const CostEstimate = require('../models/CostEstimate');
const chromaService = require('./chromaService');

class PolicyService {
  /**
   * Initiates asynchronous document processing pipeline (FR-03)
   * Pipeline: uploading -> extracting -> indexed -> ready
   */
  async processPolicyDocument(policyId, userId) {
    try {
      const policy = await Policy.findOne({ _id: policyId, user_id: userId });
      if (!policy) return;

      // Step 1: Update status to 'extracting'
      policy.status = 'extracting';
      await policy.save();

      // Simulate parsing text and extracting structured facts
      // In production, pdf-parse / tesseract OCR / LLM extractor runs here
      const extractedData = this.generateExtractedFacts(policy);

      policy.insurer_name = extractedData.insurer_name;
      policy.policy_type = extractedData.policy_type;
      policy.policy_number = extractedData.policy_number;
      policy.sum_insured = extractedData.sum_insured;
      policy.premium_amount = extractedData.premium_amount;
      policy.ocr_used = extractedData.ocr_used;
      policy.red_flag_summary = extractedData.red_flag_summary;
      policy.facts = extractedData.facts;

      // Step 2: Update status to 'indexed'
      policy.status = 'indexed';
      policy.indexed_at = new Date();
      await policy.save();

      // Step 3: Generate text chunks for semantic vector search
      const chunksToInsert = [];
      for (let i = 0; i < extractedData.chunks.length; i++) {
        const chunkData = extractedData.chunks[i];
        const vectorId = uuidv4();

        chunksToInsert.push({
          policy_id: policy._id,
          user_id: policy.user_id,
          chunk_index: i,
          chunk_text: chunkData.text,
          page_number: chunkData.page,
          section_heading: chunkData.section,
          token_count: Math.ceil(chunkData.text.split(/\s+/).length * 1.3),
          vector_id: vectorId,
          insurer_name: policy.insurer_name,
          policy_type: policy.policy_type,
        });
      }

      // Save chunks to MongoDB policy_chunks collection
      if (chunksToInsert.length > 0) {
        await PolicyChunk.insertMany(chunksToInsert);

        // Index in ChromaDB vector store
        await chromaService.upsertChunks(chunksToInsert);
      }

      // Step 4: Finalize status to 'ready'
      policy.status = 'ready';
      await policy.save();
      console.log(`[PolicyService] Successfully completed processing for policy ${policyId}`);
    } catch (error) {
      console.error(`[PolicyService] Processing failed for policy ${policyId}:`, error);
      await Policy.findOneAndUpdate(
        { _id: policyId, user_id: userId },
        { status: 'failed', updated_at: new Date() }
      );
    }
  }

  /**
   * Cascade delete a policy document (Section 8 of specification)
   */
  async deletePolicyCascade(userId, policyId) {
    // 1. Find and verify policy ownership (Data isolation NFR 5.3)
    const policy = await Policy.findOne({ _id: policyId, user_id: userId });
    if (!policy) {
      throw new Error('Policy not found or unauthorized');
    }

    // 2. Delete associated policy_chunks from MongoDB
    await PolicyChunk.deleteMany({ policy_id: policyId, user_id: userId });

    // 3. Delete matching vectors from ChromaDB
    await chromaService.deletePolicyVectors(userId, policyId);

    // 4. Null out or clean up policy_id in related conversations and cost_estimates
    await Conversation.updateMany(
      { policy_id: policyId, user_id: userId },
      { $set: { policy_id: null } }
    );
    await CostEstimate.deleteMany({ policy_id: policyId, user_id: userId });

    // 5. Delete the policy itself
    await Policy.deleteOne({ _id: policyId, user_id: userId });

    return { success: true, message: 'Policy and all associated records deleted successfully' };
  }

  /**
   * Helper generator to build realistic facts & chunks during policy upload
   */
  generateExtractedFacts(policy) {
    const filename = (policy.file_name || '').toLowerCase();
    let insurer = 'Star Health & Allied Insurance';
    let policyType = 'individual_health';
    let sumInsured = 1000000;
    let premium = 14500;

    if (filename.includes('hdfc') || filename.includes('ergo')) {
      insurer = 'HDFC ERGO General Insurance';
      policyType = 'family_floater';
      sumInsured = 1500000;
      premium = 21000;
    } else if (filename.includes('care') || filename.includes('religare')) {
      insurer = 'Care Health Insurance';
      policyType = 'critical_illness';
      sumInsured = 2500000;
      premium = 18500;
    }

    const facts = [
      {
        fact_id: uuidv4(),
        category: 'sum_insured',
        fact_key: 'base_sum_insured',
        fact_value: `INR ${sumInsured.toLocaleString('en-IN')}`,
        fact_value_numeric: sumInsured,
        unit: 'INR',
        source_page: 2,
        source_section: 'Schedule of Benefits - Section 1',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'room_rent_limit',
        fact_key: 'room_rent_cap_per_day',
        fact_value: 'Single Private A/C Room or max 1% of Sum Insured per day',
        fact_value_numeric: sumInsured * 0.01,
        unit: 'INR/day',
        source_page: 4,
        source_section: 'Inpatient Hospitalization - Section 3.1',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'sub_limit',
        fact_key: 'icu_charges_limit',
        fact_value: 'Up to 2% of Sum Insured per day',
        fact_value_numeric: sumInsured * 0.02,
        unit: 'INR/day',
        source_page: 4,
        source_section: 'Intensive Care Unit (ICU) Charges - Section 3.2',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'co_payment',
        fact_key: 'co_payment_clause',
        fact_value: '10% co-payment for treatments in Tier 1 non-network hospitals; 0% in network',
        fact_value_numeric: 10,
        unit: '%',
        source_page: 7,
        source_section: 'Co-Payment Terms - Section 5.4',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'deductible',
        fact_key: 'annual_aggregate_deductible',
        fact_value: 'Nil for standard claims, INR 10,000 voluntary deductible option',
        fact_value_numeric: 0,
        unit: 'INR',
        source_page: 3,
        source_section: 'Deductible Details - Section 2.3',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'waiting_period',
        fact_key: 'pre_existing_disease_waiting_period',
        fact_value: '36 months from policy inception date',
        fact_value_numeric: 36,
        unit: 'months',
        source_page: 9,
        source_section: 'Waiting Periods - Section 6.1',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'waiting_period',
        fact_key: 'initial_waiting_period',
        fact_value: '30 days from date of commencement except accidental injuries',
        fact_value_numeric: 30,
        unit: 'days',
        source_page: 9,
        source_section: 'Waiting Periods - Section 6.2',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'exclusion',
        fact_key: 'cosmetic_and_obesity_treatments',
        fact_value: 'Cosmetic surgery, aesthetic treatments, and weight control are completely excluded',
        fact_value_numeric: null,
        unit: null,
        source_page: 11,
        source_section: 'Permanent Exclusions - Section 7',
        extraction_confidence: 'high',
      },
      {
        fact_id: uuidv4(),
        category: 'claim_condition',
        fact_key: 'intimation_timeline',
        fact_value: 'Within 24 hours of emergency hospitalization and 48 hours prior to planned admission',
        fact_value_numeric: 24,
        unit: 'hours',
        source_page: 14,
        source_section: 'Claims Procedure - Section 9.1',
        extraction_confidence: 'high',
      },
    ];

    const red_flag_summary = {
      waiting_periods: [
        '36 months waiting period for Pre-Existing Diseases (PED)',
        '24 months waiting period for specific ailments: Cataract, Hernia, Joint Replacement',
        '30 days initial waiting period for all non-accidental illnesses',
      ],
      major_exclusions: [
        'Cosmetic & plastic surgery unless necessitated by accidental trauma',
        'Experimental or unproven pharmacological therapies and stem cell procedures',
        'Non-medical items (gloves, PPE kits, registration fees, food/beverages)',
        'Dental treatments unless requiring in-patient surgical admission',
      ],
      room_rent_cap: '1% of Sum Insured per day. Exceeding this room rent triggers proportionate deduction across all hospital billing.',
      copay_percentage: '10% co-payment applicable in non-network metro hospitals.',
      notes: [
        'Pre-authorization is strictly mandatory for cashless claims at network hospitals.',
        'No Claim Bonus (NCB) accrues at 20% per claim-free year up to a maximum cap of 100%.',
      ],
    };

    const chunks = [
      {
        page: 2,
        section: 'Section 1: Schedule of Benefits & Coverage Limits',
        text: `Policyholder is eligible for inpatient hospitalization coverage up to the Sum Insured of INR ${sumInsured.toLocaleString('en-IN')}. Coverage encompasses room charges, nursing fees, surgeon, anesthesiologist, medical practitioner fees, operation theatre charges, pharmacy, diagnostic tests, and intensive care unit (ICU) charges incurred during medically necessary hospitalization exceeding 24 hours.`,
      },
      {
        page: 4,
        section: 'Section 3: Room Rent & Accommodation Conditions',
        text: `Room rent limit is capped at 1% of the base Sum Insured per day for standard room accommodation, or Single Private A/C Room, whichever is lower. Intensive Care Unit (ICU) charges are covered up to 2% of the Sum Insured per day. If the insured chooses a room category exceeding this limit, a proportionate deduction shall apply to all associated medical expenses, including doctor visit charges and OT fees.`,
      },
      {
        page: 7,
        section: 'Section 5: Co-payment & Deductibles',
        text: `A mandatory 10% co-payment shall apply to all admissible claim amounts if hospitalization takes place in a Tier 1 non-network hospital. In network healthcare facilities, cashless claims enjoy zero co-payment. Voluntary deductible of INR 10,000 applies only if selected at policy issuance.`,
      },
      {
        page: 9,
        section: 'Section 6: Waiting Periods and Specific Conditions',
        text: `1. Initial 30 Days Waiting Period: No illness or disease contracted within thirty (30) days from policy inception shall be covered, except acute trauma resulting directly from accidental injury. 2. Pre-Existing Disease (PED) Waiting Period: Coverage for pre-existing diseases commences after thirty-six (36) consecutive months of continuous coverage without break. 3. Specific Named Ailments: A two-year (24 months) waiting period applies to treatment of cataracts, hernia, hydrocele, piles, gall bladder stones, and benign prostatic hypertrophy.`,
      },
      {
        page: 11,
        section: 'Section 7: Exclusions & Uncovered Expenses',
        text: `The company shall not be liable to make any payment under this policy for expenses incurred towards: cosmetic or plastic surgery, treatments for obesity or weight management, gender reassignment, maternity expenses (unless rider active), self-inflicted injuries, injury due to alcohol/narcotics intoxication, vitamins and supplements not forming part of active in-patient medication, and non-medical consumables as per IRDAI guidelines.`,
      },
      {
        page: 14,
        section: 'Section 9: Claims Procedure & Cashless Facilities',
        text: `For planned hospitalization, pre-authorization must be submitted at least 48 hours prior to admission to the Third Party Administrator (TPA) or insurer. In emergency hospitalizations, intimation must be provided within 24 hours of hospital admission. Original discharge summary, itemized medical bills, pharmacy receipts, and diagnostic reports must be submitted within 30 days of hospital discharge.`,
      },
    ];

    return {
      insurer_name: insurer,
      policy_type: policyType,
      policy_number: `POL-${Math.floor(100000 + Math.random() * 900000)}`,
      sum_insured: sumInsured,
      premium_amount: premium,
      ocr_used: false,
      red_flag_summary,
      facts,
      chunks,
    };
  }
}

module.exports = new PolicyService();
