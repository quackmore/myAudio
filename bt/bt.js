import log from '../logger/logger.js';
import mpd from '../mpd/mpd.js';
import cfg from 'config';
import cfgfile from '../cfgfile/cfgfile.js';
import fs from 'fs';
import { spawn } from "child_process";
// const { resolve } from 'path');

var bth = {};

bth.interval = null;
bth.intCnt = 0;
bth.output = 'disabled';
bth.status = {};
bth.status.connected = null;
bth.scan_status = {
  inProgress: false
};

const devName = (dev) => {
  if (dev == undefined)
    return `${bth.status.connected.hasOwnProperty('name') ? bth.status.connected.name : bth.status.connected.address}`;
  else
    return `${dev.hasOwnProperty('name') ? dev.name : dev.address}`;
}

const saveVolume = (value) => {
  if (!(bth.status.connected.hasOwnProperty('address'))) return;
  let content = cfgfile.read();
  if (!content.bt) content.bt = {};
  if (!content.bt.defaultVolume) content.bt.defaultVolume = [];
  let devFound = false;
  for (let dev of content.bt.defaultVolume)
    if (dev.address === bth.status.connected.address) {
      devFound = true;
      dev.volume = value;
    }
  if (!devFound)
    content.bt.defaultVolume.push({ 'address': bth.status.connected.address, 'volume': value });
  cfgfile.save(content);
}

const saveVolumeInc = (value) => {
  if (!(bth.status.connected.hasOwnProperty('address'))) return;
  let content = cfgfile.read();
  if (!content.bt) content.bt = {};
  if (!content.bt.defaultVolume) content.bt.defaultVolume = [];
  let devFound = false;
  for (let dev of content.bt.defaultVolume)
    if (dev.address === bth.status.connected.address) {
      devFound = true;
      dev.volume = `${parseInt(dev.volume.split('%')[0]) + value}%`;
    }
  if (devFound) cfgfile.save(content);
}

const volumeInc = async () => {
  return new Promise(async (resolve, reject) => {
    let volCtrl = "";
    let volLev = "";
    if (bth.status.connected == null) {
      reject("no devices connected");
      return;
    } else {
      if (!(bth.status.connected.hasOwnProperty('volCtrl'))) {
        reject(`${devName()} has no A2DP control`);
        return;
      }
      volCtrl = bth.status.connected.volCtrl;
      volLev = bth.status.connected.volume;
    }
    // set playback volume
    if (volCtrl && volLev != "100%") {
      let volCtrlStr = `"${volCtrl}"`;
      let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, "1%+"]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<amixer -D bluealsa sset ${volCtrlStr} 1%+> got ${data} - ${error}`;
        log.error(msg);
        reject(msg);
        return;
      }
      await amixerSconctrols();
      // save default volume value
      saveVolumeInc(1);
    }
    resolve(`${devName()}'s volume increased by 1%`);
  })
}

const volumeDec = async () => {
  return new Promise(async (resolve, reject) => {
    let volCtrl = "";
    let volLev = "";
    if (bth.status.connected == null) {
      reject("no devices connected");
      return;
    } else {
      if (!(bth.status.connected.hasOwnProperty('volCtrl'))) {
        reject(`${devName()} has no A2DP control`);
        return;
      }
      volCtrl = bth.status.connected.volCtrl;
      volLev = bth.status.connected.volume;
    }
    // set playback volume
    if (volCtrl && volLev != "0%") {
      let volCtrlStr = `"${volCtrl}"`;
      let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, "1%-"]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<amixer -D bluealsa sset ${volCtrlStr} 1%-> got ${data} - ${error}`;
        log.error(msg);
        reject(msg);
        return;
      }
      await amixerSconctrols();
      // save default volume value
      saveVolumeInc(-1);
    }
    resolve(`${devName()}'s volume decreased by 1%`);
  })
}

