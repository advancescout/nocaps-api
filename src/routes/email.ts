import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';

const router = Router();

interface EmailRequestBody {
  name: string;
  email: string;
  ideaId: string;
  verdict: string;
  overallScore: number;
  marketingOptIn: boolean;
}

function getScoreBand(score: number): string {
  if (score >= 8) return 'score-high';
  if (score >= 5) return 'score-mid';
  return 'score-low';
}

router.post('/subscribe', async (req: Request, res: Response) => {
  const { name, email, ideaId, verdict, overallScore, marketingOptIn } = req.body as EmailRequestBody;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'We need your name to continue.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'That doesn\u2019t look like a valid email.' });
  }
  if (!ideaId) {
    return res.status(400).json({ error: 'Something went wrong. Please try submitting again.' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  const groupId = process.env.MAILERLITE_GROUP_ID;

  if (!apiKey) {
    console.warn('MAILERLITE_API_KEY missing; skipping MailerLite call');
    return res.json({ success: true, skipped: true });
  }

  try {
    const scoreBand = getScoreBand(overallScore);

    const payload: Record<string, unknown> = {
      email,
      fields: {
        name,
        verdict,
        score_band: scoreBand,
        idea_id: ideaId,
      },
      status: 'active',
    };

    if (marketingOptIn && groupId) {
      payload.groups = [groupId];
    }

    const response = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('MailerLite error:', response.status, text);
      return res.json({ success: false, error: 'We couldn\u2019t save your email right now. You can still view your results.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('MailerLite exception:', err);
    return res.json({ success: false, error: 'We couldn\u2019t save your email right now. You can still view your results.' });
  }
});

export default router;
