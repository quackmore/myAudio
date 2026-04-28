// start-up
import log from './services/logger.js';
import httpd from './services/httpd.js';
import packageJSON from "./package.json" with { type: "json" };
import cfgFile from "./services/cfgfile.js";
import { mpdService } from "./services/mpd.js";
import btService from "./services/bt.js";
import pactl from "./services/pactl.js";
import cron from 'node-cron';
import podcast from "./services/podcast.js";

log.info(`${packageJSON.name} started`);
cfgFile.init();
pactl.startWatcher();
btService.start();
mpdService.start();

log.info('Scheduling daily maintenance tasks at 1:10 AM...');
// schedule daily tasks at 1:10 AM
// cron.schedule('41 11 * * *', () => {
cron.schedule('10 1 * * *', () => {
    log.info('Running daily maintenance tasks...');
    log.info('Removing old podcast episodes...');
    podcast.rmOldEpisodes();
});
log.info('Done scheduling daily maintenance tasks.');

// graceful shutdown
process.on('SIGINT', async () => {
    httpd.closeAllConnections();
    httpd.close();
    pactl.stopWatcher();
    await mpdService.end();
    btService.stop();
    log.info(`${packageJSON.name} ended`);
    log.end();
    process.exit(0);
})