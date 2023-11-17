const log = require('../logger')
const { spawn } = require("child_process");


module.exports = {
  isPowered: async () => {
    const bthCmd = spawn("bluetoothctl", ["show"]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let status = "undefined";
    for (line of data.toString().split('\n')) {
      if (line.toString().includes("Powered")) {
        if (line.toString().split(':')[1].includes("no"))
          status = "off";
        if (line.toString().split(':')[1].includes("yes"))
          status = "on";
      }
    }
    let error = "";
    for await (const chunk of bthCmd.stderr) {
      console.error('stderr chunk: ' + chunk);
      error += chunk;
    }
    const exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      throw new Error(`subprocess error exit ${exitCode}, ${error}`);
    }
    return status;
  },
  powerChange: async (newState) => {
    const bthCmd = spawn("bluetoothctl", ["power", newState]);
    let data = "";
    for await (const chunk of bthCmd.stdout)
      data += chunk;
    let error = "";
    for await (const chunk of bthCmd.stderr)
      error += chunk;
    console.log(error);
    const exitCode = await new Promise((resolve, reject) => {
      bthCmd.on('close', resolve);
    });

    if (exitCode) {
      throw new Error(`subprocess error exit ${exitCode}, ${data}`);
    }
    return data;
  },
  anotherOne: () => {
    const bthCmd = spawn("bluetoothctl", ["show"]);

    bthCmd.stdout.on("data", data => {
      for (line of data.toString().split('\n')) {
        if (line.includes("Powered")) {
          console.log(line.split(':')[1]);
          if (line.split(':')[1].includes("no"))
            return "off";
          else if (line.split(':')[1].includes("yes"))
            return "on";
          else
            return "undefined";
        }
      }
    });

    bthCmd.stderr.on("data", data => {
      log.error(`stderr: ${data}`);
    });

    bthCmd.on('error', (error) => {
      return `error: ${error.message}`;
    });

    bthCmd.on('close', (code) => {
      if (code !== 0)
        return
      console.log(`child process close all stdio with code ${code}`);
    });
  }

};