import express from 'express';

const router = express.Router();

// Get OpenAI account stats
router.get('/openai', async (req, res, next) => {
  try {
    // OpenAI's billing API is not accessible with standard API keys
    // Return a friendly message instead of throwing errors
    res.json({
      status: 'unavailable',
      message: 'Check OpenAI dashboard for credit balance',
      link: 'https://platform.openai.com/usage'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
