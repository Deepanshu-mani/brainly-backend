import { ContentModel } from '../config/db';
import { AIService } from './aiService';

export interface SearchResult {
    content: any;
    similarity: number;
}

export class VectorSearchService {
    static async searchContent(
        query: string,
        userId: string,
        limit: number = 10,
        opts?: { type?: string; tags?: string[] }
    ): Promise<SearchResult[]> {
        try {
            // Tuning knobs (can be overridden via env)
            const minSimilarity = Number(process.env.VECTOR_MIN_SIMILARITY || 0.2);
            const recencyBoostWeight = Number(process.env.VECTOR_RECENCY_BOOST || 0);

            // Generate embedding for the search query
            const queryEmbedding = await AIService.generateEmbedding(query);
            
            if (!queryEmbedding || queryEmbedding.length === 0) {
                // Fallback to text search if embedding fails
                return await this.fallbackTextSearch(query, userId, limit);
            }

            // Get all user content with embeddings
            const vectorFilter: any = {
                userId: userId,
                embedding: { $exists: true, $ne: null }
            };
            if (opts?.type) vectorFilter.type = opts.type;
            if (opts?.tags && opts.tags.length > 0) vectorFilter.tags = { $in: opts.tags };
            const userContent = await ContentModel.find(vectorFilter);

            if (userContent.length === 0) {
                return await this.fallbackTextSearch(query, userId, limit);
            }

            // Calculate cosine similarity for each content item and apply optional recency boost
            const now = Date.now();
            const vectorResults = userContent
                .map(content => {
                    if (!content.embedding || content.embedding.length === 0) {
                        return null;
                    }

                    const similarity = this.cosineSimilarity(queryEmbedding, content.embedding);

                    // Optional recency boost (0..1). Newer items get a small bump.
                    // We normalize age to ~90 days window by default.
                    let boosted = similarity;
                    if (recencyBoostWeight > 0) {
                        const createdAtMs = new Date(content.createdAt || content.updatedAt || now).getTime();
                        const ageDays = Math.max(0, (now - createdAtMs) / (1000 * 60 * 60 * 24));
                        const halfLifeDays = Number(process.env.VECTOR_RECENCY_HALFLIFE_DAYS || 90);
                        const recencyScore = Math.exp(-ageDays / halfLifeDays); // 1 (new) -> ~0 (old)
                        boosted = similarity + recencyBoostWeight * recencyScore;
                    }

                    return {
                        content,
                        similarity: boosted
                    };
                })
                .filter(result => result !== null && (result as SearchResult).similarity >= minSimilarity)
                .sort((a, b) => b!.similarity - a!.similarity)
                .slice(0, limit);

            // If no vector results, fallback to text search entirely
            if (vectorResults.length === 0) {
                return await this.fallbackTextSearch(query, userId, limit);
            }

            // Also run a lightweight text search and merge with vector results to ensure
            // items without embeddings (e.g., some link types) can still match by title/tags
            const textResults = await this.fallbackTextSearch(query, userId, limit, opts);

            const seenIds = new Set<string>(vectorResults.map(r => String(r!.content._id)));
            const merged: SearchResult[] = [...(vectorResults as SearchResult[])];

            for (const tr of textResults) {
                const id = String(tr.content._id);
                if (!seenIds.has(id)) {
                    merged.push(tr);
                    seenIds.add(id);
                }
                if (merged.length >= limit) break;
            }

            return merged.slice(0, limit);
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

    private static async fallbackTextSearch(
        query: string,
        userId: string,
        limit: number,
        opts?: { type?: string; tags?: string[] }
    ): Promise<SearchResult[]> {
        try {
            const regex = new RegExp(query, 'i');
            const compact = query.replace(/\s+/g, '');
            const compactRegex = compact ? new RegExp(compact, 'i') : null;
            const tokens = query.split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1);

            // Base OR conditions (exact-ish phrase match)
            const baseOr: any[] = [
                { title: regex },
                { content: regex },
                { link: regex },
                { tags: regex },
                { summary: regex },
                { keywords: regex },
                { 'websiteMetadata.description': regex },
                { 'websiteMetadata.domain': regex }
            ];

            // If query contains spaces, also try a space-stripped match on the link
            if (compactRegex) {
                baseOr.push({ link: compactRegex });
            }

            // Token-based AND-of-ORs: each token must appear in any of the fields
            const tokenAnd: any[] = tokens.map(t => {
                const tr = new RegExp(t, 'i');
                return {
                    $or: [
                        { title: tr },
                        { content: tr },
                        { link: tr },
                        { tags: tr },
                        { summary: tr },
                        { keywords: tr },
                        { 'websiteMetadata.description': tr },
                        { 'websiteMetadata.domain': tr }
                    ]
                };
            });

            const mongoFilter: any = { userId: userId, $or: baseOr };
            if (opts?.type) mongoFilter.type = opts.type;
            if (opts?.tags && opts.tags.length > 0) mongoFilter.tags = { $in: opts.tags };
            if (tokenAnd.length > 0) {
                mongoFilter.$and = tokenAnd;
            }

            const content = await ContentModel.find(mongoFilter)
                .sort({ createdAt: -1 })
                .limit(limit * 3); // fetch extra for scoring then trim

            // Heuristic scoring for keyword/metadata search
            const now = Date.now();
            const textRecencyBoost = Number(process.env.TEXT_RECENCY_BOOST || process.env.VECTOR_RECENCY_BOOST || 0);
            const halfLifeDays = Number(process.env.TEXT_RECENCY_HALFLIFE_DAYS || process.env.VECTOR_RECENCY_HALFLIFE_DAYS || 90);

            const lowerQuery = query.toLowerCase();
            const tokenSet = new Set(tokens.map(t => t.toLowerCase()));

            const scored: SearchResult[] = content.map(item => {
                const title = '';
                const summary = ((item as any).summary || '').toLowerCase();
                const keywords: string[] = Array.isArray((item as any).keywords) ? (item as any).keywords : [];
                const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
                const domain = ((item as any).websiteMetadata?.domain || '').toLowerCase();

                let score = 0.1;

                // Strong boosts
                if (title.includes(lowerQuery)) score += 0.6;
                if (summary.includes(lowerQuery)) score += 0.3;

                // Token overlaps in title/tags/keywords/domain
                const titleTokensHit = Array.from(tokenSet).some(t => t.length > 2 && title.includes(t));
                if (titleTokensHit) score += 0.2;

                const tagHit = tags.some(t => tokenSet.has(String(t).toLowerCase()));
                if (tagHit) score += 0.2;

                const keywordHit = keywords.some(k => tokenSet.has(String(k).toLowerCase()));
                if (keywordHit) score += 0.15;

                if (domain && tokenSet.has(domain)) score += 0.1;

                // Fuzzy token matches (tolerate small misspellings)
                // For each query token, if any word in title/summary/keywords/tags is within edit distance <=2, add a small boost
                const corpusWords: string[] = [
                    ...title.split(/\W+/),
                    ...summary.split(/\W+/),
                    ...keywords.map(String),
                    ...tags.map(String)
                ].map(w => w.toLowerCase()).filter(Boolean);

                for (const t of tokenSet) {
                    if (t.length < 4) continue; // avoid overmatching short tokens
                    const best = VectorSearchService.minEditDistance(t, corpusWords);
                    if (best === 1) score += 0.12;
                    else if (best === 2) score += 0.06;
                }

                // Recency boost
                if (textRecencyBoost > 0) {
                    const createdAtMs = new Date((item as any).createdAt || (item as any).updatedAt || now).getTime();
                    const ageDays = Math.max(0, (now - createdAtMs) / (1000 * 60 * 60 * 24));
                    const recencyScore = Math.exp(-ageDays / halfLifeDays);
                    score += textRecencyBoost * recencyScore;
                }

                // Cap score range
                if (score > 1) score = 1;

                return { content: item, similarity: score } as SearchResult;
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

            return scored;
        } catch (error) {
            console.error('Error in fallback text search:', error);
            return [];
        }
    }

    // Compute the minimum edit distance between a token and any of the given words (capped at 2 for speed)
    private static minEditDistance(token: string, words: string[]): number {
        let best = 3;
        for (const w of words) {
            const d = VectorSearchService.levenshteinCapped(token, w, 2);
            if (d < best) best = d;
            if (best === 0) break;
        }
        return best;
    }

    // Levenshtein with early exit when distance exceeds cap
    private static levenshteinCapped(a: string, b: string, cap: number): number {
        const la = a.length, lb = b.length;
        if (Math.abs(la - lb) > cap) return cap + 1;
        const dp = new Array(lb + 1);
        for (let j = 0; j <= lb; j++) dp[j] = j;
        for (let i = 1; i <= la; i++) {
            let prev = dp[0];
            dp[0] = i;
            let rowMin = dp[0];
            for (let j = 1; j <= lb; j++) {
                const temp = dp[j];
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[j] = Math.min(
                    dp[j] + 1,
                    dp[j - 1] + 1,
                    prev + cost
                );
                prev = temp;
                if (dp[j] < rowMin) rowMin = dp[j];
            }
            if (rowMin > cap) return cap + 1; // early exit
        }
        return dp[lb];
    }
}

