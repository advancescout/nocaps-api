import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import crypto from 'crypto';

const router = Router();

const META_WEBHOOK_SECRET = process.env.META_WEBHOOK_SECRET || 'nocaps-meta-webhook-secret-2026';

function verifyMetaSignature(payload: string, signature: string): boolean {
  const expectedSig = crypto
    .createHmac('sha256', META_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  const expected = `sha256=${expectedSig}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post('/meta-ads', async (req: Request, res: Response) => {
  const signature = req.headers['x-meta-signature'] as string;

  if (!signature) {
    return res.status(401).json({ error: 'Missing X-Meta-Signature header' });
  }

  const rawBody = JSON.stringify(req.body);

  if (!verifyMetaSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body;
  const ideaId = payload.idea_id || payload.ideaId || null;

  try {
    // Store webhook payload
    await supabaseAdmin.from('meta_ads_webhooks').insert({
      idea_id: ideaId,
      payload,
    });

    // If we have conversion data, update scores
    if (ideaId && (payload.conversions || payload.spend || payload.cpc)) {
      const { data: currentScores } = await supabaseAdmin
        .from('idea_scores')
        .select('*')
        .eq('idea_id', ideaId)
        .single();

      if (currentScores) {
        const newConversions =
          (currentScores.meta_ads_conversions || 0) + (payload.conversions || 0);
        const newSpend = (currentScores.meta_ads_spend || 0) + (payload.spend || 0);
        const newCpc = payload.cpc || currentScores.meta_ads_cpc;

        const netVotes = currentScores.upvotes - currentScores.downvotes;
        const leaderboardScore =
          newConversions * 0.40 +
          netVotes * 0.30 +
          currentScores.shares * 0.20 +
          currentScores.reddit_validation * 0.10;

        await supabaseAdmin
          .from('idea_scores')
          .update({
            meta_ads_conversions: newConversions,
            meta_ads_spend: newSpend,
            meta_ads_cpc: newCpc,
            leaderboard_score: Math.max(0, leaderboardScore),
            last_updated: new Date().toISOString(),
          })
          .eq('idea_id', ideaId);
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