const volumeSet = async (value) => {
  return new Promise(async (resolve, reject) => {
    let volCtrl = "";
    let volLev = "";
    if (bth.status.connected == null) {
      reject("no device connected");
      return;
    } else {
      if (!(bth.status.connected.hasOwnProperty('volCtrl'))) {
        reject(`${devName()} has no A2DP control`);
        return;
      }
      volCtrl = bth.status.connected.volCtrl;
      volLev = bth.status.connected.volume;
    }
    log.info(`current volume: ${volCtrl}: ${volLev}`);
    // set playback volume
    if (volCtrl && volLev != value) {
      let volCtrlStr = `"${volCtrl}"`;
      log.info(`new volume: ${volCtrlStr}: ${value}`);
      let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, value]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<amixer -D bluealsa sset ${volCtrlStr} ${value}> got ${data} - ${error}`;
        log.error(msg);
        reject(msg);
        return;
      }

      var doubleCheck = true;
      while (doubleCheck) {
        await new Promise((resolve, reject) => {
          setTimeout(resolve, 2000);
        });
        let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, value]);
        let data = "";
        for await (const chunk of bthCmd.stdout)
          data += chunk;
        let volLevel = "";
        for (let line of data.toString().split('\n')) {
          if (line.toString().length < 2) continue;
          volLevel = line.toString();
        }
        if (volLevel.length > 5) {
          volLevel = volLevel.match(/\[(.*?)\]/)[1];
        }
        let error = "";
        for await (const chunk of bthCmd.stderr) {
          error += chunk;
        }
        let exitCode = await new Promise((resolve, reject) => {
          bthCmd.on('close', resolve);
        });

        if (exitCode) {
          let msg = `<amixer -D bluealsa sset ${volCtrlStr} ${value}> got ${data} - ${error}`;
          log.error(msg);
          reject(msg);
          return;
        }

        if (volLevel === value) doubleCheck = false;
        else {
          log.info(`new volume: ${volCtrlStr}: ${value}`);
          let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, value]);
          let data = "";
          for await (const chunk of bthCmd.stdout)
            data += chunk;
          let error = "";
          for await (const chunk of bthCmd.stderr) {
            error += chunk;
          }
          let exitCode = await new Promise((resolve, reject) => {
            bthCmd.on('close', resolve);
          });

          if (exitCode) {
            let msg = `<amixer -D bluealsa sset ${volCtrlStr} ${value}> got ${data} - ${error}`;
            log.error(msg);
            reject(msg);
            return;
          }
        }
      }
      await amixerSconctrols();
      // save default volume value
      saveVolume(value);
    }
    resolve(`${devName()}'s volume set to ${value}`);
  })
}

const volumeMute = async (val) => {
  return new Promise(async (resolve, reject) => {
    // val = "mute" || "unmute"
    if (val !== "mute" && val !== "unmute") {
      reject(`invalid command ${val}`);
      return;
    }
    let volCtrl = "";
    let volLev = "";
    if (bth.status.connected == null) {
      reject("no devices connected");
      return;
    } else {
      if (!(bth.status.connected.hasOwnProperty('volCtrl'))) {
        reject(`${devName()} has no A2DP control`);
        return;
      }
      volCtrl = bth.status.connected.volCtrl;
      volLev = bth.status.connected.volume;
    }
    if (volCtrl && volLev != "0%") {
      let volCtrlStr = `"${volCtrl}"`;
      let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, val]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<amixer -D bluealsa sset ${volCtrlStr} [mute|unmute]> got ${data} - ${error}`;
        log.error(msg);
        reject(msg);
        return;
      }
      await amixerSconctrols();
    }
    resolve(`${devName()}'s volume ${val}d`);
  })
}

