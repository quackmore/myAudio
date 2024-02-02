const express = require('express');
const path = require('path');
// const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const btRouter = require('../api/bt');
const mpdRouter = require('../api/mpd');
const homeRouter = require('../api/home');
const req = require('express/lib/request');

const web = express();

web.set('view engine', 'ejs');
web.set('views', path.join(process.cwd(), 'views'));

web.use(morgan('dev'));
web.use(express.json());
web.use(express.urlencoded({ extended: false }));
// web.use(cookieParser());
// web.use(express.static(path.join(__dirname, '..', 'www')));
web.use(express.static('www'));

web.use('/', homeRouter);
web.use('/bt', btRouter);
web.use('/mpd', mpdRouter);

module.exports = web;
