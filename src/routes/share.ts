import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const userIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const { ideaId, platform } = req.body;

  if (!ideaId) {
    return res.status(400).json({ error: 'Something went wrong recording your share.' });
  }
  if (!platform || !['twitter', 'linkedin', 'copy_link'].includes(platform)) {
    return res.status(400).json({ error: 'Something went wrong recording your share.' });
  }

  try {
    // Check idea exists
    const { data: idea, error: ideaError } = await supabaseAdmin
      .from('ideas')
      .select('id')
      .eq('id', ideaId)
      .single();

    if (ideaError || !idea) {
      return res.status(404).json({ error: 'We couldn\u2019t find that idea.' });
    }

    // Record share
    const { error: shareError } = await supabaseAdmin.from('shares').insert({
      idea_id: ideaId,
      platform,
      shared_by_ip: userIp,
      utm_source: req.body.utmSource || null,
    });

    if (shareError) {
      return res.status(500).json({ error: 'Share didn\u2019t record but your link still works.' });
    }

    // Update shares count in scores
    const { data: currentScores } = await supabaseAdmin
      .from('idea_scores')
      .select('shares, meta_ads_conversions, upvotes, downvotes, reddit_validation')
      .eq('idea_id', ideaId)
      .single();

    let newShares: number;
    if (!currentScores) {
      await supabaseAdmin.from('idea_scores').insert({
        idea_id: ideaId,
        shares: 1,
        leaderboard_score: 0.20,
      });
      newShares = 1;
    } else {
      newShares = currentScores.shares + 1;
      const netVotes = currentScores.upvotes - currentScores.downvotes;
      const leaderboardScore =
        currentScores.meta_ads_conversions * 0.40 +
        netVotes * 0.30 +
        newShares * 0.20 +
        currentScores.reddit_validation * 0.10;

      await supabaseAdmin
        .from('idea_scores')
        .update({
          shares: newShares,
          leaderboard_score: Math.max(0, leaderboardScore),
          last_updated: new Date().toISOString(),
        })
        .eq('idea_id', ideaId);
    }

    // Get total shares across all platforms
    const { count } = await supabaseAdmin
      .from('shares')
      .select('*', { count: 'exact', head: true })
      .eq('idea_id', ideaId);

    return res.json({
      success: true,
      shareCount: count || newShares,
    });
  } catch (err) {
    console.error('Share error:', err);
    return res.status(500).json({ error: 'Share didn\u2019t record but your link still works.' });
  }
});

export default router;
