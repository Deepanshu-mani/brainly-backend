import { ContentModel } from '../config/db';
import { AIService } from './aiService';

export interface SearchResult {
    content: any;
    similarity: number;
}

export class VectorSearchService {
    static async searchContent(query: string, userId: string, limit: number = 10): Promise<SearchResult[]> {
        try {
            // Generate embedding for the search query
            const queryEmbedding = await AIService.generateEmbedding(query);
            
            if (!queryEmbedding || queryEmbedding.length === 0) {
                // Fallback to text search if embedding fails
                return await this.fallbackTextSearch(query, userId, limit);
            }

            // Get all user content with embeddings
            const userContent = await ContentModel.find({
                userId: userId,
                embedding: { $exists: true, $ne: null }
            });

            if (userContent.length === 0) {
                return await this.fallbackTextSearch(query, userId, limit);
            }

            // Calculate cosine similarity for each content item
            const results = userContent
                .map(content => {
                    if (!content.embedding || content.embedding.length === 0) {
                        return null;
                    }
                    
                    const similarity = this.cosineSimilarity(queryEmbedding, content.embedding);
                    return {
                        content,
                        similarity
                    };
                })
                .filter(result => result !== null)
                .sort((a, b) => b!.similarity - a!.similarity)
                .slice(0, limit);

            return results as SearchResult[];
        } catch (error) {
            console.error('Error in vector search:', error);
            return await this.fallbackTextSearch(query, userId, limit);
        }
    }

    static async searchByTags(tags: string[], userId: string, limit: number = 10): Promise<any[]> {
        try {
            const content = await ContentModel.find({
                userId: userId,
                tags: { $in: tags }
            })
            .sort({ createdAt: -1 })
            .limit(limit);

            return content;
        } catch (error) {
            console.error('Error in tag search:', error);
            return [];
        }
    }

    static async searchByType(type: string, userId: string, limit: number = 10): Promise<any[]> {
        try {
            const content = await ContentModel.find({
                userId: userId,
                type: type
            })
            .sort({ createdAt: -1 })
            .limit(limit);

            return content;
        } catch (error) {
            console.error('Error in type search:', error);
            return [];
        }
    }

    static async getSimilarContent(contentId: string, userId: string, limit: number = 5): Promise<SearchResult[]> {
        try {
            const sourceContent = await ContentModel.findOne({
                _id: contentId,
                userId: userId
            });

            if (!sourceContent || !sourceContent.embedding) {
                return [];
            }

            const similarContent = await ContentModel.find({
                userId: userId,
                _id: { $ne: contentId },
                embedding: { $exists: true, $ne: null }
            });

            const results = similarContent
                .map(content => {
                    if (!content.embedding) return null;
                    
                    const similarity = this.cosineSimilarity(sourceContent.embedding, content.embedding);
                    return {
                        content,
                        similarity
                    };
                })
                .filter(result => result !== null)
                .sort((a, b) => b!.similarity - a!.similarity)
                .slice(0, limit);

            return results as SearchResult[];
        } catch (error) {
            console.error('Error finding similar content:', error);
            return [];
        }
    }

    private static cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) {
            return 0;
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private static async fallbackTextSearch(query: string, userId: string, limit: number): Promise<SearchResult[]> {
        try {
            const regex = new RegExp(query, 'i');
            const content = await ContentModel.find({
                userId: userId,
                $or: [
                    { title: regex },
                    { content: regex },
                    { tags: { $in: [regex] } }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(limit);

            return content.map(item => ({
                content: item,
                similarity: 0.5 // Default similarity for text search
            }));
        } catch (error) {
            console.error('Error in fallback text search:', error);
            return [];
        }
    }
}

