const express = require('express');
const cfg = require('config');
const log = require('../../logger');
const fs = require('fs');
const router = express.Router();

router.get('/', async function (req, res, next) {
  try {
    let file_content = fs.readFileSync(cfg.get('player.streamsFile'), "utf-8");
    res.json(JSON.parse(file_content));
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

router.post('/', async function (req, res, next) {
  try {
    fs.writeFileSync(cfg.get('player.streamsFile'), JSON.stringify(req.body));
    res.sendStatus(200);
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

router.post('/createStreamingPlaylist', async function (req, res, next) {
  try {
    console.log(req.body);
    fs.writeFileSync(cfg.get('player.streamingPlaylist'), req.body.playlist);
    res.sendStatus(200);
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

router.post('/deleteStreamingPlaylist', async function (req, res, next) {
  try {
    fs.unlinkSync(cfg.get('player.streamingPlaylist'));
    res.sendStatus(200);
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

module.exports = router;
