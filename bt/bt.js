import log from '../logger/logger.js';
import cfgfile from '../cfgfile/cfgfile.js';
import stripAnsi from 'strip-ansi';
import EventEmitter from 'events';
import { spawn } from "child_process";
// const { resolve } from 'path');

var bth = null;

const bthLogMaxLen = 100;
var bthLog = [];

const bthLogger = (line) => {
  if (bthLog.length == bthLogMaxLen) bthLog.shift();
  bthLog.push(line);
}

const devName = (dev) => {
  if (dev == undefined)
    return `${bth.controller.connected.hasOwnProperty('name') ? bth.controller.connected.name : bth.controller.connected.Address}`;
  else
    return `${dev.hasOwnProperty('Name') ? dev.name : dev.Address}`;
}

var btTimer = null;
var btUpdateBatteryTimer = null;

const btWait = (ms) => new Promise((resolve, reject) => {
  btTimer = setTimeout(resolve, ms);
});

const getBluealsaControls = async () => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  let bthCmd = spawn("amixer", ["-D", "bluealsa", "scontrols"]);
  let data = "";
  for await (const chunk of bthCmd.stdout)
    data += chunk;
  for (let line of data.toString().split('\n')) {
    if (line.toString().includes("A2DP")) {
      BTdevice.volCtrl = line.toString().split("'")[1];
      log.info(`found A2DP control ${BTdevice.volCtrl}`);
    }
    if (line.toString().includes("Battery")) {
      BTdevice.batCtrl = line.toString().split("'")[1];
      log.info(`found battery control ${BTdevice.batCtrl}`);
    }
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
  }
}

