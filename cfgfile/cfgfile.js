import log from '../logger/logger.js';
import path from 'path';
import fs from 'fs';
import cfgFilesRoot from '../utils/cfgFilesRoot.js';

function init() {
  try {
    if (!fs.existsSync(cfgFilesRoot())) {
      fs.mkdirSync(cfgFilesRoot());
    }
  } catch (err) {
    log.error(err);
  }
}

function read() {
  return new Promise(async (resolve, reject) => {
    try {
      let file_content = fs.readFileSync(path.join(cfgFilesRoot(), "config.json"));
      resolve(JSON.parse(file_content));
    } catch (err) {
      log.error(err)
      if (err.code === 'ENOENT') {
        try {
          fs.writeFileSync(path.join(cfgFilesRoot(), "config.json"), JSON.stringify({}, null, 4));
        } catch (err) {
          log.error(err)
        }
      }
      reject(err.message);
    }
  })
}

function save(content) {
  return new Promise(async (resolve, reject) => {
    try {
      fs.writeFileSync(path.join(cfgFilesRoot(), "config.json"), JSON.stringify(content, null, 4));
      resolve('done');
    } catch (err) {
      log.error(err)
      reject(err.message);
    }
  })
}

export default {
  init: init,
  read: read,
  save: save
};