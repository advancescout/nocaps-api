import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { runAnalysis, StepResult } from '../lib/analysis';
import { calculateFounderCredibility } from '../lib/credibility';

const router = Router();

// Debug helpers — _getActiveHandles/_getActiveRequests are undocumented Node internals,
// widely used for exactly this kind of serverless event-loop debugging.
const proc = process as NodeJS.Process & {
  _getActiveHandles: () => unknown[];
  _getActiveRequests: () => unknown[];
};
function dbg() {
  const handles = proc._getActiveHandles().map((h: any) => h?.constructor?.name ?? 'unknown');
  const requests = proc._getActiveRequests().map((h: any) => h?.constructor?.name ?? 'unknown');
  return `handles=${handles.length}[${handles.join(',')}] requests=${requests.length}[${requests.join(',')}]`;
}

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
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Keepalive: send SSE comment every 15s to prevent edge proxy idle timeout
  function cleanup() {
    if (keepaliveTimer !== null) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
      console.log(`[cleanup-debug] cleanup() called, interval cleared | ${dbg()}`);
    } else {
      console.log(`[cleanup-debug] cleanup() called but interval was already null | ${dbg()}`);
    }
  }

  let keepaliveTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    try {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    } catch {
      cleanup();
    }
  }, 15000);

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
    return;
  }

  const { businessIdea, targetDemographic, founder, turnstileToken } = req.body;

  if (!businessIdea || typeof businessIdea !== 'string') {
    sendEvent(res, { type: 'error', message: 'Please describe your business idea.' });
    return;
  }
  if (businessIdea.length > 200) {
    sendEvent(res, { type: 'error', message: 'Description must be 200 characters or fewer.' });
    return;
  }

  if (!targetDemographic || typeof targetDemographic !== 'string') {
    sendEvent(res, { type: 'error', message: 'Please tell us who your target audience is.' });
    return;
  }
  if (targetDemographic.length > 150) {
    sendEvent(res, { type: 'error', message: 'Audience must be 150 characters or fewer.' });
    return;
  }

  if (!founder || typeof founder !== 'object') {
    sendEvent(res, { type: 'error', message: 'Please fill in your founder details.' });
    return;
  }

  const founderPayload = founder as FounderPayload;
  let clientConnected = true;
  req.on('close', () => {
    console.log(`[cleanup-debug] req close event fired | ${dbg()}`);
    clientConnected = false;
    cleanup();
  });

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
      return;
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
    console.log(`[cleanup-debug] runAnalysis returned cleanly | ${dbg()}`);

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
        console.log(`[cleanup-debug] sendEvent doneEvent called | ${dbg()}`);
      } catch {
        // Client already gone, analysis still completed
        console.log(`[cleanup-debug] sendEvent doneEvent threw \u2014 client already gone | ${dbg()}`);
      }
    }
  } catch (err) {
    console.error('validate/stream error:', err);
    if (clientConnected) {
      try {
        sendEvent(res, { type: 'error', message: 'Something went sideways during analysis. Your idea is saved \u2014 give it another go.' });
      } catch {
        // Client already gone
      }
    }
  } finally {
    console.log(`[cleanup-debug] finally block reached, writableEnded=${res.writableEnded} | ${dbg()}`);
    cleanup();
    if (!res.writableEnded) {
      res.end();
      console.log(`[cleanup-debug] res.end() returning | ${dbg()}`);
    } else {
      console.log(`[cleanup-debug] res already ended, skipping res.end() | ${dbg()}`);
    }
  }
});

export default router;
// force fresh build Sun Apr 26 14:07:55 BST 2026
