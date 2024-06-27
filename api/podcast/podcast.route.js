const express = require('express');
const log = require('../../logger');
const fs = require('fs');
const cfgFilesRoot = require('../../utils/cfgFilesRoot');
const path = require('path');

const podcastsFile = path.join(cfgFilesRoot(), "/podcasts/podcasts.json");
const router = express.Router();

router.get('/', async function (req, res, next) {
  try {
    let file_content = fs.readFileSync(podcastsFile, "utf-8");
    res.json(JSON.parse(file_content));
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

router.post('/', async function (req, res, next) {
  try {
    fs.writeFileSync(podcastsFile, JSON.stringify(req.body));
    res.sendStatus(200);
  } catch (err) {
    log.error(err.message)
    res.status(500).send(err.message);
  }
});

module.exports = router;
