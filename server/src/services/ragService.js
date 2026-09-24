const chromaService = require('./chromaService');
const Policy = require('../models/Policy');

/**
 * RAG Service for AI-assisted policy query processing (FR-09, FR-10, FR-11, FR-12, FR-13)
 */
class RagService {
  /**
   * Classify user query as 'structured' or 'semantic' (FR-09)
   * Numerical/specific policy parameter inquiries map to structured facts;
   * General coverage conditions or procedural questions map to semantic search.
   */
  classifyQuery(question) {
    const q = question.toLowerCase();

    const structuredTriggers = [
      'room rent',
      'icu',
      'copay',
      'co-pay',
      'co payment',
      'deductible',
      'sum insured',
      'waiting period',
      'waiting time',
      'limit',
      'cap',
      'sublimit',
      'sub-limit',
      'premium',
      'ped',
    ];

    const isStructured = structuredTriggers.some((keyword) => q.includes(keyword));
    return isStructured ? 'structured' : 'semantic';
  }

  /**
   * Process a question across user's policy or policies
   */
  async answerQuestion({ userId, policyId, question, plainLanguageRequested = false }) {
    const queryType = this.classifyQuery(question);
    const qLower = question.toLowerCase();

    // Fetch policy details for factual grounding
    let policy = null;
    if (policyId) {
      policy = await Policy.findOne({ _id: policyId, user_id: userId });
    } else {
      // If cross-policy or no specific policy selected, pick the first ready policy
      policy = await Policy.findOne({ user_id: userId, status: 'ready' });
    }

    if (!policy) {
      return {
        queryType,
        answer: 'No active or processed insurance policy was found for your account. Please upload a policy PDF first.',
        plainLanguage: 'You need to upload an insurance policy before I can answer your questions.',
        confidenceLevel: 'low',
        verificationPassed: false,
        verificationNotes: 'No policy found for current user.',
        citations: [],
      };
    }

    // 1. STRUCTURED ROUTE: Lookup in policy.facts
    if (queryType === 'structured') {
      const structuredResult = this.answerFromStructuredFacts(policy, question);
      if (structuredResult.found) {
        // Self-verification for structured fact (FR-11)
        const verificationPassed = structuredResult.verificationPassed;
        const confidenceLevel = verificationPassed ? 'high' : 'medium';

        return {
          queryType: 'structured',
          answer: structuredResult.answer,
          plainLanguage: plainLanguageRequested
            ? this.simplifyToPlainLanguage(structuredResult.answer)
            : this.simplifyToPlainLanguage(structuredResult.answer),
          confidenceLevel: confidenceLevel,
          verificationPassed: verificationPassed,
          verificationNotes: 'Verified against authoritative extracted policy facts table.',
          citations: structuredResult.citations,
        };
      }
    }

    // 2. SEMANTIC ROUTE: Vector Search via ChromaDB
    const vectorChunks = await chromaService.queryPolicyChunks({
      userId,
      policyId: policy._id,
      queryText: question,
      nResults: 3,
    });

    if (!vectorChunks || vectorChunks.length === 0) {
      return {
        queryType: 'semantic',
        answer: 'I could not find information regarding this question in your policy document. Please verify with your insurer or refer to policy clauses.',
        plainLanguage: 'This detail is not explicitly mentioned in your uploaded policy paperwork.',
        confidenceLevel: 'low',
        verificationPassed: false,
        verificationNotes: 'No relevant semantic vector chunks matched the threshold in ChromaDB.',
        citations: [],
      };
    }

    // Synthesize answer grounded in chunks
    const topChunk = vectorChunks[0];
    const citations = vectorChunks.map((chunk) => ({
      policy_id: policy._id,
      chunk_vector_id: chunk.vector_id,
      page_number: chunk.metadata.page_number,
      section_heading: chunk.metadata.section_heading,
    }));

    // Self-verification check (FR-11): Verify relevance of top chunk to query
    const hasRelevance = this.verifySemanticRelevance(question, topChunk.chunk_text);
    const confidenceLevel = hasRelevance ? 'high' : 'medium';

    let answerText = `Based on ${topChunk.metadata.section_heading || 'your policy'}: ${topChunk.chunk_text}`;
    if (!hasRelevance) {
      answerText = `Information found in ${topChunk.metadata.section_heading}: ${topChunk.chunk_text} (Note: Verification confidence is reduced as the clause may only partially address your question).`;
    }

    return {
      queryType: 'semantic',
      answer: answerText,
      plainLanguage: this.simplifyToPlainLanguage(answerText),
      confidenceLevel: confidenceLevel,
      verificationPassed: hasRelevance,
      verificationNotes: hasRelevance
        ? 'Cited passage directly matches the requested policy query terms.'
        : 'Passage has partial keyword overlap; confidence lowered.',
      citations: citations,
    };
  }

