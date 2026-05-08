import mpd from 'mpd';
const cmd = mpd.cmd;
import log from './logger.js';
import EventEmitter from 'events';
import { spawn } from 'child_process';
import cfg from 'config';

// ---------------------------------------------------------------------------
// Public event constants
// ---------------------------------------------------------------------------

const MpdEvents = {
  STATE_CHANGED: 'state_changed',          // { state, curSong, status }
  OPTIONS_CHANGED: 'options_changed',      // { status }
  QUEUE_CHANGED: 'queue_changed',           // {}
  STORED_PLAYLIST_CHANGED: 'stored_playlist_changed', // {}
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseObj(txt) {
  let obj = {};
  for (let item of txt.split('\n'))
    if (item !== '') {
      let [key, ...val] = item.split(':');
      obj[key.replace(/[ -]/g, '')] = val.toString().trimStart();
    }
  return obj;
}

function parseArrayOfObj(txt) {
  let array = [];
  let song = {};
  for (let item of txt.split('\n')) {
    if (item === '') continue;
    if ((item.startsWith('file') || item.startsWith('directory') || item.startsWith('playlist') || item.startsWith('outputid')) && Object.keys(song).length !== 0) {
      array.push(song);
      song = {};
    }
    let [key, ...val] = item.split(':');
    song[key.replace(/[ -]/g, '')] = val.toString().trimStart();
  }
  if (Object.keys(song).length !== 0)
    array.push(song);
  return array;
}

// ---------------------------------------------------------------------------
// MpdService
// ---------------------------------------------------------------------------

class MpdService extends EventEmitter {

  // ── private state ─────────────────────────────────────────────────────────

  #client = null;
  #mpdSt = {};             // last known { online, status, curSong }
  #streamPlayRetry = 0;

  // ── public lifecycle ──────────────────────────────────────────────────────

  async start() {
    log.info('starting mpd...');
    const mpdProc = spawn('mpd', []);
    let data = '';
    let error = '';
    for await (const chunk of mpdProc.stdout) data += chunk;
    for await (const chunk of mpdProc.stderr) error += chunk;
    const exitCode = await new Promise(resolve => mpdProc.on('close', resolve));
    if (exitCode) {
      log.error(`mpd error: ${data} - ${error}`);
    } else {
      log.info('mpd started');
    }
    this.#connect();
  }

  async end() {
    // stop playing to flush stream cache before kill
    try { await this.playCmd('stop', []); } catch (_) { }
    log.info('ending mpd...');
    const mpdProc = spawn('mpd', ['--kill']);
    let data = '';
    let error = '';
    for await (const chunk of mpdProc.stdout) data += chunk;
    for await (const chunk of mpdProc.stderr) error += chunk;
    const exitCode = await new Promise(resolve => mpdProc.on('close', resolve));
    if (exitCode)
      log.error(`mpd --kill error: ${data} - ${error}`);
    else
      log.info('mpd ended');
  }

  async restart() {
    log.info('restarting mpd...');
    const mpdProc = spawn('pkill -9 mpd && mpd', { shell: true });
    let data = '';
    let error = '';
    for await (const chunk of mpdProc.stdout) data += chunk;
    for await (const chunk of mpdProc.stderr) error += chunk;
    const exitCode = await new Promise(resolve => mpdProc.on('close', resolve));
    if (exitCode)
      log.error(`mpd restart error: ${data} - ${error}`);
    else
      log.info('mpd restarted');
  }

  // ── public API ────────────────────────────────────────────────────────────

  /** Returns the last known { online, status, curSong } snapshot. */
  status() {
    return this.#updateStatus();
  }

  playCmd(command, options) {
    return new Promise((resolve, reject) => {
      if (!this.#mpdSt.online) return reject(new Error('mpd offline'));
      this.#client.sendCommand(cmd(command, options), (err, msg) => {
        if (err) { log.error(err.message); return reject(err); }
        resolve(msg);
      });
    });
  }

  async listinfo(info, options) {
    const data = await this.playCmd(info, options);
    return parseArrayOfObj(data);
  }

  // ── private: connection ───────────────────────────────────────────────────

  #reconnectCount = 0;

  #connect() {
    this.#client = mpd.connect({ port: 6600, host: 'localhost' });

    this.#client.on('ready', () => {
      this.#mpdSt.online = true;
      this.#reconnectCount = 0;
      log.info('connected to mpd');
      this.#updateStatus();
    });

    this.#client.on('end', () => {
      this.#mpdSt.online = false;
      const delay = this.#reconnectCount < 10 ? 1000 : 3000;
      setTimeout(() => this.#connect(), delay);
      this.#reconnectCount++;
      log.info('connection to mpd closed');
    });

    this.#client.on('error', (err) => {
      log.error(`mpd error: ${err.name} - ${err.message}`);
      log.error(`mpd error stack: ${err.stack}`);
    });

    this.#client.on('system', (name) => {
      log.info(`mpd subsystem update: ${name}`);
    });

    // ── subsystem events ──────────────────────────────────────────────────

    this.#client.on('system-player', () => {
      this.#updateStatus().then((st) => {
        if (!st.status) return;

        // streaming: pause → stop (clears cache for clean reconnect)
        if (st.curSong?.file?.startsWith('http') && st.status.state === 'pause') {
          this.playCmd('stop', []);
          return; // system-player will fire again on the stop
        }

        // streaming: error → retry with backoff
        if (st.status.error) {
          log.error(`mpd error: ${st.status.error}`);
          if (st.curSong?.file?.startsWith('http') && st.status.state === 'stop') {
            const maxRetries = cfg.get('player.streamingReconnectCount');
            if (this.#streamPlayRetry < maxRetries) {
              this.#streamPlayRetry++;
              // const delay = cfg.get('player.streamingReconnectTimeout') * this.#streamPlayRetry;
              const delay = cfg.get('player.streamingReconnectTimeout'); // no backoff
              log.info(`will try to reconnect [${this.#streamPlayRetry}] to stream in ${delay / 1000}s...`);
              setTimeout(() => this.playCmd('play', []), delay);
            } else {
              log.error(`max stream reconnect attempts reached (${maxRetries}), giving up`);
              this.#streamPlayRetry = 0;
            }
          }
        }

        // streaming: playing → reset retry counter
        if (st.curSong?.file?.startsWith('http') && st.status.state === 'play') {
          this.#streamPlayRetry = 0;
        }

        this.emit(MpdEvents.STATE_CHANGED, { state: st.status.state, curSong: st.curSong, status: st.status });
      });
    });

    this.#client.on('system-options', () => {
      this.#updateStatus().then((st) => {
        if (!st.status) return;

        this.emit(MpdEvents.OPTIONS_CHANGED, { status: st.status });
      });
    });

    this.#client.on('system-playlist', async () => {
      log.info('mpd queue changed');
      const data = await this.playCmd("playlistinfo", []);
      this.emit(MpdEvents.QUEUE_CHANGED, { songs: parseArrayOfObj(data) });
    });

    this.#client.on('system-stored-playlist', () => {
      log.info('mpd stored playlists changed');
      this.emit(MpdEvents.STORED_PLAYLIST_CHANGED, {});
    });
  }

  // ── private: status fetcher ───────────────────────────────────────────────

  async #updateStatus() {
    // return new Promise((resolve, reject) => {
    //   if (!this.#mpdSt.online) return resolve(this.#mpdSt);
    //   this.#client.sendCommand(cmd('status', []), (err, msg) => {
    //     if (err) { log.error(err.message); return reject(err); }
    //     this.#mpdSt.status = parseObj(msg);
    //     this.#client.sendCommand(cmd('currentsong', []), (err, msg) => {
    //       if (err) { log.error(err.message); return reject(err); }
    //       this.#mpdSt.curSong = parseObj(msg);
    //       resolve(this.#mpdSt);
    //     });
    //   });
    // });
    try {
      const statusMsg = await this.playCmd('status', []);
      this.#mpdSt.status = parseObj(statusMsg);
      const curSongMsg = await this.playCmd('currentsong', []);
      this.#mpdSt.curSong = parseObj(curSongMsg);
    } catch (err) {
      log.error(err.message);
    }
    return this.#mpdSt;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const mpdService = new MpdService();

export default mpdService;
export { mpdService, MpdEvents };