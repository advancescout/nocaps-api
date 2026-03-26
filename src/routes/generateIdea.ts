import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Use a random offset for fast random selection
    const { count } = await supabaseAdmin
      .from('prebuilt_ideas')
      .select('*', { count: 'exact', head: true });

    if (!count || count === 0) {
      return res.status(404).json({ error: 'No ideas available' });
    }

    const randomOffset = Math.floor(Math.random() * count);

    const { data, error } = await supabaseAdmin
      .from('prebuilt_ideas')
      .select('*')
      .range(randomOffset, randomOffset);

    if (error || !data || data.length === 0) {
      return res.status(500).json({ error: 'Failed to fetch idea' });
    }

    const idea = data[0];
    return res.json({
      id: idea.id,
      businessIdea: idea.business_idea,
      targetDemographic: idea.target_demographic,
      opportunitySizeLabel: idea.opportunity_size_label,
      freshnessLabel: idea.freshness_label,
    });
  } catch (err) {
    console.error('Generate idea error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
