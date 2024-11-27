import express from 'express';
import bt from '../bt/bt.js';

const router = express.Router();

router.post('/reset', async function (req, res, next) {
  bt.btReset();
  res.status(200).send('got it!');
});

router.get('/status', async function (req, res, next) {
  res.json(bt.status());
});

router.get('/log', async function (req, res, next) {
  res.json(bt.getLog());
});

router.post('/cmd/:cmd', async function (req, res, next) {
  bt.cmd(req.params.cmd);
  res.status(200).send('got it!');
});

router.post('/volume/set/:vol', async function (req, res, next) {
  bt.volumeSet(req.params.vol)
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/inc', async function (req, res, next) {
  bt.volumeInc()
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/dec', async function (req, res, next) {
  bt.volumeDec()
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/mute/:val', async function (req, res, next) {
  bt.volumeMute(req.params.val)
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

export default router;