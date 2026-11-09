import { EmbeddingEngine } from './onnx/EmbeddingEngine';

const TAXONOMY: Record<string, string[]> = {
  TECHNICAL: [
    'java', 'react', 'sql', 'spring boot', 'system design', 'docker', 'kubernetes',
    'api', 'database', 'microservices', 'algorithm', 'data structure', 'coding',
    'programming', 'typescript', 'javascript', 'python', 'c++', 'golang', 'rust',
    'aws', 'azure', 'cloud', 'devops', 'ci/cd', 'testing', 'debugging', 'architecture',
  ],
  CODING: [
    'write code', 'implement', 'function', 'class', 'method', 'algorithm', 'solve',
    'bug', 'error', 'fix', 'debug', 'refactor', 'optimize',
  ],
  SYSTEM_DESIGN: [
    'design', 'architecture', 'scale', 'distributed', 'system design', 'high-level',
    'load balancer', 'database design', 'microservices',
  ],
  HR: [
    'salary', 'notice period', 'bond', 'relocation', 'package', 'ctc', 'hike',
    'increment', 'background check', 'offer letter', 'joining date',
  ],
  BEHAVIORAL: [
    'tell me about yourself', 'strength', 'weakness', 'teamwork', 'leadership',
    'conflict', 'experience', 'project', 'achievement', 'failure',
  ],
  CASUAL_CHAT: [
    'hello', 'hi', 'how are you', 'thank you', 'thanks', 'bye', 'goodbye',
    'good morning', 'good evening',
  ],
};

const ALLOWED_CATEGORIES = new Set(['TECHNICAL', 'CODING', 'SYSTEM_DESIGN']);
const BLOCKED_CATEGORIES = new Set(['HR', 'BEHAVIORAL', 'CASUAL_CHAT']);

export class IntentClassifier {
  private static instance: IntentClassifier | null = null;
  private engine: EmbeddingEngine;
  private categoryEmbeddings: Map<string, Float32Array> | null = null;
  private ready = false;

  private constructor() {
    this.engine = new EmbeddingEngine();
  }

  static getInstance(): IntentClassifier {
    if (!IntentClassifier.instance) {
      IntentClassifier.instance = new IntentClassifier();
    }
    return IntentClassifier.instance;
  }

  getTaxonomyTerms(): Record<string, string[]> {
    return { ...TAXONOMY };
  }

  async classify(
    text: string,
    embedding?: Float32Array,
  ): Promise<{ category: string; confidence: number; isAllowed: boolean }> {
    const lowerText = text.toLowerCase().trim();
    if (!lowerText) {
      return { category: 'CASUAL_CHAT', confidence: 0, isAllowed: false };
    }

    const keywordResult = this.classifyByKeywords(lowerText);
    if (keywordResult.confidence >= 0.8) {
      return keywordResult;
    }

    if (!this.ready) {
      try {
        await this.initEmbeddings();
      } catch {
        return keywordResult;
      }
    }

    try {
      const textEmbedding = embedding ?? (await this.engine.getEmbedding(text));
      return this.classifyBySimilarity(textEmbedding, keywordResult);
    } catch {
      return keywordResult;
    }
  }

  private classifyByKeywords(text: string): { category: string; confidence: number; isAllowed: boolean } {
    let bestCategory = 'CASUAL_CHAT';
    let bestScore = 0;

    for (const [category, terms] of Object.entries(TAXONOMY)) {
      let matchCount = 0;
      for (const term of terms) {
        if (text.includes(term)) {
          matchCount++;
        }
      }
      if (matchCount === 0) continue;
      const score = matchCount / terms.length;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    if (bestScore === 0) {
      for (const [category, terms] of Object.entries(TAXONOMY)) {
        for (const term of terms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp('\\b' + escaped + '\\b', 'i').test(text)) {
            const score = 0.6 / Object.keys(TAXONOMY).length;
            return {
              category,
              confidence: score,
              isAllowed: ALLOWED_CATEGORIES.has(category),
            };
          }
        }
      }
    }

    return {
      category: bestCategory,
      confidence: bestScore,
      isAllowed: ALLOWED_CATEGORIES.has(bestCategory),
    };
  }

  private async initEmbeddings(): Promise<void> {
    await this.engine.ensureLoaded();
    this.categoryEmbeddings = new Map();

    for (const [category, terms] of Object.entries(TAXONOMY)) {
      const embeddings: Float32Array[] = [];
      for (const term of terms) {
        try {
          const emb = await this.engine.getEmbedding(term);
          embeddings.push(emb);
        } catch {
          // skip failed terms
        }
      }
      if (embeddings.length > 0) {
        const dim = embeddings[0].length;
        const avg = new Float32Array(dim);
        for (const emb of embeddings) {
          for (let i = 0; i < dim; i++) {
            avg[i] += emb[i];
          }
        }
        for (let i = 0; i < dim; i++) {
          avg[i] /= embeddings.length;
        }
        this.categoryEmbeddings.set(category, avg);
      }
    }

    this.ready = this.categoryEmbeddings.size > 0;
  }

  private classifyBySimilarity(
    textEmbedding: Float32Array,
    fallback: { category: string; confidence: number; isAllowed: boolean },
  ): { category: string; confidence: number; isAllowed: boolean } {
    if (!this.categoryEmbeddings || this.categoryEmbeddings.size === 0) {
      return fallback;
    }

    let bestCategory = fallback.category;
    let bestScore = fallback.confidence;

    for (const [category, catEmbedding] of this.categoryEmbeddings.entries()) {
      const similarity = this.cosineSimilarity(textEmbedding, catEmbedding);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestCategory = category;
      }
    }

    const isAllowed = bestScore >= 0.8 && ALLOWED_CATEGORIES.has(bestCategory)
      ? true
      : ALLOWED_CATEGORIES.has(bestCategory);

    const isBlocked = BLOCKED_CATEGORIES.has(bestCategory);
    return {
      category: bestCategory,
      confidence: bestScore,
      isAllowed: !isBlocked && isAllowed,
    };
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    const len = Math.min(a.length, b.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
