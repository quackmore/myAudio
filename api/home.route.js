import cfg from 'config';
import express from 'express';

const router = express.Router();

/* GET home page. */
router.get('/', async function (req, res, next) {
  res.sendFile(path.join(__dirname, '/index.html'));
});

export default router;
