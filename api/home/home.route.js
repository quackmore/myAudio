const cfg = require('config');
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', async function (req, res, next) {
  // using ejs for rendering
  res.render('index', { prefs: { audioContactDev: `${cfg.get('audioOut.contactDevice')}`, audioContactRel: `${cfg.get('audioOut.contactRelay')}` } });
});

module.exports = router;
