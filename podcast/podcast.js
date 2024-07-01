const https = require('node:https');
const RSSParser = require('rss-parser');

async function getEpisodes(feedUrl) {
  let parser = new RSSParser();
  let feed = await parser.parseURL(feedUrl);
  return feed.items.map(item => ({ title: item.title, url: item.enclosure.url, duration: item.itunes.duration, contentSnippet: item.contentSnippet, date: item.isoDate.substring(0, 10) }));
}

module.exports = {
  getEpisodes: getEpisodes
}