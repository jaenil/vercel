import path from "path";
import { Router } from "express";
import { createClient } from "redis";
import simpleGit from "simple-git";
import { generateId } from "../../utils/generate";
import { getAllFiles } from "../../utils/file";
import { uploadFile } from "../../utils/aws";

export const router = Router();

const publisher = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379"
});
publisher.on("error", (err) => console.error("Redis Publisher Error:", err));
publisher.connect().catch(console.error);

router.post("/deploy", async (req, res) => {
    const url = req.body.url;
    const userid = req.body.id;
    const id = generateId();
    if (!url || typeof url !== "string") {
        res.status(400).json({ message: "A valid repository URL is required" });
        return; // Stop further execution
    }
    
    const outputDir = path.resolve(process.cwd(), "output", id);
    await simpleGit().clone(url, outputDir);
    const files = getAllFiles(outputDir);

    // wait for all file uploads to complete in parallel
    await Promise.all(
        files.map(async (file) => {
            // Strip everything up to and including the project root so the key is:
            // output/{id}/src/App.jsx
            const s3Key = path.relative(process.cwd(), file).replace(/\\/g, "/");
            //   process.cwd() = .../upload_service/dist  (at runtime)
            //   file          = .../upload_service/dist/output/{id}/src/App.jsx
            //   s3Key         = output/{id}/src/App.jsx   ✓
            await uploadFile(s3Key, file);
        })
    );


    publisher.lPush("build-queue", id);

    res.status(200).json({
        id: id,
        message: `Deployment started for ${url} with user id ${userid}`
    });
});


