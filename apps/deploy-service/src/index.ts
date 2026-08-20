import { createClient, commandOptions } from "redis";
import { copyFinalDist, downloadS3Folder } from "./aws";
import { buildProject } from "./utils";
const subscriber = createClient();
subscriber.connect();

const publisher = createClient();
publisher.connect();

async function main() {
    while(1) {
        const res = await subscriber.brPop(
            commandOptions({ isolated: true }),
            'build-queue',
            0
          );
        if(!res){
            continue;
        }
        const id = res.element;
        try {
            console.log(`Processing build for id: ${id}`);
            await downloadS3Folder(`output/${id}`);
            await buildProject(id);
            await copyFinalDist(id);
            await publisher.hSet("status", id, "deployed");
            console.log(`Deployment complete for id: ${id}`);
        } catch (error) {
            console.error(`Build failed for id: ${id}`, error);
            await publisher.hSet("status", id, "failed");
        }
    }
}
main();
