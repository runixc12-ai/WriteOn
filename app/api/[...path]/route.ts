import { env } from 'cloudflare:workers';
import { makeHandler } from '@/lib/writeon-api';
export const dynamic = 'force-dynamic';
const handle = (request: Request) => makeHandler(env)(request);
export { handle as GET, handle as POST, handle as DELETE };
