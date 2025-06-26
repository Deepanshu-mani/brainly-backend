import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "dotenv";
config()
const JWT = process.env.JWT_SECRET;
export const userMiddleware = (req : Request ,res :Response ,  next : NextFunction) =>{
    const header = req.headers['authorization'];
    const decoded = jwt.verify(header as string, JWT!);
    if(decoded) {
        //@ts-ignore
        req.userId = decoded.id;
        next();
    }else {
        res.status(403).json({
            message: "You are not logged in"
        })
    }

}