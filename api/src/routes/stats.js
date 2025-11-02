import express from 'express';

const router = express.Router();

// Get OpenAI account stats
router.get('/openai', async (req, res, next) => {
  try {
    // OpenAI's billing API is only available via their legacy API
    // We need to use the /dashboard/billing/subscription endpoint
    const response = await fetch('https://api.openai.com/v1/dashboard/billing/subscription', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAI API returned ${response.status}`);
    }

    const subscription = await response.json();

    // Get usage data for current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const usageResponse = await fetch(
      `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate.toISOString().split('T')[0]}&end_date=${endDate.toISOString().split('T')[0]}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const usage = usageResponse.ok ? await usageResponse.json() : null;

    res.json({
      subscription,
      usage,
      credit_remaining: subscription.hard_limit_usd
        ? (subscription.hard_limit_usd - (usage?.total_usage || 0) / 100).toFixed(2)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
