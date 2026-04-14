import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

// Track in-flight inline scrape to avoid concurrent triggers
let inlineScrapeRunning = false;

async function triggerInlineScrape(): Promise<void> {
  if (inlineScrapeRunning) return;
  inlineScrapeRunning = true;

  try {
    // Fire-and-forget internal call to the cron scrape endpoint
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3001';
    const cronSecret = process.env.CRON_SECRET;

    fetch(`${baseUrl}/api/cron/scrape-reddit`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    }).catch((err) => {
      console.error('[Inline scrape] trigger failed:', err);
    }).finally(() => {
      inlineScrapeRunning = false;
    });
  } catch {
    inlineScrapeRunning = false;
  }
}

function formatRedditIdea(idea: Record<string, unknown>) {
  return {
    id: idea.id,
    businessIdea: idea.business_idea,
    targetDemographic: idea.target_demographic,
    opportunitySizeLabel: idea.opportunity_size_label ?? idea.opportunity_size ?? null,
    freshnessLabel: idea.freshness_label ?? null,
    sourceSubreddit: idea.source_subreddit ?? null,
    sourceUpvotes: idea.source_upvotes ?? null,
    sourceComments: idea.source_comments ?? null,
    validationReason: idea.validation_reason ?? null,
    sourceTitle: idea.source_title ?? null,
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Count active reddit_ideas
    const { count: activeCount } = await supabaseAdmin
      .from('reddit_ideas')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // If <5 active ideas, trigger inline scrape (fire-and-forget)
    if (!activeCount || activeCount < 5) {
      triggerInlineScrape();
    }

    // Serve from reddit_ideas if any exist
    if (activeCount && activeCount > 0) {
      const randomOffset = Math.floor(Math.random() * activeCount);
      const { data, error } = await supabaseAdmin
        .from('reddit_ideas')
        .select('*')
        .eq('is_active', true)
        .range(randomOffset, randomOffset);

      if (!error && data && data.length > 0) {
        return res.json(formatRedditIdea(data[0]));
      }
    }

    // Graceful degradation: serve most recently scraped ideas even if inactive
    const { data: recentIdeas } = await supabaseAdmin
      .from('reddit_ideas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentIdeas && recentIdeas.length > 0) {
      const randomIdx = Math.floor(Math.random() * recentIdeas.length);
      return res.json(formatRedditIdea(recentIdeas[randomIdx]));
    }

    // No reddit_ideas at all — return empty (never serve fake static list)
    return res.json({ empty: true });
  } catch (err) {
    console.error('Generate idea error:', err);
    return res.status(500).json({ error: 'We couldn\u2019t pull an idea right now. Hit spin again.' });
  }
});

export default router;
