import { userMiddleware } from "../middleware/authMiddleware";
import { ContentModel } from "../config/db";
import { Router } from "express";
import { AIService } from "../services/aiService";
import { WebsiteService } from "../services/websiteService";
import { VectorSearchService } from "../services/vectorSearchService";

export const contentRouter = Router();

// Add content (supports notes, social media, and websites)
contentRouter.post('/', userMiddleware, async (req, res) => {
    try {
        const { title, content, type, tags = [], dueDate, isCompleted = false, link } = req.body;
        
        if (!req.userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        
        
        const newContent: any = {
            type,
            userId: req.userId,
            tags,
            createdAt: new Date(),
            updatedAt: new Date(),
            processingStatus: 'pending'
        };

        if (type === "note") {
            const encodedContent = `data:text/plain;charset=utf-8,${encodeURIComponent(content || "")}`;
            newContent.link = encodedContent;
            newContent.title = title || 'Note';
            if (dueDate) newContent.dueDate = dueDate;
            newContent.isCompleted = isCompleted;
        } else if (link) {
            newContent.link = link;
        }

        // Create content first
        const createdContent = await ContentModel.create(newContent);

        // Process content asynchronously for URLs (website/twitter/youtube) or notes
        if ((type === 'website' || type === 'twitter' || type === 'youtube') && link) {
            processWebsiteContent(createdContent._id.toString(), link, req.userId);
        } else if (content && type === 'note') {
            processNoteContent(createdContent._id.toString(), content, req.userId);
        }
        
        res.status(201).json({
            message: `${type === 'note' ? 'Note' : 'Content'} created successfully`,
            content: createdContent
        });
    } catch (error) {
        console.error('Error creating content:', error);
        res.status(500).json({ 
            message: `Failed to create ${req.body.type === 'note' ? 'note' : 'content'}` 
        });
    }
});

// Reprocess existing URL contents to backfill AI fields and metadata
contentRouter.post('/reprocess', userMiddleware, async (req, res) => {
    try {
        const force = Boolean(req.body?.force);
        const filter: any = {
            userId: req.userId,
            type: { $in: ['website', 'twitter', 'youtube', 'note'] },
            link: { $exists: true, $ne: null }
        };

        if (!force) {
            filter.$or = [
                { embedding: { $exists: false } },
                { embedding: { $eq: null } },
                { summary: { $exists: false } },
                { summary: { $eq: null } },
                { 'websiteMetadata.description': { $exists: false } },
            ];
        }

        const items = await ContentModel.find(filter);
        let queued = 0;
        for (const it of items) {
            if (it.type === 'note') {
                // Decode content from data URL if needed (mirrors summary route logic)
                let rawText = (it as any).content || '';
                if (!rawText && it.link && typeof it.link === 'string' && it.link.startsWith('data:text')) {
                    try {
                        const encoded = it.link.split(',')[1] || '';
                        rawText = decodeURIComponent(encoded);
                    } catch {}
                }
                if (rawText && rawText.trim().length > 0) {
                    processNoteContent(String(it._id), rawText, String(req.userId));
                    queued++;
                }
            } else if (it.link) {
                processWebsiteContent(String(it._id), String(it.link), String(req.userId));
                queued++;
            }
        }
        res.json({ message: 'Reprocess enqueued', queued });
    } catch (error) {
        console.error('Error reprocessing content:', error);
        res.status(500).json({ message: 'Failed to reprocess content' });
    }
});

// Bookmark website
contentRouter.post('/bookmark', userMiddleware, async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            res.status(400).json({ message: 'URL is required' });
            return;
        }

        if (!req.userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }

        // Validate URL
        if (!await WebsiteService.validateUrl(url)) {
            res.status(400).json({ message: 'Invalid URL' });
            return;
        }

        // Extract website metadata
        const metadata = await WebsiteService.extractMetadata(url);
        
        const newContent = {
            link: url,
            type: 'website',
            userId: req.userId,
            tags: [],
            websiteMetadata: {
                description: metadata.description,
                favicon: metadata.favicon,
                domain: metadata.domain,
                screenshot: metadata.screenshot
            },
            processingStatus: 'processing',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const createdContent = await ContentModel.create(newContent);

        // Process content with AI
        processWebsiteContent(createdContent._id.toString(), url, req.userId);

        res.status(201).json({
            message: 'Website bookmarked successfully',
            content: createdContent
        });
    } catch (error) {
        console.error('Error bookmarking website:', error);
        res.status(500).json({ message: 'Failed to bookmark website' });
    }
});

