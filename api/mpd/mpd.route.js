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
  let mpdStatus = await mpd.playCmd(req.params.cmd, options);
  if (mpdStatus.lastCmdErr)
    res.status(500).send(mpdStatus.lastCmdErr);
  else
    res.json(mpdStatus);
});

module.exports = router;
