import express from 'express';
import pactl from '../services/pactl.js';

const router = express.Router();

router.get('/volume', async function (req, res, next) {
  pactl.volumeGet()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/set/:vol', async function (req, res, next) {
  pactl.volumeSet(req.params.vol)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/inc', async function (req, res, next) {
  pactl.volumeInc()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/dec', async function (req, res, next) {
  pactl.volumeDec()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/mute/:val', async function (req, res, next) {
  pactl.volumeMute(req.params.val)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.get('/status', async function (req, res, next) {
  try {
    const [volRaw, sinkRaw] = await Promise.all([
      pactl.volumeGet(),
      pactl.getDefaultSink(),
    ]);
    res.json({ ...volRaw, ...sinkRaw });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

export default router;