// AI-powered search that answers questions about your content
contentRouter.get('/ai-search', userMiddleware, async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!req.userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        
        if (!query || typeof query !== 'string') {
            res.status(400).json({ message: 'Query is required' });
            return;
        }
        
        const userId = req.userId;
        
        // Get relevant content based on the query (limit to 10 for better AI focus)
        const searchResults = await VectorSearchService.searchContent(query, userId, 10);
        const relevantContent = searchResults.map(r => r.content);
        
        // If no relevant content found, get recent content
        let fallbackContent: any[] = [];
        if (relevantContent.length === 0) {
            fallbackContent = await ContentModel.find({ userId })
                .sort({ createdAt: -1 })
                .limit(10);
        }
        
        // Generate AI response
        const aiResponse = await AIService.generateSearchResponse(query, relevantContent, fallbackContent);
        
                        res.json({ 
            response: aiResponse,
            relevantContent: relevantContent.slice(0, 1), // Show only the most relevant item
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in AI search:', error);
        res.status(500).json({ message: 'AI search failed' });
    }
});

// Search content (vector + text search)
contentRouter.get('/search', userMiddleware, async (req, res) => {
    try {
        const { query, type, tags, limit = 10 } = req.query;
        // Treat missing/"all" as unlimited (bounded for safety)
        const lim = (typeof limit === 'string' && limit !== 'all') ? parseInt(limit as string) : 1000;
        
        if (!req.userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        
        const userId = req.userId;

        let results: any[] = [];

        if (query && typeof query === 'string') {
            // Vector search
            const opts: any = {};
            if (type && typeof type === 'string') opts.type = type;
            if (tags && typeof tags === 'string') opts.tags = tags.split(',').map(t => t.trim());
            const searchResults = await VectorSearchService.searchContent(
                query,
                userId,
                lim,
                opts
            );
            results = searchResults.map(r => r.content);
        } else if (tags && typeof tags === 'string') {
            // Tag search
            const tagArray = tags.split(',').map(t => t.trim());
            results = await VectorSearchService.searchByTags(tagArray, userId, lim);
        } else if (type && typeof type === 'string') {
            // Type search
            results = await VectorSearchService.searchByType(type, userId, lim);
        } else {
            // Get all content
            results = await ContentModel.find({ userId }).sort({ createdAt: -1 }).limit(lim);
        }

        res.json({ content: results });
    } catch (error) {
        console.error('Error searching content:', error);
        res.status(500).json({ message: 'Search failed' });
    }
});

// Get similar content
contentRouter.get('/similar/:id', userMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!req.userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        
        const userId = req.userId;
        const limit = parseInt(req.query.limit as string) || 5;

        const similarContent = await VectorSearchService.getSimilarContent(id, userId, limit);
        
        res.json({ 
            similarContent: similarContent.map(r => r.content),
            similarities: similarContent.map(r => r.similarity)
        });
    } catch (error) {
        console.error('Error getting similar content:', error);
        res.status(500).json({ message: 'Failed to get similar content' });
    }
});

// Generate or fetch AI summary/keywords for a content item
contentRouter.get('/:id/summary', userMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const force = (req.query.force as string) === 'true';

        const existing = await ContentModel.findOne({ _id: id, userId: req.userId });
        if (!existing) {
            res.status(404).json({ message: 'Content not found' });
            return;
        }

        if (!force && (existing as any).summary && Array.isArray((existing as any).keywords)) {
            res.json({ summary: (existing as any).summary, keywords: (existing as any).keywords });
            return;
        }

        let rawText = '';
        if (existing.type === 'note') {
            rawText = ((existing as any).content as string) || '';
            if (!rawText && existing.link && typeof existing.link === 'string' && existing.link.startsWith('data:text')) {
                try {
                    const encoded = existing.link.split(',')[1] || '';
                    rawText = decodeURIComponent(encoded);
                } catch {}
            }
        } else if (existing.link && typeof existing.link === 'string') {
            const meta = await WebsiteService.extractMetadata(existing.link);
            rawText = meta.content || meta.description || '';
        }

        if (!rawText || rawText.trim().length === 0) {
            res.status(400).json({ message: 'No content text available to summarize' });
            return;
        }

        const ai = await AIService.processContent(rawText);
        await ContentModel.updateOne(
            { _id: id },
            { summary: ai.summary, keywords: ai.keywords, embedding: ai.embedding, updatedAt: new Date() }
        );

        res.json({ summary: ai.summary, keywords: ai.keywords });
    } catch (error) {
        console.error('Error generating summary for content:', error);
        res.status(500).json({ message: 'Failed to generate summary' });
    }
});

// get content
contentRouter.get('/', userMiddleware, async (req, res) => {
    const userId = req.userId;
    const content = await ContentModel.find({
        userId: userId
    }).populate("userId", "username")
    res.json({
        content
    })
})

