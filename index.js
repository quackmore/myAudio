// start-up
import log from './logger/logger.js';
import httpd from './httpd/httpd.js';
import config from 'config';
import packageJSON from "./package.json" assert { type: "json" };
import cfgFile from "./cfgfile/cfgfile.js";
import mpd from "./mpd/mpd.js";

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