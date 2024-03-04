const log = require('../logger')
const path = require('path');
const pkg = require('../package.json');
const fs = require('fs');
const cfgFolder = require('os').homedir() + "/." + pkg.name;


module.exports = {
  init: () => {
    try {
      if (!fs.existsSync(cfgFolder)) {
        fs.mkdirSync(cfgFolder);
      }
    } catch (err) {
      log.error(err.message);
    }
  },
  read: () => {
    try {
      let file_content = fs.readFileSync(path.join(cfgFolder, "config.json"));
      return JSON.parse(file_content);
    } catch (err) {
      log.error(err.message)
      if (err.code === 'ENOENT') {
        try {
          fs.writeFileSync(path.join(cfgFolder, "config.json"), JSON.stringify({}, null, 4));
        } catch (err) {
          log.error(err.message)
        }
      }
      return {};
    }
  },
  save: (content) => {
    try {
      fs.writeFileSync(path.join(cfgFolder, "config.json"), JSON.stringify(content, null, 4));
    } catch (err) {
      log.error(err.message)
    }
  }
};