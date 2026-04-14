import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Try reddit_ideas (active) first, then prebuilt_ideas as fallback
    for (const table of ['reddit_ideas', 'prebuilt_ideas']) {
      const filter = table === 'reddit_ideas'
        ? supabaseAdmin.from(table).select('*', { count: 'exact', head: true }).eq('is_active', true)
        : supabaseAdmin.from(table).select('*', { count: 'exact', head: true });

      const { count } = await filter;
      if (!count || count === 0) continue;

      const randomOffset = Math.floor(Math.random() * count);

      const query = table === 'reddit_ideas'
        ? supabaseAdmin.from(table).select('*').eq('is_active', true).range(randomOffset, randomOffset)
        : supabaseAdmin.from(table).select('*').range(randomOffset, randomOffset);

      const { data, error } = await query;
      if (error || !data || data.length === 0) continue;

      const idea = data[0];

      // Return enriched data for reddit_ideas, standard for prebuilt
      if (table === 'reddit_ideas') {
        return res.json({
          id: idea.id,
          businessIdea: idea.business_idea,
          targetDemographic: idea.target_demographic,
          opportunitySizeLabel: idea.opportunity_size_label ?? idea.opportunity_size ?? null,
          freshnessLabel: idea.freshness_label ?? null,
          // Reddit-specific fields
          sourceSubreddit: idea.source_subreddit ?? null,
          sourceUpvotes: idea.source_upvotes ?? null,
          sourceComments: idea.source_comments ?? null,
          validationReason: idea.validation_reason ?? null,
          sourceTitle: idea.source_title ?? null,
        });
      }

      return res.json({
        id: idea.id,
        businessIdea: idea.business_idea,
        targetDemographic: idea.target_demographic,
        opportunitySizeLabel: idea.opportunity_size_label ?? idea.opportunity_size ?? null,
        freshnessLabel: idea.freshness_label ?? idea.freshness ?? null,
      });
    }

    // Both tables empty
    return res.json({ empty: true });
  } catch (err) {
    console.error('Generate idea error:', err);
    return res.status(500).json({ error: 'We couldn\u2019t pull an idea right now. Hit spin again.' });
  }
});

export default router;
