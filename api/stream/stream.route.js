import express from 'express';
import cfg from 'config';
import log from '../../logger/logger.js';
import fs from 'fs';
import cfgFilesRoot from '../../utils/cfgFilesRoot.js';
import path from 'path';

const streamsFile = path.join(cfgFilesRoot(), "/streams/streams.json");
const router = express.Router();

router.get('/', async function (req, res, next) {
  try {
    let file_content = fs.readFileSync(streamsFile, "utf-8");
    res.json(JSON.parse(file_content));
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

router.post('/', async function (req, res, next) {
  try {
    fs.writeFileSync(streamsFile, JSON.stringify(req.body));
    res.sendStatus(200);
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

router.post('/createStreamingPlaylist', async function (req, res, next) {
  try {
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

export default router;