const getBluealsaBattery = async () => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (BTdevice.batCtrl) {
    let batCtrl = `"${BTdevice.batCtrl}"`;
    let bthCmd = spawn("amixer", ["-D", "bluealsa", "sget", batCtrl]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let batLevel = "";
    for (let line of data.toString().split('\n')) {
      if (line.toString().length < 2) continue;
      batLevel = line.toString();
    }
    if (batLevel.length > 5) {
      BTdevice.battery = batLevel.match(/\[(.*?)\]/)[1];
      log.info(`${BTdevice.Name} battery level ${BTdevice.battery}`);
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<amixer -D bluealsa sget '${BTdevice.batCtrl}'> got ${data} - ${error}`;
      log.error(msg);
    }
  }
}

const updateBattery = async () => {
  if (bth.selectedCtrl.ConnectedDevice) {
    await getBluealsaBattery();
    btUpdateBatteryTimer = setTimeout(updateBattery, 60000);
  }
}

const getBluealsaVolume = async () => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (BTdevice.volCtrl) {
    let volCtrl = `"${BTdevice.volCtrl}"`;
    let bthCmd = spawn("amixer", ["-D", "bluealsa", "sget", volCtrl]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let volLevel = "";
    for (let line of data.toString().split('\n')) {
      let str = line.toString();
      if (str.length < 5) continue;
      if (str.includes('Front Left:')) {
        BTdevice.volumeLeft = str.match(/\[(.*?)\]/)[1];
        BTdevice.mute = str.match(/\[on\]/) ? "no" : "yes";
      }
      if (str.includes('Front Right:')) BTdevice.volumeRight = str.match(/\[(.*?)\]/)[1];
    }
    if (BTdevice.hasOwnProperty('volumeRight') && BTdevice.hasOwnProperty('volumeLeft')) {
      BTdevice.volume = ((Number(BTdevice.volumeLeft.slice(0, -1)) + Number(BTdevice.volumeRight.slice(0, -1))) / 2).toFixed(0).toString() + '%';
      log.info(`${BTdevice.Name} volume level ${BTdevice.volume}`);
      log.info(`${BTdevice.Name} ${BTdevice.mute == 'yes' ? 'is' : 'is not'} muted`);
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `<amixer -D bluealsa sget '${BTdevice.volCtrl}'> got ${data} - ${error}`;
      log.error(msg);
    }
  }
}

const amixerSset = async (ctrl, val) => {
  let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", ctrl, val]);
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
    let msg = `<amixer -D bluealsa sset ${ctrl} ${val}> got ${data} - ${error}`;
    log.error(msg);
  } else {
    log.info(`bluealsa volume set to ${val}`);
  }
}

const setBluealsaVolume = async (fl, fr) => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (BTdevice.volCtrl) {
    let volCtrlStr = `"${BTdevice.volCtrl}"`;
    let volValue;
    if (fr) {
      volValue = `frontleft ${fl}`;
      await amixerSset(volCtrlStr, volValue);
      volValue = `frontright ${fr}`;
      await amixerSset(volCtrlStr, volValue);
    } else {
      volValue = fl;
      await amixerSset(volCtrlStr, volValue);
    }
  }
}

const saveBTVolume = async () => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (!BTdevice.hasOwnProperty('volume')) return;
  let content = await cfgfile.read();
  if (!content.hasOwnProperty('bt')) content.bt = {};
  if (!content.bt.hasOwnProperty('defaultVolume')) content.bt.defaultVolume = [];
  let devFound = false;
  for (let dev of content.bt.defaultVolume)
    if (dev.address === BTdevice.Address) {
      devFound = true;
      dev.volumeRight = BTdevice.volumeRight;
      dev.volumeLeft = BTdevice.volumeLeft;
    }
  if (!devFound)
    content.bt.defaultVolume.push({ 'address': BTdevice.Address, 'volumeRight': BTdevice.volumeRight, 'volumeLeft': BTdevice.volumeLeft });
  cfgfile.save(content);
}

const volumeInc = async (balance) => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (BTdevice.volCtrl) {
    // set playback volume
    if (BTdevice.volume != "100%") {
      let volCtrlStr = `"${BTdevice.volCtrl}"`;
      let balance_option = '';
      if (balance == 'frontleft' || balance == 'frontright') balance_option = `${balance} `;
      let volValue = `${balance_option}1%+`;
      await amixerSset(volCtrlStr, volValue);
      // let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, `${balance_option}1%+`]);
      // let data = "";
      // for await (const chunk of bthCmd.stdout)
      //   data += chunk;
      // let error = "";
      // for await (const chunk of bthCmd.stderr) {
      //   error += chunk;
      // }
      // let exitCode = await new Promise((resolve, reject) => {
      //   bthCmd.on('close', resolve);
      // });
      // 
      // if (exitCode) {
      //   let msg = `<amixer -D bluealsa sset ${volCtrlStr} 1%+> got ${data} - ${error}`;
      //   log.error(msg);
      //   return;
      // }
      await getBluealsaVolume();
      saveBTVolume();
    }
  }
}

const volumeDec = async (balance) => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (BTdevice.volCtrl) {
    // set playback volume
    if (BTdevice.volume != "0%") {
      let volCtrlStr = `"${BTdevice.volCtrl}"`;
      let balance_option = '';
      if (balance == 'frontleft' || balance == 'frontright') balance_option = `${balance} `;
      let volValue = `${balance_option}1%-`;
      await amixerSset(volCtrlStr, volValue);
      //      let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, `${balance_option}1%-`]);
      //      let data = "";
      //      for await (const chunk of bthCmd.stdout)
      //        data += chunk;
      //      let error = "";
      //      for await (const chunk of bthCmd.stderr) {
      //        error += chunk;
      //      }
      //      let exitCode = await new Promise((resolve, reject) => {
      //        bthCmd.on('close', resolve);
      //      });
      //
      //      if (exitCode) {
      //        let msg = `<amixer -D bluealsa sset ${volCtrlStr} 1%-> got ${data} - ${error}`;
      //        log.error(msg);
      //        reject(msg);
      //        return;
      //      }
      await getBluealsaVolume();
      saveBTVolume();
    }
  }
}

const volumeMute = async (val) => {
  // val = "mute" || "unmute"
  if (val !== "mute" && val !== "unmute") {
    // reject(`invalid command ${val}`);
    return;
  }
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (BTdevice.volCtrl) {
    if (BTdevice.volume != "0%") {
      let volCtrlStr = `"${BTdevice.volCtrl}"`;
      await amixerSset(volCtrlStr, val);
      // let bthCmd = spawn("amixer", ["-D", "bluealsa", "sset", volCtrlStr, val]);
      // let data = "";
      // for await (const chunk of bthCmd.stdout)
      //   data += chunk;
      // let error = "";
      // for await (const chunk of bthCmd.stderr) {
      //   error += chunk;
      // }
      // let exitCode = await new Promise((resolve, reject) => {
      //   bthCmd.on('close', resolve);
      // });
      // if (exitCode) {
      //   let msg = `<amixer -D bluealsa sset ${volCtrlStr} [mute|unmute]> got ${data} - ${error}`;
      //   log.error(msg);
      //   reject(msg);
      //   return;
      // }
      await getBluealsaVolume();
    }
  }
}

const volumeSet = async (value) => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  if (BTdevice.volCtrl) {
    // try max 40 times
    for (let idx = 0; idx < 40; idx++) {
      await setBluealsaVolume(value);
      await btWait(1000);
      await getBluealsaVolume();
      if (BTdevice.volume === value) break;
    }
    await saveBTVolume();
  }
}

const setDefaultVolume = async (address) => {
  let content = await cfgfile.read();
  if (content.bt.hasOwnProperty('defaultVolume')) {
    for (let dev of content.bt.defaultVolume)
      if (dev.address === address) {
        log.info('setting bluealsa default value...');
        let BTdevice = bth.selectedCtrl.ConnectedDevice;
        if (BTdevice == null) return;
        if (BTdevice.volCtrl) {
          // try max 40 times
          for (let idx = 0; idx < 40; idx++) {
            await setBluealsaVolume(dev.volumeLeft, dev.volumeRight);
            await btWait(1000);
            await getBluealsaVolume();
            if (BTdevice.volumeLeft === dev.volumeLeft && BTdevice.volumeRight === dev.volumeRight) break;
          }
        }
        // await volumeSet(dev.volumeLeft, dev.volumeRight);
        return;
      }
  }
  log.info(`no default volume for device ${address}`);
}

const saveLastDeviceConnected = async (address) => {
  let content = await cfgfile.read();
  if (!content.hasOwnProperty('bt')) content.bt = {};
  if (content.bt.hasOwnProperty('lastConnected') && content.bt.lastConnected === address) {
    log.info(`last connected device is up to date`);
  } else {
    content.bt.lastConnected = address;
    cfgfile.save(content);
    log.info(`last connected device updated to ${address} `);
  }
}

const btEvent = new EventEmitter();

const events = {
  BT_START: "BT_START",
  BT_END: "BT_END",
  BT_POWERON: "BT_POWERON",
  BT_POWEROFF: "BT_POWEROFF",
  DEV_CONNECTED: "DEV_CONNECTED",
  DEV_DISCONNECTED: "DEV_DISCONNECTED",
  DEV_AVAILABLE: "DEV_AVAILABLE"
};

const isControllerListed = (addr) => bth.controllers.map(item => item.Address).includes(addr);

var lastCtrlAddress = null;

const controllerUpdate = (line) => {
  // console.log('controllerUpdate: ' + line);
  if (line.startsWith("Controller")) {
    let splittedLine = line.split(' ');
    lastCtrlAddress = splittedLine[1];
    if (!isControllerListed(lastCtrlAddress)) {
      bth.controllers.push({ Address: lastCtrlAddress, ConnectedDevice: null });
    }
    if (line.includes("[default]"))
      bth.selectedCtrl = bth.controllers.find(item => item.Address == lastCtrlAddress);
  }
  let ctrl = bth.controllers.find(item => item.Address == lastCtrlAddress);
  if (ctrl) {
    if (line.includes("Name"))
      ctrl.Name = line.split(': ')[1];
    if (line.includes("Powered")) {
      let lastPowered = ctrl.Powered;
      ctrl.Powered = line.split(': ')[1];
      if (ctrl.Powered == 'yes' && (!lastPowered || lastPowered == 'no'))
        btEvent.emit(events.BT_POWERON, ctrl.Address);
      if (ctrl.Powered == 'no' && lastPowered && lastPowered == 'yes')
        btEvent.emit(events.BT_POWEROFF, ctrl.Address);
    }
    if (line.includes("Pairable"))
      ctrl.Pairable = line.split(': ')[1];
    if (line.includes("Discovering"))
      ctrl.Discovering = line.split(': ')[1];
    if (line.includes("Discoverable:"))
      ctrl.Discoverable = line.split(': ')[1];
  }
}

var lastDevAddress = null;

const deviceUpdate = (line) => {
  // console.log('deviceUpdate: ' + line);
  if (line.startsWith("Device")) {
    let splittedLine = line.split(' ');
    lastDevAddress = splittedLine[1];
  }
  let dev = bth.devices.find(item => item.Address == lastDevAddress);
  if (dev) {
    if (line.includes("Name") && !line.includes("is nil"))
      dev.Name = line.split(': ')[1];
    if (line.includes("Icon"))
      dev.Icon = line.split(': ')[1];
    if (line.includes("Blocked"))
      dev.Blocked = line.split(': ')[1];
    if (line.includes("Paired"))
      dev.Paired = line.split(': ')[1];
    if (line.includes("Trusted"))
      dev.Trusted = line.split(': ')[1];
    if (line.includes("Connected")) {
      dev.Connected = line.split(': ')[1];
      if (dev.Connected === 'yes') {
        bth.selectedCtrl.ConnectedDevice = dev;
        btEvent.emit(events.DEV_CONNECTED, dev.Address);
      }
      if (dev.Connected === 'no' && bth.selectedCtrl.ConnectedDevice && bth.selectedCtrl.ConnectedDevice.Address == dev.Address) {
        bth.selectedCtrl.ConnectedDevice = null;
        btEvent.emit(events.DEV_DISCONNECTED, dev.Address);
      }
    }
    if (line.includes("RSSI"))
      dev.RSSI = line.split(': ')[1];
  }
}

const isDeviceListed = (addr) => bth.devices.map(item => item.Address).includes(addr);

const devicesCmd = (line) => {
  // console.log('devicesCmd: ' + line);
  if (!line.includes("Device")) return;
  let address = line.split(' ')[1];
  if (!isDeviceListed(address)) {
    bth.devices.push({ "Address": address, "Name": line.split(' ').slice(2).join(' ') });
  }
}

const infoCmd = (line) => {
  // console.log('infoCmd: ' + line);
  deviceUpdate(line);
}

const newBtDevice = async (line) => {
  // console.log('newBtDevice: ' + line);
  if (line.includes("Device")) {
    let address = line.split(' ')[2];
    if (!isDeviceListed(address)) {
      bth.devices.push({ "Address": address });
      await btWait(500);
      bluetoothctlInput(`info ${address}`);
    }
  }
}

const updateBtDevice = async (line) => {
  // console.log('updateBtDevice: ' + line);
  if (line.includes("Controller")) {
    lastCtrlAddress = await line.split(' ')[2];
    controllerUpdate(line.split(' ').slice(3).join(' '));
  } else if (line.includes("Device")) {
    lastDevAddress = line.split(' ')[2];
    deviceUpdate(line.split(' ').slice(3).join(' '));
  }
}

const delBtDevice = (line) => {
  // console.log('delBtDevice: ' + line);
  if (line.includes("Device")) {
    let address = line.split(' ')[2];
    bth.devices = bth.devices.filter(item => item.Address != address)
  }
}

const parseLastCommandRes = (cmd, line) => {
  if (line == '') return;
  if (cmd === 'show' || cmd === 'list' || cmd === 'select')
    controllerUpdate(line);
  else if (cmd === 'devices')
    devicesCmd(line);
  else if (cmd === 'info')
    infoCmd(line);
}

var lastCommand = null;

const parseBluetoothctl = (data) => {
  for (let line of data.split(/\n|\r/)) {
    // console.log('parsing: "' + line + '"');
    if (line == '') continue;
    bthLogger(line);
    if (line.startsWith('[NEW]')) {
      newBtDevice(line);
      return;
    }
    if (line.startsWith('[CHG]')) {
      updateBtDevice(line);
      return;
    }
    if (line.startsWith('[DEL]')) {
      delBtDevice(line);
      return;
    }
    // only commands that output something that requires to be parsed are saved
    // other commands result are provided by [NEW], [CHG] and [DEL] events
    if (line.startsWith('list'))
      lastCommand = 'list';
    else if (line.startsWith('select'))
      lastCommand = 'select';
    else if (line.startsWith('show'))
      lastCommand = 'show';
    else if (line.startsWith('info'))
      lastCommand = 'info';
    else if (line.startsWith('devices'))
      lastCommand = 'devices';
    else
      parseLastCommandRes(lastCommand, line);
  }
  // console.log(bth);
}

// log.info("starting bluetoothctl...")
// var bluetoothctl = spawn('bluetoothctl');

var bluetoothctl = null;

const bluetoothctlInput = (cmd) => {
  log.info('bluetoothctl stdin: ' + cmd);
  if (bluetoothctl) bluetoothctl.stdin.write(cmd + '\n');
  // manage exceptions
  if (cmd.includes('power')) setTimeout(bluetoothctlInput, 2000, 'show');
}

const bluetoothctlStart = () => {
  if (bluetoothctl) bluetoothctlStop();
  bluetoothctl = spawn('bluetoothctl');

  bluetoothctl.stdout.on('data', (data) => {
    parseBluetoothctl(stripAnsi(data.toString())
      .replace(/\u0001|\u0002/g, ''));
  });

  bluetoothctl.stderr.on('data', (data) => {
    console.log(`bluetoothctl stderr: ${data}`);
  });

  bluetoothctl.on('close', (code) => {
    log.info(`bluetoothctl exited with code ${code}.`);
    bluetoothctlStart();
  });

  btEvent.emit(events.BT_START);
}

const bluetoothctlStop = () => {
  if (bluetoothctl) bluetoothctl.kill('SIGINT');
  btEvent.emit(events.BT_END);
}

const btAvailForConn = async () => {
  await btWait(200);
  bluetoothctlInput('discoverable on');
  if (bth.selectedCtrl.Pairable && bth.selectedCtrl.Pairable == 'no') {
    await btWait(200);
    bluetoothctlInput('pairable on');
  }
  await btWait(200);
  bluetoothctlInput('scan on');
}

const btNotAvailForConn = async () => {
  if (bth.selectedCtrl.Pairable && bth.selectedCtrl.Pairable == 'yes') {
    bluetoothctlInput('discoverable off');
  }
  bluetoothctlInput('scan off');
}

btEvent.on(events.BT_START, async () => {
  log.info("starting bluetoothctl...");
  // init bth
  bth = {};
  bth.controllers = [];
  bth.selectedCtrl = null;
  bth.devices = [];
  await btWait(1000);
  bluetoothctlInput('list');
  await btWait(1000);
  bluetoothctlInput(`show ${bth.selectedCtrl.Address}`);
  await btWait(1000);
  bluetoothctlInput('devices');
  await btWait(1000);
  for (let idx = 0; idx < bth.devices.length; idx++) {
    await btWait(1000);
    bluetoothctlInput(`info ${bth.devices[idx].Address}`);
  }
})

btEvent.on(events.BT_END, address => {
  log.info("ending bluetoothctl...");
  if (btTimer) clearTimeout(btTimer);
})

btEvent.on(events.BT_POWERON, async () => {
  log.info("BT powered on...");
  btAvailForConn();
})

btEvent.on(events.BT_POWEROFF, () => {
  log.info("BT powered off...");
  btNotAvailForConn();
  if (bth.selectedCtrl != null && bth.selectedCtrl.ConnectedDevice != null) bth.selectedCtrl.ConnectedDevice = null;
})

btEvent.on(events.DEV_CONNECTED, async address => {
  log.info(`device ${address} connected`);
  btNotAvailForConn();
  let cnt = 0;
  // while (!bth.selectedCtrl.ConnectedDevice.hasOwnProperty('batCtrl') || !bth.selectedCtrl.ConnectedDevice.hasOwnProperty('volCtrl')) {
  while (!bth.selectedCtrl.ConnectedDevice.hasOwnProperty('volCtrl')) {
    await btWait(1000);
    log.info('inspecting bluealsa controls...');
    await getBluealsaControls(address);
    cnt++;
    if (cnt > 30) break;
  }
  if (cnt < 30) {
    if (bth.selectedCtrl.ConnectedDevice.hasOwnProperty('batCtrl')) {
      await getBluealsaBattery();
      // periodically update battery level
      if (btUpdateBatteryTimer) clearTimeout(btUpdateBatteryTimer);
      btUpdateBatteryTimer = setTimeout(updateBattery, 60000);
    }
    await getBluealsaVolume();
    await saveLastDeviceConnected(address);
    await setDefaultVolume(address);
    btEvent.emit(events.DEV_AVAILABLE, address);
  } else {
    log.error("didn't find any bluealsa controls");
  }
})

btEvent.on(events.DEV_AVAILABLE, async address => {
  log.info(`device ${address} provisioned and available`);
})

btEvent.on(events.DEV_DISCONNECTED, async address => {
  log.info(`device ${address} disconnected`);
  let dev = bth.devices.find(item => item.Address == address);
  if (dev.batCtrl) delete dev.batCtrl;
  if (dev.battery) delete dev.battery;
  if (dev.volCtrl) delete dev.volCtrl;
  if (dev.volume) delete dev.volume;
  if (dev.mute) delete dev.mute;
  await btWait(200);
  if (bth.selectedCtrl.Powered == 'yes') btAvailForConn();
})

export default {
  bluetoothctlStart: bluetoothctlStart,
  bluetoothctlStop: bluetoothctlStop,
  cmd: bluetoothctlInput,
  event: btEvent,
  events: events,
  status: () => bth,
  getLog: () => bthLog,
  volumeSet: volumeSet,
  volumeInc: volumeInc,
  volumeDec: volumeDec,
  volumeMute: volumeMute,
  btReset: bluetoothctlStart
};