const deviceConnect = async (address) => {
  return new Promise(async (resolve, reject) => {
    let foundDev = {};
    // check for empty devices
    if (bth.status.devices == undefined || bth.status.devices.length === 0) {
      log.info("deviceConnect: no devices available");
      reject("no devices available");
      return;
    }
    // check for address in devices
    for (let dev of bth.status.devices) {
      if (dev.address === address) {
        foundDev = dev;
        break;
      }
      if (dev.connected === "yes") {
        // disconnect already connected devices
        log.info(`deviceConnect: disconnecting ${devName(dev)} [${address}]`);
        let bthCmd = spawn("bluetoothctl", ["disconnect", dev.address]);
        let data = "";
        for await (const chunk of bthCmd.stdout)
          data += chunk;
        let error = "";
        for await (const chunk of bthCmd.stderr) {
          error += chunk;
        }
        let exitCode = await new Promise((resolve, reject) => {
          bthCmd.on('close', resolve);
        });
        if (exitCode) {
          let msg = `<bluetoothctl disconnect ${dev.address}> got ${data} - ${error}`;
          log.error(`deviceConnect: ${msg}`);
          reject(msg);
          return;
        }
      }
    }
    if (Object.keys(foundDev).length === 0) {
      log.info(`deviceConnect:no devices with address ${address}`);
      reject(`no devices with address ${address}`);
      return;
    }
    // check if device is already connected
    if (foundDev.connected === "yes") {
      log.info(`deviceConnect: ${devName(foundDev)} [${foundDev.address}] already connected`);
      resolve(`${devName(foundDev)} [${foundDev.address}] already connected`);
      return;
    }
    // pair device
    if (foundDev.paired !== "yes") {
      let bthCmd = spawn("bluetoothctl", ["pair", address]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<bluetoothctl pair ${address}> got ${data} - ${error}`;
        log.error(`deviceConnect: ${msg}`);
        reject(msg);
        return;
      }
    }
    log.info(`deviceConnect: device ${address} paired`);
    // trust device
    // log.info(`trusting ${address}`);
    if (foundDev.trusted !== "yes") {
      let bthCmd = spawn("bluetoothctl", ["trust", address]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<bluetoothctl trust ${address}> got ${data} - ${error}`;
        log.error(`deviceConnect: ${msg}`);
        reject(msg);
        return;
      }
    }
    log.info(`deviceConnect: device ${address} trusted`);
    // connect device
    if (foundDev.online != undefined && foundDev.online !== 'yes') {
      log.info(`deviceConnect: ${devName(foundDev)} [${foundDev.address}] is offline`);
      reject(`${devName(foundDev)} [${foundDev.address}] is offline`);
      return;
    }
    // log.info(`finally connecting to ${address}`);
    const bthCmd = spawn("bluetoothctl", ["connect", address]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<bluetooth connect ${address}> got ${data} - ${error}`;
      log.error(`deviceConnect: ${msg}`);
      reject(msg);
      return;
    }
    resolve(`${devName(foundDev)} ? foundDev.name : ""} [${foundDev.address}] connected`);
  })
}

const autoconnect = async () => {
  try {
    let content = cfgfile.read();
    if (content != {} && content.bt && content.bt.lastConnected) {
      for (let dev of bth.status.devices) {
        if (dev.address === content.bt.lastConnected && dev.online != undefined && dev.online === 'yes') {
          log.info(`autoconnect to ${content.bt.lastConnected}...`);
          await deviceConnect(content.bt.lastConnected);
        }
      }
    }
  }
  catch (err) {
    log.error(err.message);
  }
}

const statusChange = ([attr, state]) => {
  return new Promise(async (resolve, reject) => {
    // validate input
    if (attr !== "power" && attr != "scan") {
      let msg = `invalid argument ${attr}`;
      log.error(msg);
      reject(msg);
      return;
    }
    if (attr === "power" && (state !== "on" && state != "off")) {
      let msg = `invalid argument ${state}`;
      log.error(msg);
      reject(msg);
      return;
    }
    if (attr === "scan" && (state !== "on" && state != "off")) {
      let msg = `invalid argument ${state}`;
      log.error(msg);
      reject(msg);
      return;
    }
    // scan has to be managed differently
    if (attr === "scan" && state === "on" && bth.scan_status.inProgress) {
      resolve("already scanning");
      return;
    }
    if (attr === "scan" && state === "off" && bth.scan_status.inProgress) {
      bth.scan_status.childProcess.kill('SIGINT');
      bth.scan_status.inProgress = false;
      resolve(`${attr} ${state}`);
      return;
    }
    if (attr === "scan" && state === "off" && !bth.scan_status.inProgress) {
      resolve("not scanning");
      return;
    }
    const bthCmd = spawn("bluetoothctl", [attr, state]);
    if (attr === "scan") {
      bth.scan_status.childProcess = bthCmd;
      bth.scan_status.inProgress = true;
      resolve(`${attr} ${state}`);
      return;
    }
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let error = "";
    for await (const chunk of bthCmd.stderr)
      error += chunk;
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<bluetoothctl ${attr} ${state}> got ${data} - ${error}`;
      log.error(msg);
      reject(msg);
      return;
    }
    // must call refresh info to manage the new status
    await btMngr();
    resolve(`${attr} ${state}`);
  })
}

