import express from 'express';
import mpd from '../services/mpd.js';

const router = express.Router();

router.get('/status', async function (req, res, next) {
  mpd.status()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/cmd/:cmd/:opt1?/:opt2?/:opt3?', async function (req, res, next) {
  if (!req.params.cmd) return res.status(400).send("no command");
  let options = [];
  if (req.params.opt1) options.push(req.params.opt1);
  if (req.params.opt2) options.push(req.params.opt2);
  if (req.params.opt3) options.push(req.params.opt3);
  try {
    await mpd.playCmd(req.params.cmd, options);
    let mpdStatus = await mpd.status();
    res.json(mpdStatus);
  }
  catch (err) {
    res.status(500).send(err.message);
  }
});

router.get('/listinfo/:info/:uri?', async function (req, res, next) {
  if (!req.params.info) return res.status(400).send("no command");
  let options = [];
  if (req.params.uri) options.push(req.params.uri);
  mpd.listinfo(req.params.info, options)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/output/:opt1?/:opt2?', async function (req, res, next) {
  let options = [];
  if (req.params.opt1) options.push(req.params.opt1);
  if (req.params.opt2) options.push(req.params.opt2);
  try {
    let msg = await mpd.output(options);
    res.json(msg);
  }
  catch (err) {
    res.status(500).send(err.message);
  }
});

export default router;
