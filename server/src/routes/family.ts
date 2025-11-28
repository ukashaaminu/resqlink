import { Router } from 'express';
import { DatabaseService } from '../services/db';

export const familyRouter = Router();

familyRouter.post('/family/invite', async (req, res) => {
  const { ownerUid, contactUid, alias, role } = req.body as {
    ownerUid?: string;
    contactUid?: string;
    alias?: string;
    role?: string;
  };
  if (!ownerUid || !contactUid) return res.status(400).json({ error: 'ownerUid and contactUid required' });
  const token = await DatabaseService.inviteFamily(ownerUid, contactUid, alias, role);
  return res.json({ ok: true, token });
});

familyRouter.post('/family/accept', async (req, res) => {
  const { token, contactUid } = req.body as { token?: string; contactUid?: string };
  if (!token || !contactUid) return res.status(400).json({ error: 'token and contactUid required' });
  const result = await DatabaseService.acceptFamily(token, contactUid);
  if (!result) return res.status(404).json({ error: 'Invite not found' });
  return res.json({ ok: true, ownerUid: result.owner_uid, contactUid: result.contact_uid });
});

familyRouter.get('/family', async (req, res) => {
  const { ownerUid } = req.query as { ownerUid?: string };
  if (!ownerUid) return res.status(400).json({ error: 'ownerUid required' });
  const links = await DatabaseService.listFamily(ownerUid);
  return res.json(links);
});

familyRouter.delete('/family/:contactUid', async (req, res) => {
  const { contactUid } = req.params;
  const { ownerUid } = req.query as { ownerUid?: string };
  if (!ownerUid || !contactUid) return res.status(400).json({ error: 'ownerUid and contactUid required' });
  await DatabaseService.deleteFamily(ownerUid, contactUid);
  return res.json({ ok: true });
});
