import express from 'express';
import { mpdService } from '../services/mpd.js';

const router = express.Router();

router.get('/status', async function (req, res, next) {
  mpdService.status()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/cmd/:cmd/:opt1?/:opt2?/:opt3?', async function (req, res, next) {
  if (!req.params.cmd) return res.status(400).send('no command');
  const options = [req.params.opt1, req.params.opt2, req.params.opt3].filter(Boolean);
  try {
    await mpdService.playCmd(req.params.cmd, options);
    const mpdStatus = await mpdService.status();
    res.json(mpdStatus);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get('/listinfo/:info/:uri?', async function (req, res, next) {
  if (!req.params.info) return res.status(400).send('no command');
  const options = req.params.uri ? [req.params.uri] : [];
  mpdService.listinfo(req.params.info, options)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

export default router;