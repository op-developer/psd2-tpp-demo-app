import { Request, Response } from 'express';
import { getSessions } from '../services/session';

export const logout = (req: Request, res: Response) => {
  const sessions = getSessions(req);
  if (sessions !== undefined) {
    sessions.shift();
  }
  res.redirect('/');
};
