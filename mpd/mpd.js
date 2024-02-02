const mpd = require('mpd'),
  cmd = mpd.cmd;
const { resolve } = require('path');
const log = require('../logger');

const client = mpd.connect({
  port: 6600,
  host: 'localhost',
});

var mpdSt = {};

const parseMpd = (txt) => {
  let obj = {};
  for (item of txt.split('\n'))
    if (item !== '') {
      let [key, ...val] = item.split(':');
      obj[key.replace(/[ -]/g, '')] = val.toString().trimStart();
    }
  return obj;
}

// const sendCommand = util.promisify(client.sendCommand)

const updateStatus = () =>
  new Promise((resolve, reject) => {
    client.sendCommand(cmd("status", []), (err, msg) => {
      if (err) {
        log.error(err);
        mpdSt.error = err;
        reject(err);
      } else {
        mpdSt.error = "";
        mpdSt.status = parseMpd(msg);
        client.sendCommand(cmd("currentsong", []), (err, msg) => {
          if (err) {
            log.error(err);
            mpdSt.error = err;
            reject(err);
          } else {
            mpdSt.error = "";
            mpdSt.curSong = parseMpd(msg);
            resolve(mpdSt);
          }
        });
      }
    });
  });

mpdSt.error = "Not Connected";

client.on('ready', () => {
  log.info("connected to mpd");
  mpdSt.error = "";
  updateStatus();
});

client.on('error', (err) => {
  log.error(err.message);
  mpdSt.error = err.message;
});

client.on('system', (name) => {
  log.info(`update ${name}`);
});

client.on('system-player', () => {
  updateStatus();
});

const delay = (t, val) => new Promise(resolve => setTimeout(resolve, t, val));

module.exports = {
  status: () => {
    return updateStatus();
  },
  playCmd: async (command, options) => {
    mpdSt.lastCmdErr = "";
    client.sendCommand(cmd(command, options), (err, msg) => {
      if (err) {
        log.error(err.message);
        mpdSt.lastCmdErr = err.message;
      }
    });
    await updateStatus();
    return mpdSt;
  }
}