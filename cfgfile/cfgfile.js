import log from '../logger/logger.js';
import path from 'path';
import fs from 'fs';
import cfgFilesRoot from '../utils/cfgFilesRoot.js';


export default {
  init: () => {
    try {
      if (!fs.existsSync(cfgFilesRoot())) {
        fs.mkdirSync(cfgFilesRoot());
      }
    } catch (err) {
      log.error(err.message);
    }
  },
  read: () => {
    try {
      let file_content = fs.readFileSync(path.join(cfgFilesRoot(), "config.json"));
      return JSON.parse(file_content);
    } catch (err) {
      log.error(err.message)
      if (err.code === 'ENOENT') {
        try {
          fs.writeFileSync(path.join(cfgFilesRoot(), "config.json"), JSON.stringify({}, null, 4));
        } catch (err) {
          log.error(err.message)
        }
      }
      return {};
    }
  },
  save: (content) => {
    try {
      fs.writeFileSync(path.join(cfgFilesRoot(), "config.json"), JSON.stringify(content, null, 4));
    } catch (err) {
      log.error(err.message)
    }
  }
};