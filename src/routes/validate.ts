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

  // Rate limit check
  if (isRateLimited(userIp)) {
    return res.status(429).json({
      error: 'Rate limit exceeded. One submission per hour per IP.',
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

  // Validation
  if (!businessIdea || typeof businessIdea !== 'string') {
    return res.status(400).json({ error: 'businessIdea is required' });
  }
  if (!targetDemographic || typeof targetDemographic !== 'string') {
    return res.status(400).json({ error: 'targetDemographic is required' });
  }
  if (typeof founderHasFieldExperience !== 'boolean') {
    return res.status(400).json({ error: 'founderHasFieldExperience must be boolean' });
  }
  if (typeof founderHasShippedBefore !== 'boolean') {
    return res.status(400).json({ error: 'founderHasShippedBefore must be boolean' });
  }
  if (!founderExperience || typeof founderExperience !== 'string') {
    return res.status(400).json({ error: 'founderExperience is required' });
  }

  const validExpertise = ['novice', 'intermediate', 'expert', 'thought_leader'];
  if (founderExpertise && !validExpertise.includes(founderExpertise)) {
    return res.status(400).json({ error: 'Invalid founderExpertise value' });
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
      return res.status(500).json({ error: 'Failed to create idea' });
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
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
