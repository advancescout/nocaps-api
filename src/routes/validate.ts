import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { runAnalysis } from '../lib/analysis';

const router = Router();

// In-memory rate limiting (1 per IP per hour)
const rateLimitMap = new Map<string, number>();

function isRateLimited(ip: string): boolean {
  const lastRequest = rateLimitMap.get(ip);
  if (!lastRequest) return false;
  const hourInMs = 60 * 60 * 1000;
  return Date.now() - lastRequest < hourInMs;
}

router.post('/', async (req: Request, res: Response) => {
  const userIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  // Rate limit check (bypass with BYPASS_RATE_LIMIT=true for dev/testing)
  if (process.env.BYPASS_RATE_LIMIT !== 'true' && isRateLimited(userIp)) {
    return res.status(429).json({
      error: 'You\u2019ve already submitted recently. Give it an hour and try again.',
    });
  }

  const {
    businessIdea,
    targetDemographic,
    founderHasFieldExperience,
    founderYearsInField,
    founderExpertise,
    founderHasShippedBefore,
    founderExperience,
  } = req.body;

  // Validation — user-friendly messages, no internal field names
  if (!businessIdea || typeof businessIdea !== 'string') {
    return res.status(400).json({ error: 'Please describe your business idea.' });
  }
  if (!targetDemographic || typeof targetDemographic !== 'string') {
    return res.status(400).json({ error: 'Please tell us who your target audience is.' });
  }
  if (typeof founderHasFieldExperience !== 'boolean') {
    return res.status(400).json({ error: 'Please let us know about your field experience.' });
  }
  if (typeof founderHasShippedBefore !== 'boolean') {
    return res.status(400).json({ error: 'Please let us know about your startup experience.' });
  }
  if (!founderExperience || typeof founderExperience !== 'string') {
    return res.status(400).json({ error: 'Please share a bit about your background.' });
  }

  const validExpertise = ['novice', 'intermediate', 'expert', 'thought_leader'];
  if (founderExpertise && !validExpertise.includes(founderExpertise)) {
    return res.status(400).json({ error: 'Please select a valid expertise level.' });
  }

  try {
    const { data: idea, error } = await supabaseAdmin
      .from('ideas')
      .insert({
        business_idea: businessIdea,
        target_demographic: targetDemographic,
        founder_has_field_experience: founderHasFieldExperience,
        founder_years_in_field: founderYearsInField ?? null,
        founder_expertise: founderExpertise ?? null,
        founder_has_shipped_before: founderHasShippedBefore,
        founder_experience: founderExperience,
        user_ip: userIp,
      })
      .select()
      .single();

    if (error || !idea) {
      console.error('Insert error:', error);
      return res.status(500).json({ error: 'We couldn\u2019t save your idea. Please try again in a moment.' });
    }

    // Set rate limit
    rateLimitMap.set(userIp, Date.now());

    // Start async analysis (fire and forget)
    setImmediate(() => {
      runAnalysis(idea.id).catch(err =>
        console.error('Analysis error for idea', idea.id, err)
      );
    });

    return res.status(202).json({
      ideaId: idea.id,
      status: 'processing',
    });
  } catch (err) {
    console.error('Validate error:', err);
    return res.status(500).json({ error: 'Something went wrong on our end. Your idea is safe \u2014 try again shortly.' });
  }
});

export default router;