const amixerSconctrols = () => {
  return new Promise(async (resolve, reject) => {
    if (bth.status.connected == null) {
      reject("no devices connected");
      return;
    }
    let bthCmd = spawn("amixer", ["-D", "bluealsa", "scontrols"]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    for (let line of data.toString().split('\n')) {
      if (line.toString().includes("A2DP"))
        bth.status.connected.volCtrl = line.toString().split("'")[1];
      if (line.toString().includes("Battery"))
        bth.status.connected.batCtrl = line.toString().split("'")[1];
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<amixer -D bluealsa scontrols> got ${data} - ${error}`;
      log.error(msg);
      reject(msg);
      return;
    }
    // get battery
    if (bth.status.connected.batCtrl) {
      let batCtrl = `"${bth.status.connected.batCtrl}"`;
      let bthCmd = spawn("amixer", ["-D", "bluealsa", "sget", batCtrl]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      let batLevel = "";
      for (let line of data.toString().split('\n')) {
        if (line.toString().length < 2) continue;
        batLevel = line.toString();
      }
      if (batLevel.length > 5)
        bth.status.connected.battery = batLevel.match(/\[(.*?)\]/)[1];
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<amixer -D bluealsa sget '${bth.status.connected.batCtrl}'> got ${data} - ${error}`;
        log.error(msg);
        reject(msg);
        return;
      }

      // get playback volume
      if (bth.status.connected.volCtrl) {
        let volCtrl = `"${bth.status.connected.volCtrl}"`;
        let bthCmd = spawn("amixer", ["-D", "bluealsa", "sget", volCtrl]);
        let data = "";
        for await (const chunk of bthCmd.stdout)
          data += chunk;
        let volLevel = "";
        for (let line of data.toString().split('\n')) {
          if (line.toString().length < 2) continue;
          volLevel = line.toString();
        }
        if (volLevel.length > 5) {
          bth.status.connected.volume = volLevel.match(/\[(.*?)\]/)[1];
          bth.status.connected.mute = volLevel.match(/\[on\]/) ? "no" : "yes";
        }
        let error = "";
        for await (const chunk of bthCmd.stderr) {
          error += chunk;
        }
        let exitCode = await new Promise((resolve, reject) => {
          bthCmd.on('close', resolve);
        });

        if (exitCode) {
          let msg = `<amixer -D bluealsa sget '${bth.status.connected.volCtrl}'> got ${data} - ${error}`;
          log.error(msg);
          reject(msg);
        }
      }
    }
    resolve("done");
  })
}