// delete content
contentRouter.delete('/', userMiddleware, async (req, res) => {
    try {
        const contentId = req.body.contentId;
        const userId = req.userId;

        const result = await ContentModel.deleteOne({
            _id: contentId,
            userId: userId,
        });

        if (result.deletedCount === 0) {
             res.status(404).json({ message: "Content not found or not authorized" });
             return
        }

        res.json({ message: "Content deleted successfully" });
    } catch (err) {
        console.error("Error deleting content:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

// delete content all 
contentRouter.delete('/all', userMiddleware, async (req, res) => {
    await ContentModel.deleteMany({
        userId: req.userId,
    })
    res.json({
        message: "All content deleted"
    })
})

contentRouter.put("/:id", userMiddleware, async (req, res) => {
    const contentId = req.params.id;
    const existing = await ContentModel.findOne({ _id: contentId, userId: req.userId });

    if (!existing) {
         res.status(404).json({ message: "Content not found" });
         return
    }

    const { title, tags, type, link, content: bodyContent, dueDate, isCompleted } = req.body as any;

    // Track whether AI fields should be refreshed
    let shouldReprocess = false;

    if (tags !== undefined) existing.tags = tags;
    if (type !== undefined) { existing.type = type; shouldReprocess = true; }

    if (existing.type === 'note') {
        if (title !== undefined) {
            (existing as any).title = title;
            shouldReprocess = true;
        }
        if (bodyContent !== undefined) {
            const encoded = `data:text/plain;charset=utf-8,${encodeURIComponent(bodyContent || "")}`;
            existing.link = encoded;
            (existing as any).content = bodyContent;
            shouldReprocess = true;
        }
        if (dueDate !== undefined) (existing as any).dueDate = dueDate;
        if (isCompleted !== undefined) (existing as any).isCompleted = !!isCompleted;
    } else {
        if (link !== undefined) { existing.link = link; shouldReprocess = true; }
    }

    existing.updatedAt = new Date();
    await existing.save();

    // Kick off async reprocessing if content changed or embedding missing
    try {
        if (shouldReprocess || !(existing as any).embedding || ((existing as any).embedding as any[])?.length === 0) {
            if (existing.type === 'note') {
                let rawText = (existing as any).content || '';
                if (!rawText && existing.link && typeof existing.link === 'string' && existing.link.startsWith('data:text')) {
                    try {
                        const encoded = existing.link.split(',')[1] || '';
                        rawText = decodeURIComponent(encoded);
                    } catch {}
                }
                if (!rawText || rawText.trim().length === 0) {
                    rawText = '';
                }
                if (rawText.trim().length > 0) {
                    processNoteContent(contentId, rawText, String(req.userId));
                }
            } else if (existing.link) {
                processWebsiteContent(contentId, String(existing.link), String(req.userId));
            }
        }
    } catch (err) {
        console.warn('Reprocess after update failed:', err);
    }

    res.json({ message: "Content updated", content: existing });
});

// Helper functions for async processing
async function processWebsiteContent(contentId: string, url: string, userId: string) {
    try {
        // Update status to processing
        await ContentModel.updateOne(
            { _id: contentId },
            { processingStatus: 'processing' }
        );

        // Extract website content
        const metadata = await WebsiteService.extractMetadata(url);
        
        // Process with AI
        // Choose best available text for embedding: content -> description -> domain
        const baseText = (metadata.content && metadata.content.trim().length > 0)
            ? metadata.content
            : (metadata.description && metadata.description.trim().length > 0)
                ? metadata.description
                : (metadata.domain || '');

        const aiResult = await AIService.processContent(baseText);
        
        // Update content with AI results
        await ContentModel.updateOne(
            { _id: contentId },
            {
                summary: aiResult.summary,
                keywords: aiResult.keywords,
                embedding: aiResult.embedding,
                processingStatus: 'completed',
                updatedAt: new Date()
            }
        );
    } catch (error) {
        console.error('Error processing website content:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await ContentModel.updateOne(
            { _id: contentId },
            {
                processingStatus: 'failed',
                processingError: errorMessage,
                updatedAt: new Date()
            }
        );
    }
}

async function processNoteContent(contentId: string, content: string, userId: string) {
    try {
        // Update status to processing
        await ContentModel.updateOne(
            { _id: contentId },
            { processingStatus: 'processing' }
        );

        // Process with AI
        const aiResult = await AIService.processContent(content);
        
        // Update content with AI results
        await ContentModel.updateOne(
            { _id: contentId },
            {
                summary: aiResult.summary,
                keywords: aiResult.keywords,
                embedding: aiResult.embedding,
                processingStatus: 'completed',
                updatedAt: new Date()
            }
        );
    } catch (error) {
        console.error('Error processing note content:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await ContentModel.updateOne(
            { _id: contentId },
            {
                processingStatus: 'failed',
                processingError: errorMessage,
                updatedAt: new Date()
            }
        );
    }
}