const mpd = require('mpd');
const cmd = mpd.cmd;
const { resolve } = require('path');
const log = require('../logger');
const { spawn } = require("child_process");

var mpdSt = {};

function parseObj(txt) {
  let obj = {};
  for (item of txt.split('\n'))
    if (item !== '') {
      let [key, ...val] = item.split(':');
      obj[key.replace(/[ -]/g, '')] = val.toString().trimStart();
    }
  return obj;
}

function parseArrayOfObj(txt) {
  let array = [];
  let song = {};
  for (item of txt.split('\n')) {
    if (item === '') continue;
    if ((item.startsWith('file') || item.startsWith('directory') || item.startsWith('playlist')) && Object.keys(song).length !== 0) {
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
          log.error(err);
          reject(err);
        } else {
          mpdSt.status = parseObj(msg);
          client.sendCommand(cmd("currentsong", []), (err, msg) => {
            if (err) {
              log.error(err);
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

  client.on('system-player', () => {
    updateStatus();
  });
}

// connect();

async function start() {
  log.info("starting mpd...");
  let mpdCmd = spawn("mpd", []);
  data = "";
  for await (const chunk of mpdCmd.stdout)
    data += chunk;
  error = "";
  for await (const chunk of mpdCmd.stderr) {
    error += chunk;
  }
  exitCode = await new Promise((resolve, reject) => {
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
  data = "";
  for await (const chunk of mpdCmd.stdout)
    data += chunk;
  error = "";
  for await (const chunk of mpdCmd.stderr) {
    error += chunk;
  }
  exitCode = await new Promise((resolve, reject) => {
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
  data = "";
  for await (const chunk of mpdCmd.stdout)
    data += chunk;
  error = "";
  for await (const chunk of mpdCmd.stderr) {
    error += chunk;
  }
  exitCode = await new Promise((resolve, reject) => {
    mpdCmd.on('close', resolve);
  });

  if (exitCode) {
    let msg = `mpd error: ${data} - ${error}`;
    log.error(msg);
    // throw new Error(msg);
  } else
    log.info("mpd restarted");
}

module.exports = {
  status: updateStatus,
  playCmd: playCmd,
  listinfo: listinfo,
  start: start,
  end: end,
  restart: restart
}