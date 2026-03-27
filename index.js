// start-up
import log from './services/logger.js';
import httpd from './services/httpd.js';
import packageJSON from "./package.json" with { type: "json" };
import cfgFile from "./services/cfgfile.js";
import mpd from "./services/mpd.js";
import btService from "./services/bt.js";
import pactl from "./services/pactl.js";

log.info(`${packageJSON.name} started`);
cfgFile.init();
pactl.startAudioServices();
pactl.startWatcher();
btService.start();
mpd.start();

// graceful shutdown
process.on('SIGINT', async () => {
    httpd.closeAllConnections();
    httpd.close();
    pactl.stopWatcher();
    await mpd.end();
    pactl.stopAudioServices();
    btService.stop();
    log.info(`${packageJSON.name} ended`);
    log.end();
    process.exit(0);
})
