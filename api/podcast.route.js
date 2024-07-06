import express from 'express';
import podcast from '../podcast/podcast.js';

const router = express.Router();

router.get('/', async function (req, res, next) {
  podcast.getList()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err));
});

router.post('/', async function (req, res, next) {
  podcast.saveList(req.body)
    .then(res.sendStatus(200))
    .catch(err => res.status(500).send(err));
});

router.get('/episodes/:feed', async function (req, res, next) {
  podcast.getEpisodes(req.params.feed)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err));
});

router.post('/add/filename/:filename/url/:url', async function (req, res, next) {
});

export default router;
