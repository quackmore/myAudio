import mpd from 'mpd';
const cmd = mpd.cmd;
// import { resolve } from 'path';
import log from './logger.js';
import { spawn } from "child_process";
import cfg from 'config';
import { btService, btEvents } from './bt.js';
import fs from 'fs';

var mpdSt = {};

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

var client = null;

function updateStatus() {
  return new Promise((resolve, reject) => {
    if (!mpdSt.online)
      resolve(mpdSt);
    else
      client.sendCommand(cmd("status", []), (err, msg) => {
        if (err) {
          log.error(err.message);
          reject(err);
        } else {
          mpdSt.status = parseObj(msg);
          client.sendCommand(cmd("currentsong", []), (err, msg) => {
            if (err) {
              log.error(err.message);
              reject(err);
            } else {
              mpdSt.curSong = parseObj(msg);
              resolve(mpdSt);
            }
          });
        }
      });
  });
}

function playCmd(command, options) {
  return new Promise((resolve, reject) => {
    if (!mpdSt.online) reject(new Error("mpd offline"));
    client.sendCommand(cmd(command, options), (err, msg) => {
      if (err) {
        log.error(err.message);
        reject(err);
      }
      resolve(msg);
    });
  })
}

async function listinfo(info, options) {
  return playCmd(info, options)
    .then(data => parseArrayOfObj(data))
    .catch(err => { throw new Error(err.message) });
}

async function output(options) {
  try {
    let data = await playCmd('outputs', []);
    let outputs = parseArrayOfObj(data);
    if (options.length == 0)
      return outputs;
    switch (options[0]) {
      case 'disableoutput': {
        await playCmd('disableoutput', [outputs.find(el => el.outputname === options[1]).outputid]);
        let data = await playCmd('outputs', []);
        return parseArrayOfObj(data);
      }
      case 'enableoutput': {
        await playCmd('enableoutput', [outputs.find(el => el.outputname === options[1]).outputid]);
        let data = await playCmd('outputs', []);
        return parseArrayOfObj(data);
      }
      default: throw new Error(`unknown command ${options[0]}`);
    }
  } catch (err) {
    throw new Error(err.message);
  }
}

let reconnectCount = 0;

function connect() {
  let reconnectInterval = null;

  client = mpd.connect({
    port: 6600,
    host: 'localhost',
  });

  client.on('ready', () => {
    mpdSt.online = true;
    clearInterval(reconnectInterval);
    reconnectCount = 0;
    log.info("connected to mpd");
    updateStatus();
  });

  client.on('end', () => {
    mpdSt.online = false;
    if (reconnectCount < 10) {
      reconnectInterval = setTimeout(connect, 1000);
      reconnectCount++;
    } else
      reconnectInterval = setTimeout(connect, 3000);
    log.info("connection to mpd closed");
  });

  client.on('error', (err) => {
    log.error(err.message);
  });

  client.on('system', (name) => {
    log.info(`update ${name}`);
  });


  var streamPlayRetry = 0;

  function streamPlay() {
    playCmd('play', []);
  }

  client.on('system-player', () => {
    updateStatus()
      .then(() => {
        if (mpdSt.status) {
          // on streaming pause stop the player (clean the cache)
          if (mpdSt.hasOwnProperty('curSong')
            && mpdSt.curSong.hasOwnProperty('file')
            && mpdSt.curSong.file.startsWith('http')
            && mpdSt.status.state === 'pause') {
            playCmd('stop', []);
          }
          // on streaming errors retry connection
          if (mpdSt.status.error) {
            log.error(mpdSt.status.error);
            if (mpdSt.hasOwnProperty('curSong')
              && mpdSt.curSong.hasOwnProperty('file')
              && mpdSt.curSong.file.startsWith('http')
              && mpdSt.status.state === 'stop') {
              if (streamPlayRetry < cfg.get('player.streamingReconnectCount')) {
                streamPlayRetry++;
                log.info(`will try to reconnect [${streamPlayRetry}] to stream in ${(cfg.get('player.streamingReconnectTimeout')) * streamPlayRetry / 1000} secs...`);
                setTimeout(streamPlay, cfg.get('player.streamingReconnectTimeout'));
              }
            }
          }
          // on streaming playing
          if (mpdSt.hasOwnProperty('curSong')
            && mpdSt.curSong.hasOwnProperty('file')
            && mpdSt.curSong.file.startsWith('http')
            && mpdSt.status.state === 'play') {
            streamPlayRetry = 0;
          }
        }
      });
  });
}

// connect();

async function start() {
  log.info("starting mpd...");
  let mpdCmd = spawn("mpd", []);
  let data = "";
  for await (const chunk of mpdCmd.stdout)
    data += chunk;
  let error = "";
  for await (const chunk of mpdCmd.stderr) {
    error += chunk;
  }
  let exitCode = await new Promise((resolve, reject) => {
    mpdCmd.on('close', resolve);
  });

  if (exitCode) {
    let msg = `mpd error: ${data} - ${error}`;
    log.error(msg);
    // throw new Error(msg);
  } else
    log.info("mpd started");
  connect();
}

async function end() {
  // stop playing will clean stream cache avoiding issues on next restart
  await playCmd('stop', []);
  log.info("ending mpd...");
  let mpdCmd = spawn("mpd", ["--kill"]);
  let data = "";
  for await (const chunk of mpdCmd.stdout)
    data += chunk;
  let error = "";
  for await (const chunk of mpdCmd.stderr) {
    error += chunk;
  }
  let exitCode = await new Promise((resolve, reject) => {
    mpdCmd.on('close', resolve);
  });

  if (exitCode) {
    let msg = `mpd error: ${data} - ${error}`;
    log.error(msg);
    // throw new Error(msg);
  } else
    log.info("mpd ended");
}

async function restart() {
  log.info("restarting mpd...");
  let mpdCmd = spawn("mpd --kill && mpd", { shell: true });
  let data = "";
  for await (const chunk of mpdCmd.stdout)
    data += chunk;
  let error = "";
  for await (const chunk of mpdCmd.stderr) {
    error += chunk;
  }
  let exitCode = await new Promise((resolve, reject) => {
    mpdCmd.on('close', resolve);
  });

  if (exitCode) {
    let msg = `mpd error: ${data} - ${error}`;
    log.error(msg);
    // throw new Error(msg);
  } else
    log.info("mpd restarted");
}

btService.on(btEvents.DEVICE_CONNECTED, async address => {
  // await updateAlsaBtCfg(address);
//   if (cfg.has('player.bt_output')) {
//     log.info(`enabling mpd output ${cfg.get('player.bt_output')}`);
//     await output(['enableoutput', cfg.get('player.bt_output')]);
    if (mpdSt.status.state === 'play') {
      await playCmd('stop', []);
      await playCmd('play', []);
    }
//  }
})

btService.on(btEvents.DEVICE_DISCONNECTED, async address => {
//  if (cfg.has('player.bt_output')) {
//    log.info(`disabling mpd output ${cfg.get('player.bt_output')}`);
//    await output(['disableoutput', cfg.get('player.bt_output')]);
//  }
})

export default {
  status: updateStatus,
  playCmd: playCmd,
  listinfo: listinfo,
  start: start,
  end: end,
  restart: restart,
  output: output
}