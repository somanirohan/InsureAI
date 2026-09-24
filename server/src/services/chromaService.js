const { getVectorCollection } = require('../config/chroma');

/**
 * ChromaDB Vector Store Service (Specification Section 9)
 * Collection: policy_chunks
 */
class ChromaService {
  /**
   * Adds or updates document chunks in ChromaDB vector store
   * @param {Array} chunks Array of chunk objects with vector_id, chunk_text, and metadata
   */
  async upsertChunks(chunks) {
    if (!chunks || chunks.length === 0) return;

    const { collection } = getVectorCollection();
    const ids = chunks.map((c) => c.vector_id);
    const documents = chunks.map((c) => c.chunk_text);
    const metadatas = chunks.map((c) => ({
      user_id: c.user_id.toString(),
      policy_id: c.policy_id.toString(),
      chunk_index: Number(c.chunk_index),
      page_number: c.page_number ? Number(c.page_number) : 0,
      section_heading: c.section_heading || 'General Terms',
      insurer_name: c.insurer_name || '',
      policy_type: c.policy_type || '',
      created_at: new Date().toISOString(),
    }));

    // In a full LLM setup, embeddings can be pre-calculated or Chroma will use default sentence transformer
    await collection.add({
      ids,
      documents,
      metadatas,
    });

    console.log(`[ChromaService] Successfully indexed ${chunks.length} chunks into ChromaDB`);
  }

  /**
   * Query policy chunks with strict user_id and policy_id data isolation (FR-09, NFR 5.3)
   * @param {Object} params
   * @param {string} params.userId Owning user ID (Mandatory)
   * @param {string|Array<string>} params.policyId Single policy ID or array of policy IDs
   * @param {string} params.queryText Natural language question
   * @param {number} params.nResults Number of results to retrieve
   */
  async queryPolicyChunks({ userId, policyId, queryText, nResults = 5 }) {
    const { collection } = getVectorCollection();

    // Data isolation rule: mandatory filter on user_id
    const filter = {
      user_id: userId.toString(),
    };

    if (policyId) {
      if (Array.isArray(policyId) && policyId.length > 0) {
        filter.policy_id = { $in: policyId.map((id) => id.toString()) };
      } else {
        filter.policy_id = policyId.toString();
      }
    }

    try {
      const results = await collection.query({
        queryTexts: [queryText],
        nResults: nResults,
        where: filter,
      });

      const formatted = [];
      if (results && results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          formatted.push({
            vector_id: results.ids[0][i],
            chunk_text: results.documents[0][i],
            metadata: results.metadatas[0][i],
            distance: results.distances ? results.distances[0][i] : null,
          });
        }
      }

      return formatted;
    } catch (error) {
      console.error('[ChromaService] Query error:', error.message);
      return [];
    }
  }

  /**
   * Cascade deletes vectors associated with a policy
   * @param {string} userId
   * @param {string} policyId
   */
  async deletePolicyVectors(userId, policyId) {
    const { collection } = getVectorCollection();
    try {
      await collection.delete({
        where: {
          user_id: userId.toString(),
          policy_id: policyId.toString(),
        },
      });
      console.log(`[ChromaService] Successfully deleted vectors for policy ${policyId}`);
    } catch (error) {
      console.error(`[ChromaService] Error deleting vectors for policy ${policyId}:`, error.message);
    }
  }
}

module.exports = new ChromaService();
