import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { Router ,Request, Response } from 'express';
import { UserModel } from '../config/db';
import bcrypt from 'bcrypt'
export const userRouter = Router();
// schema
const SignUpSchema = z.object({
    username: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
});

// Sign up 
userRouter.post('/signup', async (req: Request, res: Response) => {
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
userRouter.post('/signin', async (req: Request, res: Response) => {
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