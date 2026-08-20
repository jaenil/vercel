import express from "express";
import { S3 } from "aws-sdk";
import { createClient } from "redis";
import * as dotenv from "dotenv";
dotenv.config();

const s3 = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "ap-south-1"
})

const redis = createClient();
redis.connect();

const BUCKET_NAME = process.env.BUCKET_NAME || "vercel";

const app = express();

function getMimeType(filePath: string): string {
    if (filePath.endsWith(".html")) return "text/html";
    if (filePath.endsWith(".css"))  return "text/css";
    if (filePath.endsWith(".js"))   return "application/javascript";
    if (filePath.endsWith(".json")) return "application/json";
    if (filePath.endsWith(".png"))  return "image/png";
    if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
    if (filePath.endsWith(".svg"))  return "image/svg+xml";
    if (filePath.endsWith(".ico"))  return "image/x-icon";
    if (filePath.endsWith(".woff")) return "font/woff";
    if (filePath.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
}

app.use(async (req, res) => {
    // "myportfolio.jaenil.dev" → name = "myportfolio"
    const name = req.hostname.split(".")[0];

    // Resolve name → id via Redis
    const id = await redis.hGet("name-to-id", name);
    if (!id) { res.status(404).send("Deployment not found"); return; }

    // Default to index.html for root and extensionless paths (SPA support)
    let filePath = req.path;
    if (filePath === "/" || !filePath.includes(".")) filePath = "/index.html";

    try {
        const contents = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: `dist/${id}${filePath}`
        }).promise();
        
        res.set("Content-Type", getMimeType(filePath));
        res.send(contents.Body);
    } catch (err: any) {
        if (err.code === "NoSuchKey") {
            try {
                const index = await s3.getObject({
                    Bucket: BUCKET_NAME,
                    Key: `dist/${id}/index.html`,
                }).promise();
                res.set("Content-Type", "text/html");
                res.send(index.Body);
            } catch { res.status(404).send("Not found"); }
        } else {
            console.error(err);
            res.status(500).send("Internal server error");
        }
    }
})

app.listen(3001);