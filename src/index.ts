import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import healthRouter from './routes/health';
import generateIdeaRouter from './routes/generateIdea';
import validateRouter from './routes/validate';
import ideasRouter from './routes/ideas';
import leaderboardRouter from './routes/leaderboard';
import voteRouter from './routes/vote';
import shareRouter from './routes/share';
import webhookRouter from './routes/webhook';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/generate-idea', generateIdeaRouter);
app.use('/api/validate', validateRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/vote', voteRouter);
app.use('/api/share', shareRouter);
app.use('/api/webhook', webhookRouter);

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Nocaps API',
    version: '1.0.0',
    description: 'Live business idea validation platform',
    endpoints: [
      'GET /api/health',
      'GET /api/generate-idea',
      'POST /api/validate',
      'GET /api/ideas/:id',
      'GET /api/leaderboard',
      'POST /api/vote',
      'POST /api/share',
      'POST /api/webhook/meta-ads',
    ],
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Nocaps API running on port ${PORT}`);
  });
}

export default app;
