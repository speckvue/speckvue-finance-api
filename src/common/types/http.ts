import type { Request } from 'express';

interface Identity {
  userId: string;
  sessionId: string;
  tokenHash: string;
}

interface ApiRequest extends Request {
  id: string;
  identity?: Identity;
  cookies: Record<string, string | undefined>;
}

export type { ApiRequest, Identity };
