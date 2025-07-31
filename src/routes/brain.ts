import { userMiddleware } from "../middleware/authMiddleware";
import { LinkModel, ContentModel, UserModel } from "../config/db";
import { random } from "../utils/random";
import { Router } from "express";

export const brainRouter = Router();

//sharing link
brainRouter.post('/share', userMiddleware, async (req, res) => {
    const share = req.body.share;
    if (share) {
        const existingLink = await LinkModel.findOne({
            userId : req.userId,
        })
        if(existingLink) {
            res.json({
                hash: existingLink.hash
            })
            return;
        }
        const hash = random(10)
        await LinkModel.create({
            userId: req.userId,
            hash: hash
        })
        res.json({
            message : "Link created",
            hash
        })
    } else {
        await LinkModel.deleteOne({
            userId: req.userId,
        })

        res.json({
            message: "Removed sharable link",
        })
    }
})



// access share link
brainRouter.get('/:shareLink', async (req, res) => {
    const hash = req.params.shareLink;

    const link = await LinkModel.findOne({
        hash
    })
    if (!link) {
        res.status(411).json({
            message: "Incorrect link"
        })
        return;
    }
    const content = await ContentModel.find({
        userId: link.userId
    })

    const user = await UserModel.findOne({
        _id: link.userId
    })

    if (!user) {
        res.status(411).json({
            message: "User not found, error should ideally not happen"
        })
        return;
    }
    res.json({
        username: user.username,
        content
    })

})
