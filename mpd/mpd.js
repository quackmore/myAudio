const mpd = require('mpd');
const cmd = mpd.cmd;
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

const updateStatus = () =>
  new Promise((resolve, reject) => {
    client.sendCommand(cmd("status", []), (err, msg) => {
      if (err) {
        log.error(err);
        reject(err);
      } else {
        mpdSt.status = parseMpd(msg);
        client.sendCommand(cmd("currentsong", []), (err, msg) => {
          if (err) {
            log.error(err);
            reject(err);
          } else {
            mpdSt.curSong = parseMpd(msg);
            resolve(mpdSt);
          }
        });
      }
    });
  });

client.on('ready', () => {
  log.info("connected to mpd");
  updateStatus();
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

const delay = (t, val) => new Promise(resolve => setTimeout(resolve, t, val));

module.exports = {
  status: () => {
    return updateStatus();
  },
  playCmd: (command, options) => {
    return new Promise((resolve, reject) => {
      client.sendCommand(cmd(command, options), (err, msg) => {
        if (err) {
          log.error(err.message);
          reject(err);
        }
        resolve("done");
      });
    })
  }
}