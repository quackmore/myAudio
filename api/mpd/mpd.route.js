const express = require('express');
const mpd = require('../../mpd');
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

module.exports = router;
