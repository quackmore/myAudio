const express = require('express');
const bt = require('../../bt');
const router = express.Router();

router.get('/status', async function (req, res, next) {
  res.json(bt.status());
});

router.post('/power/:state', async function (req, res, next) {
  switch (req.params.state) {
    case "on":
    case "off":
      {
        bt.power(req.params.state)
          .then(data => res.send(data))
          .catch(err => res.status(500).send(err.message));
        break;
      }
    default:
      res.status(400).send(`invalid request 'power ${req.params.state}'`);
  }
});

router.post('/device/connect/:addr', async function (req, res, next) {
  bt.deviceConnect(req.params.addr)
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/device/remove/:addr', async function (req, res, next) {
  bt.deviceRemove(req.params.addr)
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/set/:vol', async function (req, res, next) {
  bt.volumeSet(req.params.vol)
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/inc', async function (req, res, next) {
  bt.volumeInc()
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/dec', async function (req, res, next) {
  bt.volumeDec()
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/mute/:val', async function (req, res, next) {
  bt.volumeMute(req.params.val)
    .then(data => res.send(data))
    .catch(err => res.status(500).send(err.message));
});

module.exports = router;