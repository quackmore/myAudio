const log = require('../logger')
const { spawn } = require("child_process");

/*
get power status
get device info

bluetoothctl power on
bluetoothctl devices

bluetoothctl scan on

bluetoothctl agent on
bluetoothctl pair/trust <MAC address>
bluetoothctl connect <MAC address>

bluetoothctl scan off

*/

var scan_status = {
  inProgress: false
};

module.exports = {
  status: async () => {
    const bthCmd = spawn("bluetoothctl", ["show"]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let status = {};
    for (line of data.toString().split('\n')) {
      if (line.toString().includes("Controller"))
        status.Powered = line.toString().split(' ')[1];
      if (line.toString().includes("Powered"))
        status.Powered = line.toString().split(': ')[1];
      if (line.toString().includes("Discovering"))
        status.Discovering = line.toString().split(': ')[1];
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    const exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `bluetoothctl show got ${data} - ${error}`;
      log.error(msg);
      throw new Error(msg);
    }
    return status;
  },
  statusChange: async ([attr, state]) => {
    // validate input
    if (attr !== "power" && attr != "scan") {
      let msg = `invalid argument ${attr}`;
      log.error(msg);
      throw new Error(msg);
    }
    if (attr === "power" && (state !== "on" && state != "off")) {
      let msg = `invalid argument ${state}`;
      log.error(msg);
      throw new Error(msg);
    }
    if (attr === "scan" && (state !== "on" && state != "off")) {
      let msg = `invalid argument ${state}`;
      log.error(msg);
      throw new Error(msg);
    }
    // scan has to be managed differently
    if (attr === "scan" && state === "on" && scan_status.inProgress) return "already scanning";
    if (attr === "scan" && state === "off" && scan_status.inProgress) {
      scan_status.childProcess.kill('SIGINT');
      scan_status.inProgress = false;
      return "done";
    }
    if (attr === "scan" && state === "off" && !scan_status.inProgress) return "not scanning";
    const bthCmd = spawn("bluetoothctl", [attr, state]);
    if (attr === "scan") {
      scan_status.childProcess = bthCmd;
      scan_status.inProgress = true;
      return "done";
    }
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let error = "";
    for await (const chunk of bthCmd.stderr)
      error += chunk;
    const exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `bluetoothctl ${attr} ${state} got ${data} - ${error}`;
      log.error(msg);
      throw new Error(msg);
    }
    return data;
  },
  devices: async () => {
    let bthCmd = spawn("bluetoothctl", ["devices"]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let devices = [];
    for (line of data.toString().split('\n')) {
      if (line.length < 7) continue;
      let device = {};
      // 95:8B:3A:57:3E:BA 
      device.address = line.toString().substring(7, 24);
      device.name = line.toString().substring(25);
      devices.push(device);
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `bluetoothctl devices got ${data} - ${error}`;
      log.error(msg);
      throw new Error(msg);
    }
    // end of "bluetoothctl devices"
    for (dev of devices) {
      bthCmd = spawn("bluetoothctl", ["info", dev.address]);
      data = "";
      for await (const chunk of bthCmd.stdout)
        data += chunk;
      for (line of data.toString().split('\n')) {
        if (line.toString().includes("Paired"))
          dev.paired = line.toString().split(': ')[1];
        if (line.toString().includes("Trusted"))
          dev.trusted = line.toString().split(': ')[1];
        if (line.toString().includes("Connected"))
          dev.connected = line.toString().split(': ')[1];
      }
      error = "";
      for await (const chunk of bthCmd.stderr) {
        error += chunk;
      }
      exitCode = await new Promise((resolve, reject) => {
        bthCmd.on('close', resolve);
      });

      if (exitCode) {
        let msg = `bluetoothctl info ${dev.address} got ${data} - ${error}`;
        log.error(msg);
        throw new Error(msg);
      }
    }
    // end of "bluetoothctl info <device>"
    for (dev of devices) {
      if (dev.connected === "yes") {
        bthCmd = spawn("amixer", ["-D", "bluealsa"]);
        data = "";
        for await (const chunk of bthCmd.stdout)
          data += chunk;
        if (data.toString().length > 10) {
          let batLevel = "";
          for (line of data.toString().split('\n')) {
            if (line.length < 2) continue;
            batLevel = line.toString();
          }
          dev.battery = batLevel.match(/\[(.*?)\]/)[1];
        } error = "";
        for await (const chunk of bthCmd.stderr) {
          error += chunk;
        }
        exitCode = await new Promise((resolve, reject) => {
          bthCmd.on('close', resolve);
        });

        if (exitCode) {
          let msg = `amixer -D bluealsa got ${data} - ${error}`;
          log.error(msg);
          throw new Error(msg);
        }
      }
    }
    return devices;
  },
  deviceConnect: async (address) => {
    let devs = await module.exports.devices();
    let foundDev = {};
    for (dev of devs) {
      if (dev.address === address) foundDev = dev;
      if (dev.connected === "yes") {
        if (dev.address === address)
          return "already connected";
        // disconnect device
        let bthCmd = spawn("bluetoothctl", ["disconnect", dev.address]);
        let data = "";
        for await (const chunk of bthCmd.stdout)
          data += chunk;
        console.log(data);
        let error = "";
        for await (const chunk of bthCmd.stderr) {
          error += chunk;
        }
        let exitCode = await new Promise((resolve, reject) => {
          bthCmd.on('close', resolve);
        });

        if (exitCode) {
          let msg = `attempting to disconnect ${dev.address} got ${data} - ${error}`;
          log.error(msg);
          throw new Error(msg);
        }
      }
    }
    if (Object.keys(foundDev).length === 0) return "invalid address";
    // trust device
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
        let msg = `attempting to trust ${address} got ${data} - ${error}`;
        log.error(msg);
        throw new Error(msg);
      }
    }
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
        let msg = `attempting to pair ${address} got ${data} - ${error}`;
        log.error(msg);
        throw new Error(msg);
      }
    }
    // connect device
    bthCmd = spawn("bluetoothctl", ["connect", address]);
    data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    error = "";
    for await (const chunk of bthCmd.stderr) {
      error += chunk;
    }
    exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `attempting to connect ${address} got ${data} - ${error}`;
      log.error(msg);
      throw new Error(msg);
    }
    return data;
  },
  deviceRemove: async (address) => {
    let devs = await module.exports.devices();
    let found = false;
    for (dev of devs)
      if (dev.address === address) found = true;
    if (!found) return "invalid address";
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
      let msg = `bluetoothctl remove ${address} got ${data} - ${error}`;
      log.error(msg);
      throw new Error(msg);
    }
    return data;
  }
};