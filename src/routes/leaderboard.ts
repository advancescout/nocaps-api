import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const { data, error, count } = await supabaseAdmin
      .from('idea_scores')
      .select(
        `
        *,
        ideas!inner(
          id,
          business_idea,
          target_demographic,
          submitted_at
        )
      `,
        { count: 'exact' }
      )
      .order('leaderboard_score', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Leaderboard error:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Update ranks
    const items = (data || []).map((item: Record<string, unknown>, index: number) => {
      const idea = item.ideas as Record<string, unknown>;
      return {
        rank: offset + index + 1,
        ideaId: (idea as Record<string, unknown>).id,
        businessIdea: (idea as Record<string, unknown>).business_idea,
        targetDemographic: (idea as Record<string, unknown>).target_demographic,
        submittedAt: (idea as Record<string, unknown>).submitted_at,
        scores: {
          leaderboardScore: item.leaderboard_score,
          upvotes: item.upvotes,
          downvotes: item.downvotes,
          shares: item.shares,
          metaAdsConversions: item.meta_ads_conversions,
          founderCredibility: item.founder_credibility,
        },
      };
    });

    return res.json({
      items,
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
