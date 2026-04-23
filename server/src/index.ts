import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import productsRouter from './routes/products';
import locationsRouter from './routes/locations';
import stockRouter from './routes/stock';
import scanInRouter from './routes/scanIn';
import scanOutRouter from './routes/scanOut';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/products', productsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/stock', stockRouter);
app.use('/api/scan-in', scanInRouter);
app.use('/api/scan-out', scanOutRouter);

app.listen(PORT, () => {
  console.log(`Scanner API running on port ${PORT}`);
});
