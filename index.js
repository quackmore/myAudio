// start-up
const log = require('./logger')
// const bt = require('./bt')
const httpd = require('./httpd/httpd')
const config = require('config');
const packageJSON = require("./package.json");
const cfgFile = require("./cfgfile");
const mpd = require("./mpd");

log.info(`${packageJSON.name} started`);
cfgFile.init();
mpd.start();

// graceful shutdown
process.on('SIGINT', async () => {
    httpd.closeAllConnections();
    httpd.close();
    if (config.has('player.bt_output'))
        mpd.output(['disableoutput', config.get('player.bt_output')]);
    await mpd.end();
    log.info(`${packageJSON.name} ended`);
    log.end();
    process.exit(0);
})