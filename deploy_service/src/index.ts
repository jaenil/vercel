import { createClient } from "redis";
import { downloadS3Folder } from "./utils/aws";

const subscriber = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379"
});

subscriber.on("error", (err) => console.error("Redis Subscriber Error:", err));

subscriber.connect().catch(err => {
    console.error("Failed to connect to Redis:", err);
    process.exit(1);
});

async function main() {
    console.log("Worker waiting for deployment jobs on 'build-queue'...");
    while (true) {
        try {
            // brPop blocks asynchronously until an item is pushed (0% idle CPU)
            const job = await subscriber.brPop("build-queue", 0);
            if (job && job.element) {
                const id = job.element;
                console.log(`Processing build job: ${id}`);
                await downloadS3Folder(`output/${id}`);
            }
        } catch (err) {
            console.error("Queue worker error:", err);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

main();
