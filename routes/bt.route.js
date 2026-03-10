import express from 'express';
import bt from '../services/bt.js';

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

export default router;