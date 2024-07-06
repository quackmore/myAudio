import express from 'express';
import spkrs from '../../speakers/speakers.js';

const router = express.Router();

router.get('/status', async function (req, res, next) {
  spkrs.status()
    .then(data => res.json(data))
    .catch(err => {
      console.log(err.message);
      res.status(500).send(err.message)
    });
});

router.post('/toggle', async function (req, res, next) {
  spkrs.toggle()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.get('/volume', async function (req, res, next) {
  spkrs.volumeGet()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/set/:vol', async function (req, res, next) {
  spkrs.volumeSet(req.params.vol)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/inc', async function (req, res, next) {
  spkrs.volumeInc()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/dec', async function (req, res, next) {
  spkrs.volumeDec()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/mute/:val', async function (req, res, next) {
  spkrs.volumeMute(req.params.val)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

export default router;
