import pkg from '../package.json' with {type: 'json'};
import cfg from 'config';
import os from 'node:os';

const cfgFilesRoot = () => {
  if (cfg.has('player.cfgFilesRoot'))
    return cfg.get('player.cfgFilesRoot') + "/." + pkg.name;
  else
    return os.homedir() + "/." + pkg.name;
}

export default cfgFilesRoot;
