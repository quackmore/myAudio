import express from 'express';
import speakersService from '../services/speakers.js';

const router = express.Router();

router.get('/status', async function (req, res, next) {
  speakersService.status()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/toggle', async function (req, res, next) {
  speakersService.togglePower()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

export default router;
