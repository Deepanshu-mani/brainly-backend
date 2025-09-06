import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';

config();

// OpenAI client for summarization/keywords (optional)
const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// Jina AI client (OpenAI-compatible) for embeddings (fallback if Gemini not set)
const jina = process.env.JINA_API_KEY
    ? new OpenAI({ apiKey: process.env.JINA_API_KEY, baseURL: 'https://api.jina.ai/v1' })
    : null;

// Gemini client (optional). Used for embeddings when GEMINI_API_KEY is present,
// and as a fallback for summary/keywords if OPENAI_API_KEY is missing.
const gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

export interface AIProcessingResult {
    summary: string;
    keywords: string[];
    embedding: number[];
}

export class AIService {
    static async generateSummary(content: string): Promise<string> {
        try {
            console.log('Generating summary...');
            console.log('Content length:', content.length);

            // Try OpenAI first if configured
            if (openai) {
                try {
                    const response = await openai.chat.completions.create({
                        model: "gpt-3.5-turbo",
                        messages: [
                            { role: "system", content: "You are a helpful assistant that creates concise, informative summaries of content. Focus on the key points and main ideas." },
                            { role: "user", content: `Please provide a concise summary of the following content in 2-3 sentences:\n\n${content}` }
                        ],
                        max_tokens: 150,
                        temperature: 0.3,
                    });
                    const summary = response.choices[0]?.message?.content || "Summary not available";
                    console.log('Summary generated with OpenAI');
                    return summary;
                } catch (err) {
                    console.warn('OpenAI summary failed, attempting Gemini fallback...', err instanceof Error ? err.message : err);
                }
            }

            // Fallback to Gemini
            if (gemini) {
                try {
                    const model = gemini.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
                    const prompt = `Summarize the following content in 2-3 concise sentences focusing on key points:\n\n${content}`;
                    const result = await model.generateContent([{ text: prompt }]);
                    const summary = result.response.text().trim();
                    console.log('Summary generated with Gemini');
                    return summary || 'Summary not available';
                } catch (err) {
                    console.error('Gemini summary failed:', err instanceof Error ? err.message : err);
                }
            }

            console.warn('No provider available for summary');
            return 'Summary not available';
        } catch (error) {
            console.error('Error generating summary:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Error stack:', error.stack);
            }
            return "Summary not available";
        }
    }

    static async extractKeywords(content: string): Promise<string[]> {
        try {
            // Try OpenAI first if configured
            if (openai) {
                try {
                    const response = await openai.chat.completions.create({
                        model: "gpt-3.5-turbo",
                        messages: [
                            { role: "system", content: "You are a helpful assistant that extracts relevant keywords from content. Return only the keywords as a comma-separated list, no explanations." },
                            { role: "user", content: `Extract 5-8 relevant keywords from this content:\n\n${content}` }
                        ],
                        max_tokens: 100,
                        temperature: 0.2,
                    });
                    const keywordsText = response.choices[0]?.message?.content || "";
                    return keywordsText.split(',').map(k => k.trim()).filter(Boolean);
                } catch (err) {
                    console.warn('OpenAI keywords failed, attempting Gemini fallback...', err instanceof Error ? err.message : err);
                }
            }

            // Fallback to Gemini
            if (gemini) {
                try {
                    const model = gemini.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
                    const prompt = `Extract 5-8 relevant, lowercase keywords from the content. Return ONLY a comma-separated list, no extra text.\n\n${content}`;
                    const result = await model.generateContent([{ text: prompt }]);
                    const keywordsText = result.response.text().trim();
                    return keywordsText.split(',').map(k => k.trim()).filter(Boolean);
                } catch (err) {
                    console.error('Gemini keywords failed:', err instanceof Error ? err.message : err);
                }
            }

            console.warn('No provider available for keywords');
            return [];
        } catch (error) {
            console.error('Error extracting keywords:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
            }
            return [];
        }
    }

    static async generateEmbedding(text: string): Promise<number[]> {
        try {
            if (gemini) {
                const modelName = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
                const model = gemini.getGenerativeModel({ model: modelName });
                const result = await model.embedContent(text);
                const embedding = result.embedding.values as number[];
                return embedding;
            }

            if (jina) {
                const response = await jina.embeddings.create({
                    model: 'jina-embeddings-v3',
                    input: text,
                });
                return response.data[0].embedding as unknown as number[];
            }

            console.warn('No provider available for embeddings');
            return [];
        } catch (error) {
            console.error('Error generating embedding (Jina):', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Error stack:', error.stack);
            }
            return [];
        }
    }

    static async generateSearchResponse(query: string, relevantContent: any[], fallbackContent: any[] = []): Promise<string> {
        try {
            console.log('Generating AI search response for query:', query);
            
            // Prepare content context
            const allContent = relevantContent.length > 0 ? relevantContent : fallbackContent;
            const contentContext = allContent.slice(0, 10).map((item, index) => {
                const date = new Date(item.createdAt).toLocaleDateString();
                const type = item.type || 'unknown';
                const title = item.title || 'Untitled';
                const summary = item.summary || item.content?.substring(0, 100) || '';
                return `${index + 1}. [${type.toUpperCase()}] ${title} (${date}) - ${summary}`;
            }).join('\n');

            const systemPrompt = `You are Brainly, an AI assistant that helps users find and understand their saved content. You have access to their personal knowledge base including bookmarks, notes, videos, and other content.

When users ask questions like "what did I bookmark today" or "show me my recent content", provide helpful, conversational responses based on their actual content. Be specific and mention actual titles, dates, and types when relevant.

If no relevant content is found, suggest they add some content or try a different search.`;

            const userPrompt = `User Query: "${query}"

Available Content:
${contentContext}

Please provide a helpful response based on the user's query and their available content. Be conversational and specific.`;

            // Try OpenAI first if configured
            if (openai) {
                try {
                    const response = await openai.chat.completions.create({
                        model: "gpt-3.5-turbo",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPrompt }
                        ],
                        max_tokens: 300,
                        temperature: 0.7,
                    });
                    const response_text = response.choices[0]?.message?.content || "I couldn't find any relevant content for your query.";
                    console.log('AI search response generated with OpenAI');
                    return response_text;
                } catch (err) {
                    console.warn('OpenAI search response failed, attempting Gemini fallback...', err instanceof Error ? err.message : err);
                }
            }

            // Fallback to Gemini
            if (gemini) {
                try {
                    const model = gemini.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
                    const prompt = `${systemPrompt}\n\n${userPrompt}`;
                    const result = await model.generateContent([{ text: prompt }]);
                    const response_text = result.response.text().trim();
                    console.log('AI search response generated with Gemini');
                    return response_text || "I couldn't find any relevant content for your query.";
                } catch (err) {
                    console.error('Gemini search response failed:', err instanceof Error ? err.message : err);
                }
            }

            console.warn('No provider available for search response');
            return "I'm sorry, I couldn't process your request right now. Please try again later.";
        } catch (error) {
            console.error('Error generating search response:', error);
            return "I'm sorry, I encountered an error while processing your request.";
        }
    }

    static async processContent(content: string): Promise<AIProcessingResult> {
        try {
            console.log('Starting AI content processing...');
            console.log('Content length:', content.length);
            
            const [summary, keywords, embedding] = await Promise.all([
                this.generateSummary(content),
                this.extractKeywords(content),
                this.generateEmbedding(content)
            ]);

            console.log('AI processing completed successfully');
            return {
                summary,
                keywords,
                embedding
            };
        } catch (error) {
            console.error('Error processing content:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Error stack:', error.stack);
            }
            return {
                summary: "Processing failed",
                keywords: [],
                embedding: []
            };
        }
    }
}

