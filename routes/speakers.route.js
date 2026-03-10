import express from 'express';
import spkrs from '../services/speakers.js';

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

export default router;
