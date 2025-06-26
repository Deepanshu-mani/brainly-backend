
import express, { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { ContentModel, LinkModel, UserModel } from './db';
import bcrypt from 'bcrypt';
import { userMiddleware } from './middleware';
import { random } from './utils';
import cors from 'cors';
config();

const app = express();
app.use(express.json());

app.use(cors({
    origin : "*",
}));

//db connection
async function main() {

    const MongoUrl = process.env.MONGODB_URL;
    if (!MongoUrl) {
        throw new Error("MONGODB_URL is not defined");
    }
    await mongoose.connect(MongoUrl);
    console.log("DB connected successfully");
    app.listen(process.env.PORT, () => {
        console.log(`http://localhost:${process.env.PORT}`)
    })
}
main();


app.get('/', (req, res) => {
    res.send("Server is up and Running");
})

// schema
const SignUpSchema = z.object({
    username: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
});
// Sign up 
app.post('/api/v1/signup', async (req: Request, res: Response) => {
    try {
        const { username, email, password } = SignUpSchema.parse(req.body);

        const existing = await UserModel.findOne({
            email: email
        });
        if (existing) {
            res.status(400).json({
                message: "User already exists with this email"
            });
            return;
        }


        const hashedPassword = await bcrypt.hash(password, 10);

        await UserModel.create({
            username: username,
            email: email,
            password: hashedPassword,
        });
        res.status(200).json({
            message: "Sign Up successfully",
            username,
            email,
        })
    } catch (e) {
        res.status(411).json({
            message: "Error processing sign up",
            error: e
        })
    }
})

// sign in
app.post('/api/v1/signin', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email });

        if (!user) {
            res.status(403).json({ message: "User not found" });
            return;
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            res.status(403).json({ message: "Invalid password" });
            return;
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!);
        res.status(200).json({
            message: "Signin successful",
            token
        });
    } catch (e) {
        res.status(500).json({
            message: "Error processing sign in",
            error: e
        })
    }
});

//add content
app.post('/api/v1/content', userMiddleware, (req, res) => {
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
app.get('/api/v1/content', userMiddleware, async (req, res) => {
    const userId = req.userId;
    const content = await ContentModel.find({
        userId: userId
    }).populate("userId", "username")
    res.json({
        content
    })

})

// delete content
app.delete('/api/v1/content', userMiddleware, async (req, res) => {

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
app.delete('/api/v1/content/all', userMiddleware, async (req, res) => {

    await ContentModel.deleteMany({

        userId: req.userId,
    })
    res.json({
        message: "All content deleted"
    })


})

//sharing link
app.post('/api/v1/brain/share', userMiddleware, async (req, res) => {
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
app.get('/api/v1/brain/:shareLink', async (req, res) => {
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