const deviceRemove = async (address) => {
  return new Promise(async (resolve, reject) => {
    let foundDev = null;
    for (let dev of bth.status.devices)
      if (dev.address === address) foundDev = dev;
    if (foundDev == null) {
      reject(`no devices with address ${foundDev.address}`);
      return;
    }
    let bthCmd = spawn("bluetoothctl", ["remove", address]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<bluetoothctl remove ${address}> got ${data} - ${error}`;
      log.error(msg);
      reject(msg);
      return;
    }
    resolve(`${devName(foundDev)} [${foundDev.address}] removed`);
  })
}

const findConnectedDevice = () => {
  bth.status.connected = null;
  for (let dev of bth.status.devices)
    if (dev.connected === "yes")
      bth.status.connected = dev;
  return bth.status.connected;
}

const bluetoothctlInfoDevice = () => {
  return new Promise(async (resolve, reject) => {
    for (let dev of bth.status.devices) {
      if (dev.paired) delete dev.paired;
      if (dev.trusted) delete dev.trusted;
      if (dev.connected) delete dev.connected;
      if (dev.online) delete dev.online;
      let bthCmd = spawn("bluetoothctl", ["info", dev.address]);
      let data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      for (let line of data.toString().split('\n')) {
        if (line.toString().includes("Paired"))
          dev.paired = line.toString().split(': ')[1];
        if (line.toString().includes("Trusted"))
          dev.trusted = line.toString().split(': ')[1];
        if (line.toString().includes("Connected"))
          dev.connected = line.toString().split(': ')[1];
        // WARNING: 
        // using RSSI value to determine if device is online
        // scan must be on (or information in not updated)
        // bluetoothctl showed this behavior:
        // + device is online but not connected
        //   -> RSSI is provided
        //   -> connected: no
        // + device is connected
        //   -> RSSI is no longer provided
        //   -> connected: yes
        if (line.toString().includes("RSSI"))
          dev.online = "yes";
      }
      let error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      let exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `<bluetoothctl info ${dev.address}> got ${data} - ${error}`;
        log.error(msg);
        reject(msg);
        return;
      }
    }
    resolve(bth.status.devices);
  })
}

const bluetoothctlDevice = () => {
  return new Promise(async (resolve, reject) => {
    bth.status.devices = [];
    let bthCmd = spawn("bluetoothctl", ["devices"]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    for (let line of data.toString().split('\n')) {
      // example:
      // Device 01:15:21:47:16:D4 OneOdio A70 
      // but it also happened to be:
      // "some string" Device 01:15:21:47:16:D4 OneOdio A70 
      let pos = line.toString().search('Device');
      if (pos < 0) continue;
      let device = {};
      device.address = line.toString().substring(pos + 7, 24);
      device.name = line.toString().substring(pos + 25);
      bth.status.devices.push(device);
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<bluetoothctl devices> got ${data} - ${error}`;
      log.error(msg);
      reject(msg);
      return;
    }
    resolve(bth.status.devices);
  })
}

