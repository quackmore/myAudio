import express from 'express';
import path from 'path';
import morgan from 'morgan';

import btRouter from '../routes/bt.route.js';
import cfgFile from '../routes/cfgFile.route.js';
import homeRouter from '../routes/home.route.js';
import mpdRouter from '../routes/mpd.route.js';
import pactlRouter from '../routes/pactl.route.js';
import podcastRouter from '../routes/podcast.route.js';
import speakersRouter from '../routes/speakers.route.js';
import streamRouter from '../routes/stream.route.js';
import sseEvents from '../routes/sse-events.route.js';

const web = express();

if (process.env.NODE_ENV === 'development')
    web.use(morgan('dev'));
else
    web.use(morgan('combined'));
web.use(express.json());
web.use(express.urlencoded({ extended: false }));
// web.use(cookieParser());
// web.use(express.static(path.join(__dirname, '..', 'public')));
web.use(express.static('public'));

web.use('/', homeRouter);
web.use('/bt', btRouter);
web.use('/cfgFile', cfgFile);
web.use('/mpd', mpdRouter);
web.use('/pactl', pactlRouter);
web.use('/podcast', podcastRouter);
web.use('/speakers', speakersRouter);
web.use('/stream', streamRouter);
web.use('/events', sseEvents);

export default web;
