import express from 'express';
import btService from '../services/bt.js';

const router = express.Router();

router.post('/reset', async function (req, res, next) {
  btService.reset();
  res.status(200).send('got it!');
});

router.get('/status', async function (req, res, next) {
  res.json(btService.status());
});

router.get('/log', async function (req, res, next) {
  res.json(btService.getLog());
});

router.post('/cmd/:cmd', async function (req, res, next) {
  btService.cmd(req.params.cmd);
  res.status(200).send('got it!');
});

export default router;