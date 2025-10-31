import express from 'express';
import { getQueue } from '../queue.js';

const router = express.Router();

// Get queue stats
router.get('/stats', async (req, res, next) => {
  try {
    const queue = await getQueue();
    const queueSize = await queue.getQueueSize();

    res.json({
      queueSize,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
