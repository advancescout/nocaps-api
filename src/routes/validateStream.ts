import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { runAnalysis, StepResult } from '../lib/analysis';
import { calculateFounderCredibility } from '../lib/credibility';

const router = Router();

interface FounderPayload {
  yearsInField: number;
  selfAssessedExpertise: 'novice' | 'intermediate' | 'expert' | 'thought_leader';
  relevantExperience: string;
  hasStartedBusiness: boolean;
}

interface StreamStepEvent {
  type: 'step';
  stepNumber: number;
  stepName: string;
  response: string;
  durationMs: number;
}

interface DoneEvent {
  type: 'done';
  ideaId: string;
  resultsToken: string;
  finalScore: number;
}

interface SSEStepErrorEvent {
  type: 'step_error';
  stepNumber: number;
  stepName: string;
}

// In-memory rate limiting (1 per IP per hour)
const rateLimitMap = new Map<string, number>();

function isRateLimited(ip: string): boolean {
  const lastRequest = rateLimitMap.get(ip);
  if (!lastRequest) return false;
  const hourInMs = 60 * 60 * 1000;
  return Date.now() - lastRequest < hourInMs;
}

function sendEvent(res: Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post('/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const userIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  // Rate limit check (bypass with BYPASS_RATE_LIMIT=true for dev/testing)
  if (process.env.BYPASS_RATE_LIMIT !== 'true' && isRateLimited(userIp)) {
    sendEvent(res, {
      type: 'error',
      message: 'You\u2019ve already submitted recently. Give it an hour and try again.',
    });
    return res.end();
  }

  const { businessIdea, targetDemographic, founder, turnstileToken } = req.body;

  if (!businessIdea || typeof businessIdea !== 'string') {
    sendEvent(res, { type: 'error', message: 'Please describe your business idea.' });
    return res.end();
  }

  if (!targetDemographic || typeof targetDemographic !== 'string') {
    sendEvent(res, { type: 'error', message: 'Please tell us who your target audience is.' });
    return res.end();
  }

  if (!founder || typeof founder !== 'object') {
    sendEvent(res, { type: 'error', message: 'Please fill in your founder details.' });
    return res.end();
  }

  const founderPayload = founder as FounderPayload;
  let clientConnected = true;
  req.on('close', () => { clientConnected = false; });

  try {
    const { data: idea, error } = await supabaseAdmin
      .from('ideas')
      .insert({
        business_idea: businessIdea,
        target_demographic: targetDemographic,
        founder_has_field_experience: founderPayload.yearsInField > 0,
        founder_years_in_field: founderPayload.yearsInField,
        founder_expertise: founderPayload.selfAssessedExpertise,
        founder_has_shipped_before: founderPayload.hasStartedBusiness,
        founder_experience: founderPayload.relevantExperience,
        user_ip: userIp,
      })
      .select()
      .single();

    if (error || !idea) {
      console.error('Insert error (stream):', error);
      sendEvent(res, { type: 'error', message: 'We couldn\u2019t save your idea. Please try again in a moment.' });
      return res.end();
    }

    // Set rate limit
    rateLimitMap.set(userIp, Date.now());

    const stepStartTimes = new Map<number, number>();

    const onStep = (step: StepResult) => {
      if (!clientConnected) return;
      const now = Date.now();
      const startedAt = stepStartTimes.get(step.stepNumber) ?? now;
      const durationMs = now - startedAt;
      const event: StreamStepEvent = {
        type: 'step',
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        response: JSON.stringify(step.response),
        durationMs,
      };
      try { sendEvent(res, event); } catch { clientConnected = false; }
      stepStartTimes.set(step.stepNumber + 1, Date.now());
    };

    stepStartTimes.set(2, Date.now());

    const onStepError = (step: { stepNumber: number; stepName: string }) => {
      if (!clientConnected) return;
      const errorEvent: SSEStepErrorEvent = {
        type: 'step_error',
        stepNumber: step.stepNumber,
        stepName: step.stepName,
      };
      try { sendEvent(res, errorEvent); } catch { clientConnected = false; }
    };

    await runAnalysis(idea.id, onStep, onStepError);

    if (clientConnected) {
      const credibility = calculateFounderCredibility(
        idea.founder_has_field_experience,
        idea.founder_years_in_field,
        idea.founder_expertise,
        idea.founder_has_shipped_before
      );

      const finalScore = credibility.credibility;
      const resultsToken = idea.id;

      const doneEvent: DoneEvent = {
        type: 'done',
        ideaId: idea.id,
        resultsToken,
        finalScore,
      };

      try {
        sendEvent(res, doneEvent);
        res.end();
      } catch {
        // Client already gone, analysis still completed
      }
    }
  } catch (err) {
    console.error('validate/stream error:', err);
    if (clientConnected) {
      try {
        sendEvent(res, { type: 'error', message: 'Something went sideways during analysis. Your idea is saved \u2014 give it another go.' });
        res.end();
      } catch {
        // Client already gone
      }
    }
  }
});

export default router;
// force fresh build Sun Apr 26 14:07:55 BST 2026
