const https = require('node:https');
const podcastParser = require('rss-parser');

let parser = new podcastParser();

async function print() {

  parser.parseURL('https://backr24.ilsole24ore.com/podcast/24mattino.xml', function (err, feed) {
    console.log(feed);
  })
}


module.exports = {
  print: print
}