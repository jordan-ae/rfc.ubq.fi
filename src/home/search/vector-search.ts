import { FeatureExtractionPipeline, pipeline, Tensor } from '@xenova/transformers';

export class VectorSearch {
  private _documentVectors: Map<number, Float32Array> = new Map();
  private _encoder: FeatureExtractionPipeline | undefined;
  private readonly _modelName = 'Xenova/all-MiniLM-L6-v2';

  constructor() {
    this._initializeEncoder().catch(console.error);
  }

  private async _initializeEncoder() {
    try {
      // Initialize the embedding pipeline
      this._encoder = await pipeline('feature-extraction', this._modelName, {
        quantized: false
      });
    } catch (error) {
      console.error('Failed to initialize encoder:', error);
      throw new Error('Failed to initialize encoder');
    }
  }

  public async initializeVectors(documents: Array<{ id: number; content: string }>): Promise<void> {
    if (!this._encoder || this._encoder === undefined) {
      await this._initializeEncoder();
    }

    // Process documents in batches to avoid memory issues
    const batchSize = 32;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const contents = batch.map(doc => this._preprocessText(doc.content));
      
      // Generate embeddings for the batch
      if (!this._encoder) {
        throw new Error('Encoder not initialized');
      }
      const embeddings = await this._encoder(contents, {
        pooling: 'mean',
        normalize: true
      }) as Tensor;

      // Store the embeddings
      batch.forEach((doc, index) => {
        const vector = new Float32Array(embeddings.data[index]);
        this._documentVectors.set(doc.id, vector);
      });
    }
  }

  public async search(query: string, topK: number = 5): Promise<Array<{ id: number; score: number }>> {
    if (!this._encoder) {
      throw new Error('Encoder not initialized');
    }

    // Generate query embedding
    const preprocessedQuery = this._preprocessText(query);
    const queryEmbedding = await this._encoder(preprocessedQuery, {
      pooling: 'mean',
      normalize: true
    });
    const queryVector = new Float32Array(queryEmbedding.data[0]);

    // Calculate similarities with all documents
    const scores = Array.from(this._documentVectors.entries()).map(([id, docVector]) => ({
      id,
      score: this._calculateCosineSimilarity(queryVector, docVector)
    }));

    // Sort by score and return top K results
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  public async getSimilarityScore(documentId: number, queryTerms: string[]): Promise<number> {
    if (!this._documentVectors.has(documentId) || queryTerms.length === 0) {
      return 0;
    }

    if (!this._encoder) {
      throw new Error('Encoder not initialized');
    }

    if (!queryTerms) {
      throw new Error('Query terms not provided');
    }

    // Process each query term individually
    const queryEmbeddings = await Promise.all(
      queryTerms.map(term => {
        return this._encoder(this._preprocessText(term), {
          pooling: 'mean',
          normalize: true
        });
      })
    );

    // Combine embeddings by averaging them
    const combinedVector = new Float32Array(queryEmbeddings[0].data[0].length);
    for (let i = 0; i < queryEmbeddings.length; i++) {
      const embedding = new Float32Array(queryEmbeddings[i].data[0]);
      for (let j = 0; j < combinedVector.length; j++) {
        combinedVector[j] += embedding[j];
      }
    }

    // Normalize the combined vector
    const norm = Math.sqrt(combinedVector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < combinedVector.length; i++) {
        combinedVector[i] /= norm;
      }
    }

    const docVector = this._documentVectors.get(documentId);
    if (!docVector) {
      throw new Error(`Document with id ${documentId} not found`);
    }
    return this._calculateCosineSimilarity(combinedVector, docVector);
  }

  private _calculateCosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    const similarity = dotProduct / (normA * normB) || 0;
    return Math.max(0, Math.min(1, similarity));
  }

  private _preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  public getDocumentCount(): number {
    return this._documentVectors.size;
  }

  public hasDocument(id: number): boolean {
    return this._documentVectors.has(id);
  }

  public clearDocuments(): void {
    this._documentVectors.clear();
  }
}