import RSSParser from 'rss-parser';
import fs from 'fs';
import log from '../logger/logger.js';
import cfgFilesRoot from '../utils/cfgFilesRoot.js';
import path from 'path';
import got from 'got';
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
      resolve(feed.items.map(item => ({ title: item.title, url: item.enclosure.url, duration: item.itunes.duration, contentSnippet: item.contentSnippet, date: item.isoDate.substring(0, 10) })));
    } catch (err) {
      log.error(err.message)
      reject(err.message);
    }
  })
}

// const { createWriteStream } from "fs");
// const stream from "stream");
// const { promisify } from "util");
// const pipeline = promisify(stream.pipeline);
// 
// const url = "https://media0.giphy.com/media/4SS0kfzRqfBf2/giphy.gif";
// const fileName = "image.gif";
// 
// const downloadStream = got.stream(url);
// const fileWriterStream = createWriteStream(fileName);
// 
// downloadStream.on("downloadProgress", ({ transferred, total, percent }) => {
//   const percentage = Math.round(percent * 100);
//   console.error(`progress: ${transferred}/${total} (${percentage}%)`);
// });
// 
// pipeline(downloadStream, fileWriterStream)
//   .then(() => console.log(`File downloaded to ${fileName}`))
//   .catch((error) => console.error(`Something went wrong. ${error.message}`));
// async function addEpisodeToQueue(filename, url) {
//   return new Promise(async (resolve, reject) => {
//     try {
//       let parser = new RSSParser();
//       let feed = await parser.parseURL(feedUrl);
//       resolve(feed.items.map(item => ({ title: item.title, url: item.enclosure.url, duration: item.itunes.duration, contentSnippet: item.contentSnippet, date: item.isoDate.substring(0, 10) })));
//     } catch (err) {
//       log.error(err.message)
//       reject(err.message);
//     }
//   })
// }

export default {
  getList: getList,
  saveList: saveList,
  getEpisodes: getEpisodes
}