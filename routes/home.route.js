import path from 'path';
import express from 'express';

const router = express.Router();
const __dirname = path.resolve(path.dirname(''));

/* GET home page. */
router.get('/', async function (req, res, next) {
  res.sendFile(path.join(__dirname, '/index.html'));
});

export default router;