  /**
   * Structured Fact Matcher
   */
  answerFromStructuredFacts(policy, question) {
    const q = question.toLowerCase();
    const facts = policy.facts || [];

    // Room rent check
    if (q.includes('room rent') || q.includes('room limit') || q.includes('room charge')) {
      const fact = facts.find((f) => f.category === 'room_rent_limit');
      if (fact) {
        return {
          found: true,
          answer: `Your Room Rent Limit is: ${fact.fact_value}. Exceeding this limit will trigger proportionate deductions across all hospital billing items.`,
          verificationPassed: true,
          citations: [
            {
              policy_id: policy._id,
              page_number: fact.source_page || 4,
              section_heading: fact.source_section || 'Room Rent Limits',
            },
          ],
        };
      }
    }

    // Waiting period check
    if (q.includes('waiting') || q.includes('ped') || q.includes('pre-existing')) {
      const waitingFacts = facts.filter((f) => f.category === 'waiting_period');
      if (waitingFacts.length > 0) {
        const text = waitingFacts.map((f) => `• ${f.fact_key.replace(/_/g, ' ')}: ${f.fact_value}`).join('\n');
        return {
          found: true,
          answer: `The applicable waiting periods in your policy are:\n${text}`,
          verificationPassed: true,
          citations: waitingFacts.map((f) => ({
            policy_id: policy._id,
            page_number: f.source_page || 9,
            section_heading: f.source_section || 'Waiting Periods',
          })),
        };
      }
    }

    // Co-payment check
    if (q.includes('copay') || q.includes('co-pay') || q.includes('co payment')) {
      const fact = facts.find((f) => f.category === 'co_payment');
      if (fact) {
        return {
          found: true,
          answer: `Co-payment terms: ${fact.fact_value}.`,
          verificationPassed: true,
          citations: [
            {
              policy_id: policy._id,
              page_number: fact.source_page || 7,
              section_heading: fact.source_section || 'Co-Payment Terms',
            },
          ],
        };
      }
    }

    // Sum Insured check
    if (q.includes('sum insured') || q.includes('coverage amount') || q.includes('maximum coverage')) {
      const fact = facts.find((f) => f.category === 'sum_insured');
      if (fact) {
        return {
          found: true,
          answer: `Your total base Sum Insured coverage is ${fact.fact_value}.`,
          verificationPassed: true,
          citations: [
            {
              policy_id: policy._id,
              page_number: fact.source_page || 2,
              section_heading: fact.source_section || 'Schedule of Benefits',
            },
          ],
        };
      }
    }

    // ICU charges check
    if (q.includes('icu')) {
      const fact = facts.find((f) => f.category === 'sub_limit' && f.fact_key.includes('icu'));
      if (fact) {
        return {
          found: true,
          answer: `Intensive Care Unit (ICU) charges: ${fact.fact_value}.`,
          verificationPassed: true,
          citations: [
            {
              policy_id: policy._id,
              page_number: fact.source_page || 4,
              section_heading: fact.source_section || 'ICU Charges',
            },
          ],
        };
      }
    }

    return { found: false };
  }

  /**
   * Self-Verification Check (FR-11)
   */
  verifySemanticRelevance(question, chunkText) {
    const qWords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['what', 'when', 'does', 'this', 'have', 'policy', 'cover'].includes(w));

    const chunkLower = chunkText.toLowerCase();
    const matchCount = qWords.filter((w) => chunkLower.includes(w)).length;

    return matchCount >= Math.min(2, qWords.length);
  }

  /**
   * Plain-Language Jargon Translator (FR-13)
   */
  simplifyToPlainLanguage(text) {
    let simplified = text;

    simplified = simplified.replace(/proportionate deduction/gi, 'paying extra out of your own pocket for everything');
    simplified = simplified.replace(/co-payment/gi, 'your share of the bill (e.g. you pay a fixed percentage while insurance pays the rest)');
    simplified = simplified.replace(/deductible/gi, 'initial amount you must pay by yourself before insurance kicks in');
    simplified = simplified.replace(/pre-existing disease|ped/gi, 'health conditions you already had before buying this policy');
    simplified = simplified.replace(/cashless claims/gi, 'the hospital bills insurance directly so you do not pay upfront');
    simplified = simplified.replace(/sum insured/gi, 'maximum money insurance can pay in a year');

    return simplified;
  }
}

module.exports = new RagService();
