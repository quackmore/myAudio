const https = require('node:https');
const podcastParser = require('rss-parser');

let parser = new podcastParser();

async function print() {

  parser.parseURL('https://www.spreaker.com/show/4255213/episodes/feed', function (err, feed) {
    console.log(feed);
  })
}


module.exports = {
  print: print
}