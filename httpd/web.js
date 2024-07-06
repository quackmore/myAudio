import express from 'express';
import path from 'path';
import morgan from 'morgan';

import btRouter from '../api/bt/bt.route.js';
import cfgFile from '../api/cfgFile/cfgFile.route.js';
import homeRouter from '../api/home/home.route.js';
import mpdRouter from '../api/mpd/mpd.route.js';
import podcastRouter from '../api/podcast/podcast.route.js';
import speakersRouter from '../api/speakers/speakers.route.js';
import streamRouter from '../api/stream/stream.route.js';

const web = express();

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

export default web;
