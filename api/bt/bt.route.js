const express = require('express');
const bt = require('../../bt');
const router = express.Router();

router.get('/status', async function (req, res, next) {
  bt.status()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/status/:attr/:state', async function (req, res, next) {
  bt.statusChange([req.params.attr, req.params.state])
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.get('/devices', async function (req, res, next) {
  bt.devices()
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/device/connect/:addr', async function (req, res, next) {
  bt.deviceConnect(req.params.addr)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/device/remove/:addr', async function (req, res, next) {
  bt.deviceRemove(req.params.addr)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/set/:addr/:vol', async function (req, res, next) {
  bt.volumeSet(req.params.addr, req.params.vol)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/inc/:addr', async function (req, res, next) {
  bt.volumeInc(req.params.addr)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/dec/:addr', async function (req, res, next) {
  bt.volumeDec(req.params.addr)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

router.post('/volume/mute/:addr/:val', async function (req, res, next) {
  bt.volumeMute(req.params.addr, req.params.val)
    .then(data => res.json(data))
    .catch(err => res.status(500).send(err.message));
});

module.exports = router;
