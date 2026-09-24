const { ChromaClient } = require('chromadb');
const config = require('./config');

let chromaClient = null;
let policyCollection = null;
let isChromaAvailable = false;

// In-memory vector fallback when standalone ChromaDB server is not running
class InMemoryVectorStore {
  constructor() {
    this.vectors = new Map(); // id -> { id, document, metadata, embedding }
  }

  async add({ ids, documents, metadatas, embeddings }) {
    for (let i = 0; i < ids.length; i++) {
      this.vectors.set(ids[i], {
        id: ids[i],
        document: documents[i],
        metadata: metadatas[i],
        embedding: embeddings ? embeddings[i] : null,
      });
    }
    return true;
  }

  async query({ queryTexts, nResults = 5, where = {} }) {
    const query = (queryTexts[0] || '').toLowerCase();
    const queryTokens = query.split(/\s+/).filter(Boolean);

    let candidates = Array.from(this.vectors.values());

    // Apply where filter (e.g. user_id, policy_id)
    if (where && Object.keys(where).length > 0) {
      candidates = candidates.filter((item) => {
        for (const [key, val] of Object.entries(where)) {
          if (val && typeof val === 'object' && val.$in) {
            if (!val.$in.includes(item.metadata[key])) return false;
          } else if (item.metadata[key] !== val) {
            return false;
          }
        }
        return true;
      });
    }

    // Score by keyword match & semantic token overlap
    const scored = candidates.map((item) => {
      const docLower = item.document.toLowerCase();
      let score = 0;
      queryTokens.forEach((token) => {
        if (docLower.includes(token)) score += 1;
      });
      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, nResults).map((s) => s.item);

    return {
      ids: [topResults.map((r) => r.id)],
      documents: [topResults.map((r) => r.document)],
      metadatas: [topResults.map((r) => r.metadata)],
      distances: [topResults.map((r, i) => 0.1 * i)],
    };
  }

  async delete({ ids, where }) {
    if (ids && ids.length > 0) {
      ids.forEach((id) => this.vectors.delete(id));
    } else if (where) {
      for (const [id, item] of this.vectors.entries()) {
        let match = true;
        for (const [key, val] of Object.entries(where)) {
          if (item.metadata[key] !== val) match = false;
        }
        if (match) this.vectors.delete(id);
      }
    }
    return true;
  }
}

const memoryStore = new InMemoryVectorStore();

const initChroma = async () => {
  try {
    chromaClient = new ChromaClient({ path: config.CHROMA_URL });
    policyCollection = await chromaClient.getOrCreateCollection({
      name: 'policy_chunks',
      metadata: { 'hnsw:space': 'cosine' },
    });
    isChromaAvailable = true;
    console.log(`[ChromaDB] Connected to Chroma vector store collection: policy_chunks`);
  } catch (error) {
    console.warn(`[ChromaDB] Standalone Chroma server not reachable at ${config.CHROMA_URL}. Using in-memory vector store fallback.`);
    isChromaAvailable = false;
  }
};

const getVectorCollection = () => {
  if (isChromaAvailable && policyCollection) {
    return { client: chromaClient, collection: policyCollection, isMemoryFallback: false };
  }
  return { client: null, collection: memoryStore, isMemoryFallback: true };
};

module.exports = {
  initChroma,
  getVectorCollection,
  InMemoryVectorStore,
};
