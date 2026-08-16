import express, { Application } from 'express';
import cors from 'cors';
import { router } from './routes/v1/index';

const app: Application = express();

// Enable CORS for all routes and origins
app.use(cors());

app.use(express.json());

app.use("/api/v1", router);

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
