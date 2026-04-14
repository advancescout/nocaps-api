import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const userIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const { ideaId, voteType } = req.body;

  if (!ideaId) {
    return res.status(400).json({ error: 'Something went wrong with your vote. Please refresh and try again.' });
  }
  if (!voteType || !['upvote', 'downvote'].includes(voteType)) {
    return res.status(400).json({ error: 'Something went wrong with your vote. Please refresh and try again.' });
  }

  try {
    // Check if idea exists
    const { data: idea, error: ideaError } = await supabaseAdmin
      .from('ideas')
      .select('id')
      .eq('id', ideaId)
      .single();

    if (ideaError || !idea) {
      return res.status(404).json({ error: 'We couldn\u2019t find that idea. It may have been removed.' });
    }

    // Check for existing vote from this IP
    const { data: existingVote } = await supabaseAdmin
      .from('votes')
      .select('id, vote_type')
      .eq('idea_id', ideaId)
      .eq('user_ip', userIp)
      .single();

    if (existingVote) {
      return res.status(409).json({ error: 'You\u2019ve already voted on this one.' });
    }

    // Insert vote
    const { error: voteError } = await supabaseAdmin.from('votes').insert({
      idea_id: ideaId,
      vote_type: voteType,
      user_ip: userIp,
    });

    if (voteError) {
      return res.status(500).json({ error: 'Vote didn\u2019t go through. Try again.' });
    }

    // Update scores
    const field = voteType === 'upvote' ? 'upvotes' : 'downvotes';

    const { data: currentScores } = await supabaseAdmin
      .from('idea_scores')
      .select('upvotes, downvotes, meta_ads_conversions, shares, reddit_validation')
      .eq('idea_id', ideaId)
      .single();

    if (!currentScores) {
      // Create scores record if it doesn't exist
      await supabaseAdmin.from('idea_scores').insert({
        idea_id: ideaId,
        [field]: 1,
        leaderboard_score: voteType === 'upvote' ? 0.30 : 0,
      });
    } else {
      const newUpvotes = currentScores.upvotes + (voteType === 'upvote' ? 1 : 0);
      const newDownvotes = currentScores.downvotes + (voteType === 'downvote' ? 1 : 0);
      const netVotes = newUpvotes - newDownvotes;
      const leaderboardScore =
        currentScores.meta_ads_conversions * 0.40 +
        netVotes * 0.30 +
        currentScores.shares * 0.20 +
        currentScores.reddit_validation * 0.10;

      await supabaseAdmin
        .from('idea_scores')
        .update({
          [field]: currentScores[field as keyof typeof currentScores] as number + 1,
          leaderboard_score: Math.max(0, leaderboardScore),
          last_updated: new Date().toISOString(),
        })
        .eq('idea_id', ideaId);
    }

    // Fetch updated scores
    const { data: updatedScores } = await supabaseAdmin
      .from('idea_scores')
      .select('upvotes, downvotes')
      .eq('idea_id', ideaId)
      .single();

    return res.json({
      success: true,
      newUpvotes: updatedScores?.upvotes || 0,
      newDownvotes: updatedScores?.downvotes || 0,
    });
  } catch (err) {
    console.error('Vote error:', err);
    return res.status(500).json({ error: 'Vote didn\u2019t go through. Try again.' });
  }
});

export default router;
