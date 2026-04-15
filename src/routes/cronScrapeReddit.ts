import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SUBREDDITS = [
  'mildlyinfuriating', 'freelance', 'smallbusiness', 'personalfinance',
  'ADHD', 'disability', 'landlord', 'renting', 'entrepreneur',
  'SideProject', 'startups', 'businessideas', 'founderopportunities',
];

const FRUSTRATION_KEYWORDS = [
  'frustrated', 'annoying', 'terrible', 'hate', 'worst', 'broken',
  'impossible', 'ridiculous', 'painful', 'nightmare', 'struggling',
  'wish there was', 'why is there no', 'someone should build',
  'there has to be a better way', 'sick of', 'fed up',
];

interface BraveResult {
  title: string;
  url: string;
  description: string;
  extra_snippets?: string[];
}

interface BraveSearchResponse {
  web?: {
    results?: BraveResult[];
  };
}

async function searchBrave(query: string): Promise<BraveResult[]> {
  if (!BRAVE_API_KEY) return [];

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    });
    if (!res.ok) {
      console.error(`Brave search error: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as BraveSearchResponse;
    return data.web?.results ?? [];
  } catch (err) {
    console.error('Brave search failed:', err);
    return [];
  }
}

function extractUpvotes(text: string): number {
  // Try to extract upvote count from title/snippet patterns like "2.4k upvotes" or "(1234 points)"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*k\s*(?:upvotes|points|up)/i,
    /(\d+)\s*(?:upvotes|points|up)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = parseFloat(m[1]);
      return text.toLowerCase().includes('k') && n < 100 ? n * 1000 : n;
    }
  }
  return 0;
}

function extractCommentCount(text: string): number {
  const m = text.match(/(\d+)\s*comments/i);
  return m ? parseInt(m[1], 10) : 0;
}

function hasFrustrationSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return FRUSTRATION_KEYWORDS.some(kw => lower.includes(kw));
}

function extractSubreddit(url: string): string {
  const m = url.match(/reddit\.com\/r\/(\w+)/i);
  return m ? `r/${m[1]}` : 'r/unknown';
}

interface ScrapedThread {
  title: string;
  url: string;
  subreddit: string;
  upvoteCount: number;
  commentCount: number;
  topSnippets: string[];
}

async function scrapeSubreddit(subreddit: string): Promise<ScrapedThread[]> {
  const queries = [
    `site:reddit.com/r/${subreddit} frustrat OR annoying OR "wish there was" OR "someone should build"`,
    `site:reddit.com/r/${subreddit} struggling OR "better way" OR "sick of" OR hate`,
  ];

  const threads: ScrapedThread[] = [];

  for (const query of queries) {
    const results = await searchBrave(query);
    for (const r of results) {
      const fullText = `${r.title} ${r.description} ${(r.extra_snippets ?? []).join(' ')}`;
      const upvotes = extractUpvotes(fullText);
      const comments = extractCommentCount(fullText);

      // Signal filters: 100+ upvotes or frustration language with some engagement
      if (upvotes >= 100 || (hasFrustrationSignal(fullText) && (upvotes >= 20 || comments >= 10))) {
        threads.push({
          title: r.title,
          url: r.url,
          subreddit: extractSubreddit(r.url) || `r/${subreddit}`,
          upvoteCount: Math.max(upvotes, 50), // conservative estimate if not extractable
          commentCount: comments,
          topSnippets: [r.description, ...(r.extra_snippets ?? [])].slice(0, 5),
        });
      }
    }

    // Throttle between Brave API calls
    await new Promise(r => setTimeout(r, 500));
  }

  return threads;
}

async function synthesizeIdea(thread: ScrapedThread): Promise<{
  businessIdea: string;
  targetDemographic: string;
  opportunitySize: string;
  validationReason: string;
} | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const prompt = `Here is a Reddit thread from ${thread.subreddit} with ${thread.upvoteCount} upvotes and ${thread.commentCount} comments.
Title: ${thread.title}
Top comments: ${thread.topSnippets.join('\n')}

This thread describes a recurring problem. Based on the pain point expressed:
1. Write a clear, specific business idea that solves this problem (2 sentences max)
2. Define the target demographic (age, context, specific characteristics)
3. Rate the opportunity size: Small / Medium / Large / Huge
4. Write a one-line explanation of why this is a validated pain point (reference the upvote/comment data)

Respond as JSON: { "businessIdea": "...", "targetDemographic": "...", "opportunitySize": "...", "validationReason": "..." }`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.businessIdea || !parsed.targetDemographic) return null;

    return {
      businessIdea: parsed.businessIdea,
      targetDemographic: parsed.targetDemographic,
      opportunitySize: parsed.opportunitySize ?? 'Medium',
      validationReason: parsed.validationReason ?? '',
    };
  } catch (err) {
    console.error('Claude synthesis failed:', err);
    return null;
  }
}

// POST /api/cron/scrape-reddit — called by Vercel Cron at 03:00 UTC daily
router.get('/', async (req: Request, res: Response) => {
  // Verify cron authorization (Vercel sends this header)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Cron] Starting Reddit scrape...');

  try {
    // Step 1: Retire ideas older than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    await supabaseAdmin
      .from('reddit_ideas')
      .update({ is_active: false })
      .lt('created_at', ninetyDaysAgo.toISOString())
      .eq('is_active', true);

    // Step 2: Count active ideas
    const { count: activeCount } = await supabaseAdmin
      .from('reddit_ideas')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    console.log(`[Cron] Active ideas: ${activeCount ?? 0}`);

    // Step 3: Scrape subreddits
    const allThreads: ScrapedThread[] = [];
    for (const sub of SUBREDDITS) {
      try {
        const threads = await scrapeSubreddit(sub);
        allThreads.push(...threads);
        console.log(`[Cron] ${sub}: ${threads.length} threads found`);
      } catch (err) {
        console.error(`[Cron] Error scraping r/${sub}:`, err);
      }
    }

    console.log(`[Cron] Total threads scraped: ${allThreads.length}`);

    if (allThreads.length === 0) {
      console.log('[Cron] No threads found — keeping existing ideas.');
      return res.json({ status: 'ok', scraped: 0, synthesized: 0, active: activeCount ?? 0 });
    }

    // Step 4: Deduplicate against existing ideas by URL
    const { data: existingUrls } = await supabaseAdmin
      .from('reddit_ideas')
      .select('source_url');

    const urlSet = new Set((existingUrls ?? []).map((r: { source_url: string }) => r.source_url));
    const newThreads = allThreads.filter(t => !urlSet.has(t.url));

    console.log(`[Cron] New threads after dedup: ${newThreads.length}`);

    // Step 5: Synthesize ideas via Claude Haiku
    let synthesized = 0;
    for (const thread of newThreads.slice(0, 20)) { // Cap at 20 per run to limit API costs
      const idea = await synthesizeIdea(thread);
      if (!idea) continue;

      const { error: insertErr } = await supabaseAdmin
        .from('reddit_ideas')
        .insert({
          business_idea: idea.businessIdea,
          target_demographic: idea.targetDemographic,
          opportunity_size: idea.opportunitySize,
          opportunity_size_label: idea.opportunitySize,
          validation_reason: idea.validationReason,
          source_url: thread.url,
          source_subreddit: thread.subreddit,
          source_upvotes: thread.upvoteCount,
          source_comments: thread.commentCount,
          source_title: thread.title,
          is_active: true,
        });

      if (insertErr) {
        console.error('[Cron] Insert error:', insertErr.message);
      } else {
        synthesized++;
      }

      // Throttle between Haiku calls
      await new Promise(r => setTimeout(r, 300));
    }

    // Recount active
    const { count: finalCount } = await supabaseAdmin
      .from('reddit_ideas')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    console.log(`[Cron] Done. Synthesized: ${synthesized}, Active: ${finalCount ?? 0}`);

    return res.json({
      status: 'ok',
      scraped: allThreads.length,
      newThreads: newThreads.length,
      synthesized,
      active: finalCount ?? 0,
    });
  } catch (err) {
    console.error('[Cron] Scrape failed:', err);
    return res.status(500).json({ error: 'Scrape failed' });
  }
});

export default router;
