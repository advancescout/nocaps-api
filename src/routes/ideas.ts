import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'That link doesn\u2019t look right. Double-check the URL and try again.' });
  }

  try {
    const [ideaResult, analysisResult, scoresResult] = await Promise.all([
      supabaseAdmin.from('ideas').select('*').eq('id', id).single(),
      supabaseAdmin
        .from('analysis_results')
        .select('*')
        .eq('idea_id', id)
        .order('step_number', { ascending: true }),
      supabaseAdmin.from('idea_scores').select('*').eq('idea_id', id).single(),
    ]);

    if (ideaResult.error || !ideaResult.data) {
      return res.status(404).json({ error: 'We couldn\u2019t find that analysis. It may have expired or never completed.' });
    }

    const idea = ideaResult.data;
    const analysisResults = analysisResult.data || [];
    const scores = scoresResult.data || null;

    // Determine status
    const completedSteps = analysisResults.filter(
      (r: { completed_at: string | null }) => r.completed_at
    ).length;
    const status = completedSteps > 0 ? 'complete' : 'processing';

    return res.json({
      idea: {
        id: idea.id,
        businessIdea: idea.business_idea,
        targetDemographic: idea.target_demographic,
        founderHasFieldExperience: idea.founder_has_field_experience,
        founderYearsInField: idea.founder_years_in_field,
        founderExpertise: idea.founder_expertise,
        founderHasShippedBefore: idea.founder_has_shipped_before,
        founderExperience: idea.founder_experience,
        submittedAt: idea.submitted_at,
        createdAt: idea.created_at,
      },
      analysisResults: analysisResults.map((r: Record<string, unknown>) => ({
        id: r.id,
        stepNumber: r.step_number,
        stepName: r.step_name,
        response: r.response,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        durationMs: r.duration_ms,
        tokensUsed: r.tokens_used,
      })),
      scores: scores
        ? {
            domainExpertiseScore: scores.domain_expertise_score,
            executionHistoryScore: scores.execution_history_score,
            founderCredibility: scores.founder_credibility,
            marketScore: scores.market_score,
            competitiveScore: scores.competitive_score,
            redditValidation: scores.reddit_validation,
            internalScore: scores.internal_score,
            metaAdsConversions: scores.meta_ads_conversions,
            metaAdsSpend: scores.meta_ads_spend,
            metaAdsCpc: scores.meta_ads_cpc,
            upvotes: scores.upvotes,
            downvotes: scores.downvotes,
            shares: scores.shares,
            leaderboardScore: scores.leaderboard_score,
            leaderboardRank: scores.leaderboard_rank,
            lastUpdated: scores.last_updated,
          }
        : null,
      status,
    });
  } catch (err) {
    console.error('Get idea error:', err);
    return res.status(500).json({ error: 'We hit a snag loading your results. Try again in a few seconds.' });
  }
});

export default router;
