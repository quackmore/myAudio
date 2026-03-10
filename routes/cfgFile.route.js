import express from 'express';
import cfgFile from '../services/cfgfile.js';

const router = express.Router();

router.get('/', async function (req, res, next) {
  cfgFile.read()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err));
});

router.post('/', async function (req, res, next) {
  cfgFile.save(req.body)
    .then(() => res.sendStatus(200))
    .catch(err => res.status(500).send(err));
});

export default router;
