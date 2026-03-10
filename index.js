// start-up
import log from './services/logger.js';
import httpd from './services/httpd.js';
import config from 'config';
import packageJSON from "./package.json" with { type: "json" };
import cfgFile from "./services/cfgfile.js";
import mpd from "./services/mpd.js";
import bt from "./services/bt.js";
import pactl from "./services/pactl.js";

log.info(`${packageJSON.name} started`);
log.info('Setting PipeWire default sink to: ' + config.get('speakers.pactlDefaultSink'));
pactl.setDefaultSink(config.get('speakers.pactlDefaultSink'));
cfgFile.init();
bt.bluetoothctlStart();
mpd.start();

// graceful shutdown
process.on('SIGINT', async () => {
    httpd.closeAllConnections();
    httpd.close();
    if (config.has('player.bt_output'))
        mpd.output(['disableoutput', config.get('player.bt_output')]);
    await mpd.end();
    bt.bluetoothctlStop();
    log.info(`${packageJSON.name} ended`);
    log.end();
    process.exit(0);
})
