import path from "path";
import { Router } from "express";
import simpleGit from "simple-git";
import { generateId } from "../../utils/generate";
import { getAllFiles } from "../../utils/file";
import { uploadFile } from "../../utils/aws";
export const router = Router();

router.post("/deploy", async (req, res) => {
    const url = req.body.url;
    const userid = req.body.id;
    const id = generateId(); 
    if(!url){
        res.status(400).json({ message: "URL is required" });
    }
    await simpleGit().clone(url,`dist/output/${id}`);
    const files = getAllFiles(path.join(__dirname, `dist/output/${id}`));

    files.forEach(async file => {
        await uploadFile(file.slice(__dirname.length + 1), file);
    })
    res.status(200).json({
        id:id,
        message:`Deployment started for ${url} with user id ${userid}`
    });
});


