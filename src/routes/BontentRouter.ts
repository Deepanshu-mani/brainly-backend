import { userMiddleware } from "../middleware/authMiddleware";
import { ContentModel } from "../config/db";
import { Router } from "express";


export const contentRouter = Router();


//add content
contentRouter.post('/', userMiddleware, (req, res) => {
    const link = req.body.link;
    const type = req.body.type;
    const title = req.body.title;
    ContentModel.create({
        link,
        title,
        type,
        userId: req.userId,
        tags: [],
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

    const contentId = req.body.contentId;
    await ContentModel.deleteMany({
        _id: contentId,
        userId: req.userId,
    })
    res.json({
        message: "Content deleted"
    })


})

// delete content all 
contentRouter.delete('/all', userMiddleware, async (req, res) => {

    await ContentModel.deleteMany({

        userId: req.userId,
    })
    res.json({
        message: "All content deleted"
    })


})
