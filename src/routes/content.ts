import { userMiddleware } from "../middleware/authMiddleware";
import { ContentModel } from "../config/db";
import { Router } from "express";


export const contentRouter = Router();


//add content
contentRouter.post('/', userMiddleware, (req, res) => {
    const link = req.body.link;
    const type = req.body.type;
    const title = req.body.title;
    const tags: string[] = req.body.tags;
    ContentModel.create({
        link,
        title,
        type,
        userId: req.userId,
        tags,
    })
    res.json({
        message: "content added"
    })
})

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