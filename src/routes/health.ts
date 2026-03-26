import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  let supabaseConnected = false;
  let supabaseError = '';

  try {
    const { data, error } = await supabaseAdmin.from('prebuilt_ideas').select('id').limit(1);
    supabaseConnected = !error;
    if (error) supabaseError = error.message;
  } catch (e: unknown) {
    supabaseConnected = false;
    supabaseError = e instanceof Error ? e.message : String(e);
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabaseConnected,
    supabaseError: supabaseError || undefined,
    envCheck: {
      hasUrl: !!process.env.SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      urlPrefix: process.env.SUPABASE_URL?.slice(0, 30) || 'MISSING',
    }
  });
});

export default router;
