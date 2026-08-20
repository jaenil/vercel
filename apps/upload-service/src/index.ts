import express from "express";
import cors from "cors";
import simpleGit from "simple-git";
import { generate } from "./utils";
import { getAllFiles } from "./file";
import path from "path";
import { uploadFile } from "./aws";
import { createClient } from "redis";

const publisher = createClient();
publisher.connect();

const subscriber = createClient();
subscriber.connect();

const app = express();
app.use(cors())
app.use(express.json());

app.post("/deploy", async (req, res) => {
    const repoUrl: string = req.body.repoUrl;
    const name:string = req.body.name;
    const id = generate(); // asd12 

    if (!name || !/^[a-z0-9-]{2,30}$/.test(name)) {
        res.status(400).json({ error: "Name must be 2-30 characters: lowercase letters, numbers, and hyphens only." });
        return;
    }
    const existing = await publisher.hGet("name-to-id", name);
    if (existing) {
        res.status(409).json({ error: `"${name}" is already taken. Please choose a different name.` });
        return;
    }

    try {
        // Reserves the name 
        await publisher.hSet("name-to-id", name, id);
        await publisher.hSet("status", id, "uploading");
        
        await simpleGit().clone(repoUrl, path.join(__dirname, `output/${id}`));

        const files = getAllFiles(path.join(__dirname, `output/${id}`));

        await Promise.all(files.map(async file => {
            await uploadFile(file.slice(__dirname.length + 1), file);
        }));

        publisher.lPush("build-queue", id);
        publisher.hSet("status", id, "uploaded");

        res.json({
            id: id,
            name: name
        });
    } catch (error: any) {
        console.error("Deploy error:", error);
        // Clean up reserved name on failure so user can retry
        await publisher.hDel("name-to-id", name);
        await publisher.hSet("status", id, "failed");
        res.status(500).json({ error: error.message || "Failed to process deployment" });
    }
});

app.get("/status", async (req, res) => {
    const id = req.query.id;
    const response = await subscriber.hGet("status", id as string);
    res.json({
        status: response
    })
})

app.listen(3000);