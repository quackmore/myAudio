import RSSParser from 'rss-parser';
import fs from 'fs';
import log from '../logger/logger.js';
import cfgFilesRoot from '../utils/cfgFilesRoot.js';
import cfg from 'config';
import path from 'path';
import got from 'got';
import stream from 'stream';
import { promisify } from 'util';
import mpd from '../mpd/mpd.js';

const pipeline = promisify(stream.pipeline);


const podcastsFile = path.join(cfgFilesRoot(), "/podcasts/podcasts.json");

async function getList() {
  return new Promise(async (resolve, reject) => {
    try {
      let file_content = fs.readFileSync(podcastsFile, "utf-8");
      resolve(JSON.parse(file_content));
    } catch (err) {
      log.error(err.message)
      reject(err.message);
    }
  })
}

async function saveList(content) {
  return new Promise(async (resolve, reject) => {
    try {
      fs.writeFileSync(podcastsFile, JSON.stringify(content));
      resolve("done");
    } catch (err) {
      log.error(err.message)
      reject(err.message);
    }
  })
}

async function getEpisodes(feedUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      let parser = new RSSParser();
      let feed = await parser.parseURL(feedUrl);
      resolve(feed.items.map(item => ({ title: item.title, url: item.enclosure.url, duration: item.itunes.duration, contentSnippet: item.contentSnippet, date: item.isoDate.substring(0, 10) })).sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (err) {
      log.error(err.message)
      reject(err.message);
    }
  })
}

var downloadingFiles = [];

function updateMpdQUeue(file) {
  mpd.playCmd('add', [file])
    .catch(err => { log.error(err.message) });
}

async function addFileToQueue(name, url) {
  return new Promise(async (resolve, reject) => {
    try {
      name = name.replaceAll(':', ',');
      let fileName = path.join(cfg.get('player.podcastDownloads'), `podcasts/${name}.mp3`);
      if (!fs.existsSync(fileName)) {
        const downloadStream = got.stream(url);
        const fileWriterStream = fs.createWriteStream(fileName);
        downloadingFiles.push({ name: name, progress: '[0%]' })
        downloadStream.on("downloadProgress", ({ transferred, total, percent }) => {
          let percentage = 0;
          if (transferred > 0) percentage = Math.round(percent * 100);
          // percentage info is enough
          // downloadingFiles.find(el => el.name === name).progress = `${transferred}/${total} (${percentage}%)`;
          downloadingFiles.find(el => el.name === name).progress = `[${percentage}%]`;
        });
        downloadStream.on("end", () => {
          downloadingFiles = downloadingFiles.filter(el => el.name !== name);
          log.info(`downloaded ${fileName} from ${url}`);
          mpd.playCmd('update', ['podcasts'])
            .then(() => setTimeout(updateMpdQUeue, 2000, `podcasts/${name}.mp3`))
            .catch(err => { log.error(err.message) });
        });
        downloadStream.on("error", (error) => {
          downloadingFiles.find(el => el.name === name).progress += ' - FAILED';
          log.error(`download of ${fileName} from ${url} failed`);
        });
        // don't wait for completion, use listDownloadingFiles for checking 
        // the download status
        // await pipeline(downloadStream, fileWriterStream);
        pipeline(downloadStream, fileWriterStream);
      } else {
        updateMpdQUeue(`podcasts/${name}.mp3`);
      }
      resolve('done');
    } catch (err) {
      log.error(err.message)
      reject(err.message);
    }
  })
}

function listDownloadingFiles() { return downloadingFiles; }

function rmDownloadingFile(name) {
  downloadingFiles = downloadingFiles.filter(el => el.name !== name);
}

function rmOldEpisodes() {
  let podDir = path.join(cfg.get('player.podcastDownloads'), 'podcasts');
  try {
    let now = new Date().getTime();
    if (!fs.existsSync(podDir)) return;
    fs.readdirSync(podDir).map(fileName => {
      let fullFileName = path.join(cfg.get('player.podcastDownloads'), `podcasts/${fileName}`);
      let fileTs = fs.statSync(fullFileName).mtimeMs;
      if ((now - fileTs) > (86400 * 1000 * cfg.get('player.podcastRemovedAfterDays')))
        fs.unlink(fullFileName, (err) => {
          if (err) log.error(err);
          log.info(`${fullFileName} was deleted`);
        });
    });
  } catch (err) {
    log.error(err.message);
  }
}

rmOldEpisodes();

export default {
  getList: getList,
  saveList: saveList,
  getEpisodes: getEpisodes,
  addFileToQueue: addFileToQueue,
  listDownloadingFiles: listDownloadingFiles,
  rmDownloadingFile: rmDownloadingFile
}