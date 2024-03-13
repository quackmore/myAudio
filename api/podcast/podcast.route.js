const express = require('express');
const cfg = require('config');
const log = require('../../logger');
const cast = require('../../podcast');
const router = express.Router();

router.get('/', async function (req, res, next) {
  cast.print();
  res.sendStatus(200);
});

module.exports = router;
