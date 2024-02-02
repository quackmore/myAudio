// start-up
const log = require('./logger')
// const bt = require('./bt')
const httpd = require('./httpd/httpd')
const config = require('config');
const packageJSON = require("./package.json");
const mpd = require("./mpd");

log.info(`${packageJSON.name} started`);

// graceful shutdown
process.on('SIGINT', () => {
    httpd.closeAllConnections();
    httpd.close();
    log.info(`${packageJSON.name} ended`)
    log.end()
    process.exit(0)
})