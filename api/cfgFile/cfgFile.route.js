const express = require('express');
const cfg = require('../../cfgfile');
const router = express.Router();

router.get('/', async function (req, res, next) {
  try {
    let file_content = cfg.read();
    res.json(file_content);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/', async function (req, res, next) {
  try {
    cfg.save(req.body);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
