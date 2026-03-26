import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  let supabaseConnected = false;

  try {
    const { error } = await supabase.from('prebuilt_ideas').select('id').limit(1);
    supabaseConnected = !error;
  } catch {
    supabaseConnected = false;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabaseConnected,
  });
});

export default router;
