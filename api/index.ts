// Vercel serverless entry point
// src/index.ts conditionally skips app.listen() in non-test environments;
// we guard it here too for Vercel.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
import app from '../src/index';
export default app;
