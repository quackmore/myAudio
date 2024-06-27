const pkg = require('../package.json');
const cfg = require('config');

const cfgFilesRoot = () => {
  if (cfg.has('player.cfgFilesRoot'))
    return cfg.get('player.cfgFilesRoot') + "/." + pkg.name;
  else
    return require('os').homedir() + "/." + pkg.name;
}

module.exports = cfgFilesRoot;