const bluetoothctlShow = () => {
  return new Promise(async (resolve, reject) => {
    const bthCmd = spawn("bluetoothctl", ["show"]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    for (let line of data.toString().split('\n')) {
      if (line.toString().includes("Controller"))
        bth.status.Controller = line.toString().split(' ')[1];
      if (line.toString().includes("Powered"))
        bth.status.Powered = line.toString().split(': ')[1];
      if (line.toString().includes("Discovering"))
        bth.status.Discovering = line.toString().split(': ')[1];
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<bluetoothctl show> got ${data} - ${error}`;
      log.error(msg);
      reject(msg);
      return;
    }
    resolve(bth.status);
  })
}

var prevState = {
  Powered: 'no',
  connecting: false,
  configured: false
}

const btOn = () => {
  if (prevState.Powered === 'no') {
    // deafult conditions
    prevState.Powered = 'yes';
    bth.intCnt = 5000;
  }
}

const btOff = async () => {
  if (prevState.Powered === 'yes') {
    // scan off and update previuos state
    await statusChange(['scan', 'off']);
    log.info("bt scan off");
    bth.intCnt = 0;
    bth.status.connected = null;
    bth.status.devices = [];
    prevState.Powered = 'no';
    prevState.connecting = false;
    prevState.configured = false;
  }
}

const preConnect = async () => {
  if (bth.status.Discovering === 'no') {
    log.info("bt scan on");
    await statusChange(['scan', 'on']);
  }
  prevState.connecting = true;
  prevState.configured = false;
  bth.intCnt = 500;
}

const updateAlsaBtCfg = async (address) => {
  let file_content = "";
  try {
    file_content = fs.readFileSync(cfg.get('player.alsaCfgFile')).toString();
  } catch (err) {
    log.error(err.message)
    return;
  }
  if (file_content.includes(address)) return;
  let fixedContent = file_content.substring(0, file_content.indexOf('# BLUETOOTH CUSTOM DEVICE\n'));
  file_content = fixedContent + `# BLUETOOTH CUSTOM DEVICE\n\npcm.bth-speaker {\n    type plug\n    slave.pcm {\n        type bluealsa\n        device "${address}"\n        profile "a2dp"\n    }\n}`;
  try {
    fs.writeFileSync(cfg.get('player.alsaCfgFile'), file_content);
    await mpd.restart();
    log.info(`device ${address} added to alsa cfg file ${cfg.get('player.alsaCfgFile')}`);
  } catch (err) {
    log.error(err.message)
  }
}

const saveLastDeviceConnected = async (address) => {
  let content = cfgfile.read();
  if (!content.bt) content.bt = {};
  if (!content.bt.lastConnected) content.bt.lastConnected = "";
  if (content.bt.lastConnected !== address) {
    content.bt.lastConnected = address;
    cfgfile.save(content);
    log.info(`device ${address} saved as last connected device`);
  }
}

const setDefaultVolume = async (address) => {
  let content = cfgfile.read();
  if (content.bt.defaultVolume) {
    for (let dev of content.bt.defaultVolume)
      if (dev.address === address) {
        await volumeSet(dev.volume);
      }
  }
}

const btMngr = async () => {
  try {
    let status = await bluetoothctlShow();
    if (status.Powered === 'no') {
      btOff();
      return;
    }
    btOn();
    // scanning will ensure detection of online/offline devices
    if (bth.status.Discovering === 'no') await statusChange(['scan', 'on']);
    await bluetoothctlDevice();
    await bluetoothctlInfoDevice();
    if (findConnectedDevice() == null) {
      if (bth.output === 'enabled' && cfg.has('player.bt_output')) {
        mpd.output(['disableoutput', cfg.get('player.bt_output')]);
        bth.output = 'disabled'
      }
      if (!prevState.connecting) preConnect();
      autoconnect();
    } else {
      // check if connected went offline
      if (bth.status.connected.connected === 'no') {
        log.info(`${devName()} disconnected`);
        bth.status.connected = null;
        preConnect();
      } else {
        if (!prevState.configured) {
          // device just connected here
          log.info(`${devName()} [${bth.status.connected.address}] connected`);
          await updateAlsaBtCfg(bth.status.connected.address);
          await saveLastDeviceConnected(bth.status.connected.address);
          await amixerSconctrols();
          await setDefaultVolume(bth.status.connected.address);
          await statusChange(['scan', 'off']);
          if (bth.output === 'disabled' && cfg.has('player.bt_output')) {
            mpd.output(['enableoutput', cfg.get('player.bt_output')]);
            bth.output = 'enabled'
          }
          prevState.configured = true;
        } else {
          // device connected, stop scanning
          if (prevState.connecting) {
            prevState.connecting = false;
            log.info("bt scan off");
          }
          bth.intCnt = 5000;
          await amixerSconctrols();
        }
      }
    }
    if (bth.interval) clearInterval(bth.interval);
    bth.interval = setTimeout(btMngr, bth.intCnt);
  } catch (err) {
    log.error(err);
    if (bth.interval) clearInterval(bth.interval);
    bth.interval = setTimeout(btMngr, bth.intCnt);
  }
}

log.info("starting bluetooth mngr...")
btMngr();

export default {
  status: () => { return bth.status; },
  power: (val) => statusChange(["power", val]),
  deviceConnect: (address) => {
    preConnect();
    return deviceConnect(address);
  },
  deviceRemove: deviceRemove,
  volumeSet: volumeSet,
  volumeInc: volumeInc,
  volumeDec: volumeDec,
  volumeMute: volumeMute
};