import log from './logger.js';
import cfgfile from './cfgfile.js';
import stripAnsi from 'strip-ansi';
import EventEmitter from 'events';
import { spawn } from "child_process";
import cfg from 'config';
import pactl from './pactl.js';

var bth = null;

const bthLogMaxLen = 100;
var bthLog = [];

const bthLogger = (line) => {
  if (bthLog.length == bthLogMaxLen) bthLog.shift();
  bthLog.push(line);
}

var btTimer = null;
var btUpdateBatteryTimer = null;

const btWait = (ms) => new Promise((resolve, reject) => {
  btTimer = setTimeout(resolve, ms);
});

const getBattery = async () => {
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  if (BTdevice == null) return;
  BTdevice.battery = '--';
  if (!cfg.has('player.bt_battery')) return;
  let bthCmd = spawn("python3", [`${cfg.get('player.bt_battery')}`, `${BTdevice.Address}`]);
  let data = "";
  for await (const chunk of bthCmd.stdout)
    data += chunk;
  for (let line of data.toString().split('\n')) {
    if (line.toString().includes("Battery level")) {
      BTdevice.battery = line.toString().split(":")[1];
      log.info(`Battery level: ${BTdevice.battery}`);
    }
    if (line.toString().includes("Address")) {
      let addr = line.toString().slice(line.toString().indexOf(':') + 1);
      log.info(`Querying ${addr} for battery level`);
    }
    if (line.toString().includes("Port")) {
      let port = line.toString().split(":")[1];
      log.info(`${BTdevice.Address} replied on port ${port}`);
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
    let msg = `<python3 ${cfg.get(player.bt_battery)} ${BTdevice.Address}> got ${data} - ${error}`;
    log.error(msg);
  }
}

const updateBattery = async () => {
  if (bth.selectedCtrl.ConnectedDevice) {
    await getBattery();
    if (btUpdateBatteryTimer == null)
      btUpdateBatteryTimer = setInterval(updateBattery, 60000);
  }
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

const controllerScanOn = async () => {
  await btWait(200);
  bluetoothctlInput('discoverable on');
  if (bth.selectedCtrl.Pairable && bth.selectedCtrl.Pairable == 'no') {
    await btWait(200);
    bluetoothctlInput('pairable on');
  }
  await btWait(200);
  bluetoothctlInput('scan on');
}

const controllerScanOff = async () => {
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
  if (btTimer) {
    clearTimeout(btTimer);
    btTimer = null;
  }
})

btEvent.on(events.BT_POWERON, async () => {
  log.info("BT powered on...");
  controllerScanOn();
})

btEvent.on(events.BT_POWEROFF, () => {
  log.info("BT powered off...");
  controllerScanOff();
  if (bth.selectedCtrl != null && bth.selectedCtrl.ConnectedDevice != null) {
    bth.selectedCtrl.ConnectedDevice = null;
    clearInterval(btUpdateBatteryTimer);
    btUpdateBatteryTimer = null;
  }
})

btEvent.on(events.DEV_CONNECTED, async address => {
  log.info(`device ${address} connected`);
  await saveLastDeviceConnected(address);
  let BTdevice = bth.selectedCtrl.ConnectedDevice;
  await btWait(5000);
  await pactl.setDefaultSink(pactl.btSinkName(address));
  btEvent.emit(events.DEV_AVAILABLE, address);
  controllerScanOff();
  await updateBattery();
})

btEvent.on(events.DEV_AVAILABLE, async address => {
  log.info(`device ${address} provisioned and available`);
})

btEvent.on(events.DEV_DISCONNECTED, async address => {
  log.info(`device ${address} disconnected`);
  let dev = bth.devices.find(item => item.Address == address);
  if (dev.battery) delete dev.battery;
  clearInterval(btUpdateBatteryTimer);
  btUpdateBatteryTimer = null;
  await btWait(200);
  if (bth.selectedCtrl.Powered == 'yes') controllerScanOn();
})

export default {
  bluetoothctlStart: bluetoothctlStart,
  bluetoothctlStop: bluetoothctlStop,
  cmd: bluetoothctlInput,
  event: btEvent,
  events: events,
  status: () => bth,
  getLog: () => bthLog,
  btReset: bluetoothctlStart
};