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

function opportunityLabel(upvotes: number): string {
  if (upvotes >= 4000) return 'Huge';
  if (upvotes >= 2000) return 'Large';
  if (upvotes >= 800) return 'Medium';
  return 'Small';
}

function formatJoinedIdea(ri: Record<string, unknown>, idea: Record<string, unknown>) {
  const upvotes = (ri.upvotes as number) ?? 0;
  const comments = (ri.comment_count as number) ?? 0;
  return {
    id: ri.id,
    businessIdea: idea.business_idea,
    targetDemographic: idea.target_demographic,
    opportunitySizeLabel: opportunityLabel(upvotes),
    freshnessLabel: null,
    sourceSubreddit: ri.subreddit ?? null,
    sourceUpvotes: upvotes,
    sourceComments: comments,
    validationReason: `${upvotes.toLocaleString()} upvotes and ${comments} comments signal validated community demand.`,
    sourceTitle: ri.post_title ?? null,
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Count reddit_ideas rows
    const { count: totalCount } = await supabaseAdmin
      .from('reddit_ideas')
      .select('*', { count: 'exact', head: true });

    // If <5 ideas, trigger inline scrape (fire-and-forget)
    if (!totalCount || totalCount < 5) {
      triggerInlineScrape();
    }

    // Serve from reddit_ideas joined with ideas
    if (totalCount && totalCount > 0) {
      const randomOffset = Math.floor(Math.random() * totalCount);
      const { data, error } = await supabaseAdmin
        .from('reddit_ideas')
        .select('*, ideas(business_idea, target_demographic)')
        .range(randomOffset, randomOffset);

      if (!error && data && data.length > 0) {
        const row = data[0] as Record<string, unknown>;
        const idea = (row.ideas ?? {}) as Record<string, unknown>;
        return res.json(formatJoinedIdea(row, idea));
      }
    }

    // No reddit_ideas at all — return empty
    return res.json({ empty: true });
  } catch (err) {
    console.error('Generate idea error:', err);
    return res.status(500).json({ error: "We couldn't pull an idea right now. Hit spin again." });
  }
});

export default router;
