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
            title,
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
            if (dueDate) newContent.dueDate = dueDate;
            newContent.isCompleted = isCompleted;
        } else if (link) {
            newContent.link = link;
        }

        // Create content first
        const createdContent = await ContentModel.create(newContent);

        // Process content asynchronously if it's a website or has content
        if (type === 'website' && link) {
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
            title: metadata.title,
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

// Search content (vector + text search)
contentRouter.get('/search', userMiddleware, async (req, res) => {
    try {
        const { query, type, tags, limit = 10 } = req.query;
        
        if (!req.userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }
        
        const userId = req.userId;

        let results: any[] = [];

        if (query && typeof query === 'string') {
            // Vector search
            const searchResults = await VectorSearchService.searchContent(
                query, 
                userId, 
                parseInt(limit as string)
            );
            results = searchResults.map(r => r.content);
        } else if (tags && typeof tags === 'string') {
            // Tag search
            const tagArray = tags.split(',').map(t => t.trim());
            results = await VectorSearchService.searchByTags(tagArray, userId, parseInt(limit as string));
        } else if (type && typeof type === 'string') {
            // Type search
            results = await VectorSearchService.searchByType(type, userId, parseInt(limit as string));
        } else {
            // Get all content
            results = await ContentModel.find({ userId }).sort({ createdAt: -1 }).limit(parseInt(limit as string));
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
    const content = await ContentModel.findOne({ _id: contentId, userId: req.userId });

    if (!content) {
         res.status(404).json({ message: "Content not found" });
         return
    }

    const { title, tags, type } = req.body;

    if (title !== undefined) content.title = title;
    if (tags !== undefined) content.tags = tags;
    if (type !== undefined) content.type = type;

    await content.save();
    res.json({ message: "Content updated", content });
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
        const aiResult = await AIService.processContent(metadata.content);
        
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