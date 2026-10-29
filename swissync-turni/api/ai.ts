import { handleAi } from '../server/ai';

// Vercel Function (Web Request/Response signature). The xAI key stays on the server.
const handler = (request: Request) => handleAi(request, process.env);

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
