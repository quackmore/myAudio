const express = require('express');
const path = require('path');
// const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const btRouter = require('../api/bt');
const cfgFile = require('../api/cfgFile');
const homeRouter = require('../api/home');
const mpdRouter = require('../api/mpd');
const podcastRouter = require('../api/podcast');
const speakersRouter = require('../api/speakers');
const streamRouter = require('../api/stream');
const req = require('express/lib/request');

const web = express();

web.set('view engine', 'ejs');
web.set('views', path.join(process.cwd(), 'views'));

if (process.env.NODE_ENV === 'development')
    web.use(morgan('dev'));
else
    web.use(morgan('combined'));
web.use(express.json());
web.use(express.urlencoded({ extended: false }));
// web.use(cookieParser());
// web.use(express.static(path.join(__dirname, '..', 'www')));
web.use(express.static('www'));

web.use('/', homeRouter);
web.use('/bt', btRouter);
web.use('/cfgFile', cfgFile);
web.use('/mpd', mpdRouter);
web.use('/podcast', podcastRouter);
web.use('/speakers', speakersRouter);
web.use('/stream', streamRouter);

module.exports = web;
