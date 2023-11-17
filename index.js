// start-up
const log = require('./logger')
// const httpd = require('./httpd/httpd')
const config = require('config');
const packageJSON = require("./package.json");
const filewatch = require('./filewatch');

log.info(`${packageJSON.name} started`);

let tracksDir = config.get('repository.basePath') + config.get('repository.tracksDir');

filewatch.start(tracksDir);

// graceful shutdown
process.on('SIGINT', () => {
    //    httpd.closeAllConnections();
    //    httpd.close();
    filewatch.end(tracksDir);
    log.info(`${packageJSON.name} ended`)
    log.end()
    process.exit(0)
})