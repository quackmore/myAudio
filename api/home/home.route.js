const cfg = require('config');
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', async function (req, res, next) {
  // using ejs for rendering
  res.render('index', { prefs: { audioContactDev: `${cfg.get('speakers.contactDevice')}`, audioContactRel: `${cfg.get('speakers.contactRelay')}` } });
});

module.exports = router;
