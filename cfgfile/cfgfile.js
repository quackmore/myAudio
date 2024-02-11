const log = require('../logger')
const path = require('path');
const pkg = require('../package.json');
const fs = require('fs');


module.exports = {
  read: () => {
    try {
      let file_content = fs.readFileSync(path.join(__dirname, `../config/${pkg.name}.json`));
      return JSON.parse(file_content);
    } catch (err) {
      log.error(err.message)
      if (err.code === 'ENOENT') {
        try {
          fs.writeFileSync(path.join(__dirname, `../config/${pkg.name}.json`), JSON.stringify({}, null, 4));
        } catch (err) {
          log.error(err.message)
        }
      }
      return {};
    }
  },
  save: (content) => {
    try {
      fs.writeFileSync(path.join(__dirname, `../config/${pkg.name}.json`), JSON.stringify(content, null, 4));
    } catch (err) {
      log.error(err.message)
    }
  }
};