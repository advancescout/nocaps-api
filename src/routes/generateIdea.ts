import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Try prebuilt_ideas first, then reddit_ideas as fallback
    for (const table of ['prebuilt_ideas', 'reddit_ideas']) {
      const { count } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!count || count === 0) continue;

      const randomOffset = Math.floor(Math.random() * count);

      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .range(randomOffset, randomOffset);

      if (error || !data || data.length === 0) continue;

      const idea = data[0];
      return res.json({
        id: idea.id,
        businessIdea: idea.business_idea,
        targetDemographic: idea.target_demographic,
        opportunitySizeLabel: idea.opportunity_size_label ?? idea.opportunity_size ?? null,
        freshnessLabel: idea.freshness_label ?? idea.freshness ?? null,
      });
    }

    // Both tables empty — return handled response, not an error
    return res.json({ empty: true });
  } catch (err) {
    console.error('Generate idea error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
