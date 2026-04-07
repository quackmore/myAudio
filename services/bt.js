import log from './logger.js';
import config from 'config';
import cfgfile from './cfgfile.js';
import stripAnsi from 'strip-ansi';
import EventEmitter from 'events';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Public event constants
// ---------------------------------------------------------------------------

const btEvents = {
  CONTROLLER_POWERED_ON: 'controller_powered_on',   // { address }
  CONTROLLER_POWERED_OFF: 'controller_powered_off',  // { address }
  DEVICE_FOUND: 'device_found',             // { address, name }
  DEVICE_CONNECTED: 'device_connected',         // { address, name }
  DEVICE_DISCONNECTED: 'device_disconnected',      // { address }
  DEVICE_REMOVED: 'device_removed',           // { address }
  DEVICE_BATTERY_CHANGED: 'device_battery_changed',  // { address, battery }
};

// ---------------------------------------------------------------------------
// BtService
// ---------------------------------------------------------------------------

class BtService extends EventEmitter {

  // ── private state ─────────────────────────────────────────────────────────

  #proc = null;   // bluetoothctl child process
  #restarting = false;  // false = intentional stop
  #logBuffer = [];     // rolling log ring
  #logMaxLen = 100;

  // parsed BT world
  #controllers = [];     // [{ Address, Name, Powered, Pairable, Discoverable, Discovering }]
  #selectedCtrl = null;   // reference into #controllers
  #devices = [];     // [{ Address, Name, Icon, Paired, Trusted, Connected, battery? }]

  // per-session parsing context
  #pendingCommand = null;   // command whose response we are currently reading
  #lastCtrlAddress = null;   // address context for multi-line controller output
  #lastDevAddress = null;   // address context for multi-line device output

  // battery polling
  #batteryTimer = null;   // setInterval handle, active only while a device is connected
  #batteryPollMs = 60000; // poll every 60 s

  // ── public lifecycle ──────────────────────────────────────────────────────

  start() {
    if (this.#proc) this.stop();
    this.#restarting = true;
    this.#spawn();
  }

  stop() {
    this.#restarting = false;
    this.#stopBatteryTimer();
    if (this.#proc) {
      this.#proc.kill('SIGINT');
      this.#proc = null;
    }
  }

  /** Send a raw command string to bluetoothctl stdin. */
  cmd(command) {
    log.info(`bluetoothctl ← ${command}`);
    if (this.#proc) this.#proc.stdin.write(command + '\n');
    // after a power toggle, refresh controller state
    if (command.includes('power')) {
      setTimeout(() => this.#sendCmd('show'), 2000);
    }
  }

  /** Reset by restarting the bluetoothctl process. */
  reset() {
    this.start();
  }

  /** Snapshot of current BT state (used by /bt/status route). */
  status() {
    return {
      controllers: this.#controllers,
      selectedCtrl: this.#selectedCtrl,
      devices: this.#devices,
    };
  }

  /** Rolling log (used by /bt/log route). */
  getLog() {
    return [...this.#logBuffer];
  }

  // ── private: process management ───────────────────────────────────────────

  #spawn() {
    const proc = spawn('bluetoothctl');
    this.#proc = proc;

    // reset world state for a fresh session
    this.#controllers = [];
    this.#selectedCtrl = null;
    this.#devices = [];
    this.#pendingCommand = null;
    this.#lastCtrlAddress = null;
    this.#lastDevAddress = null;

    proc.stdout.on('data', (data) => {
      const cleaned = stripAnsi(data.toString()).replace(/\u0001|\u0002/g, '');
      for (const line of cleaned.split(/\n|\r/)) {
        const trimmed = line.trim();
        if (trimmed) this.#parseLine(trimmed);
      }
    });

    proc.stderr.on('data', (data) => {
      log.warn(`bluetoothctl stderr: ${data.toString().trim()}`);
    });

    proc.on('close', (code) => {
      this.#proc = null;
      if (!this.#restarting) return;
      log.warn(`bluetoothctl exited (${code}), restarting in 2s`);
      setTimeout(() => this.#spawn(), 2000);
    });

    log.info('bluetoothctl started');
    this.#init();
  }

  /** Initial interrogation sequence after process start. */
  async #init() {
    await this.#sleep(500);
    this.#sendCmd('list');
    await this.#sleep(800);
    if (this.#selectedCtrl) {
      this.#sendCmd(`show ${this.#selectedCtrl.Address}`);
    }
    await this.#sleep(800);
    this.#sendCmd('devices');
    await this.#sleep(800);
    // query info for each already-known device
    for (const dev of [...this.#devices]) {
      this.#sendCmd(`info ${dev.Address}`);
      await this.#sleep(600);
    }
    // if powered on, start scanning
    if (this.#selectedCtrl?.Powered === 'yes') {
      this.#scanOn();
    }
  }

  /** Internal cmd helper — does not trigger the power-refresh side effect. */
  #sendCmd(command) {
    this.#pendingCommand = command.split(' ')[0]; // e.g. 'show', 'devices', 'info'
    if (this.#proc) this.#proc.stdin.write(command + '\n');
  }

  // ── private: line parser ──────────────────────────────────────────────────

  #parseLine(line) {
    this.#log(line);

    // ── async event lines ──────────────────────────────────────────────────
    if (line.startsWith('[NEW]')) { this.#handleNew(line); return; }
    if (line.startsWith('[CHG]')) { this.#handleChg(line); return; }
    if (line.startsWith('[DEL]')) { this.#handleDel(line); return; }

    // ── command echo lines — set parsing context ───────────────────────────
    // bluetoothctl echoes the command back before its response
    const cmdEchoes = ['list', 'show', 'select', 'devices', 'info'];
    for (const kw of cmdEchoes) {
      if (line.startsWith(kw)) {
        this.#pendingCommand = kw;
        return;
      }
    }

    // ── response lines — route to appropriate handler ─────────────────────
    if (!this.#pendingCommand) return;

    switch (this.#pendingCommand) {
      case 'list':
      case 'show':
      case 'select':
        this.#applyControllerLine(line);
        break;
      case 'devices':
        this.#applyDevicesLine(line);
        break;
      case 'info':
        this.#applyDeviceLine(line);
        break;
    }
  }

  // ── private: [NEW] / [CHG] / [DEL] handlers ──────────────────────────────

  #handleNew(line) {
    // [NEW] Device AA:BB:CC:DD:EE:FF Friendly Name
    if (!line.includes('Device')) return;
    const parts = line.split(' ');
    const address = parts[2];
    const name = parts.slice(3).join(' ');
    if (!this.#deviceByAddress(address)) {
      this.#devices.push({ Address: address, Name: name });
      log.info(`device found: ${address} (${name})`);
      this.emit(btEvents.DEVICE_FOUND, { address, name });
      // fetch full info shortly after
      setTimeout(() => this.#sendCmd(`info ${address}`), 500);
    }
  }

  #handleChg(line) {
    // [CHG] Controller AA:BB:CC:DD:EE:FF Property: value
    // [CHG] Device     AA:BB:CC:DD:EE:FF Property: value
    const parts = line.split(' ');
    const kind = parts[1];   // 'Controller' or 'Device'
    const address = parts[2];
    const rest = parts.slice(3).join(' ');  // "Property: value"

    if (kind === 'Controller') {
      this.#lastCtrlAddress = address;
      this.#applyControllerLine(rest);
    } else if (kind === 'Device') {
      this.#lastDevAddress = address;
      this.#applyDeviceLine(rest);
    }
  }

  #handleDel(line) {
    // [DEL] Device AA:BB:CC:DD:EE:FF Friendly Name
    if (!line.includes('Device')) return;
    const address = line.split(' ')[2];
    this.#devices = this.#devices.filter(d => d.Address !== address);
    log.info(`device removed: ${address}`);
    this.emit(btEvents.DEVICE_REMOVED, { address });
  }

  // ── private: state appliers ───────────────────────────────────────────────

  /** Apply a single property line to a controller record. */
  #applyControllerLine(line) {
    // "Controller AA:BB:CC:DD:EE:FF [default]"  — introduces a controller
    if (line.startsWith('Controller')) {
      const parts = line.split(' ');
      const address = parts[1];
      this.#lastCtrlAddress = address;
      if (!this.#controllerByAddress(address)) {
        this.#controllers.push({ Address: address, ConnectedDevice: null });
      }
      if (line.includes('[default]')) {
        this.#selectedCtrl = this.#controllerByAddress(address);
      }
      return;
    }

    const ctrl = this.#controllerByAddress(this.#lastCtrlAddress);
    if (!ctrl) return;

    const [key, ...valParts] = line.split(':');
    const val = valParts.join(':').trim();

    switch (key.trim()) {
      case 'Name': ctrl.Name = val; break;
      case 'Pairable': ctrl.Pairable = val; break;
      case 'Discovering': ctrl.Discovering = val; break;
      case 'Discoverable': ctrl.Discoverable = val; break;
      case 'Powered': {
        const prev = ctrl.Powered;
        ctrl.Powered = val;
        if (val === 'yes' && prev !== 'yes') {
          log.info(`controller ${ctrl.Address} powered on`);
          this.emit(btEvents.CONTROLLER_POWERED_ON, { address: ctrl.Address });
          this.#scanOn();
        }
        if (val === 'no' && prev === 'yes') {
          log.info(`controller ${ctrl.Address} powered off`);
          this.emit(btEvents.CONTROLLER_POWERED_OFF, { address: ctrl.Address });
          this.#scanOff();
          if (ctrl.ConnectedDevice) {
            ctrl.ConnectedDevice = null;
          }
        }
        break;
      }
    }
  }

  /** Apply a single property line to a device record. */
  #applyDeviceLine(line) {
    // "Device AA:BB:CC:DD:EE:FF"  — introduces a device context in info output
    if (line.startsWith('Device')) {
      const address = line.split(' ')[1];
      this.#lastDevAddress = address;
      if (!this.#deviceByAddress(address)) {
        this.#devices.push({ Address: address });
      }
      return;
    }

    const dev = this.#deviceByAddress(this.#lastDevAddress);
    if (!dev) return;

    const [key, ...valParts] = line.split(':');
    const val = valParts.join(':').trim();

    switch (key.trim()) {
      case 'Name': if (!line.includes('is nil')) dev.Name = val; break;
      case 'Icon': dev.Icon = val; break;
      case 'Blocked': dev.Blocked = val; break;
      case 'Paired': dev.Paired = val; break;
      case 'Trusted': dev.Trusted = val; break;
      case 'RSSI': dev.RSSI = val; break;
      case 'Battery Percentage': {
        // val is e.g. "0x50 (80)" — extract the decimal part
        const match = val.match(/\((\d+)\)/);
        if (match) {
          const battery = `${match[1]}%`;
          dev.battery = battery;
          log.info(`battery ${dev.Address}: ${battery}`);
          this.emit(btEvents.DEVICE_BATTERY_CHANGED, { address: dev.Address, battery });
        }
        break;
      }
      case 'Connected': {
        if (dev.Connected === val) break; // no change
        dev.Connected = val;
        if (val === 'yes' && this.#selectedCtrl) {
          this.#selectedCtrl.ConnectedDevice = dev;
          log.info(`device connected: ${dev.Address}`);
          this.emit(btEvents.DEVICE_CONNECTED, { address: dev.Address, name: dev.Name });
          this.#onDeviceConnected(dev);
        }
        if (val === 'no' && this.#selectedCtrl?.ConnectedDevice?.Address === dev.Address) {
          this.#selectedCtrl.ConnectedDevice = null;
          log.info(`device disconnected: ${dev.Address}`);
          this.emit(btEvents.DEVICE_DISCONNECTED, { address: dev.Address });
          this.#onDeviceDisconnected(dev);
        }
        break;
      }
    }
  }

  /** Parse a "devices" command response line: "Device AA:BB:CC:DD Friendly Name" */
  #applyDevicesLine(line) {
    if (!line.startsWith('Device')) return;
    const parts = line.split(' ');
    const address = parts[1];
    const name = parts.slice(2).join(' ');
    if (!this.#deviceByAddress(address)) {
      this.#devices.push({ Address: address, Name: name });
    }
  }

  // ── private: connection lifecycle helpers ─────────────────────────────────

  async #onDeviceConnected(dev) {
    await this.#saveLastConnected(dev.Address);
    this.#scanOff();
    this.#startBatteryTimer(dev.Address);
  }

  async #onDeviceDisconnected(dev) {
    this.#stopBatteryTimer();
    if (dev.battery) delete dev.battery;
    await this.#sleep(200);
    if (this.#selectedCtrl?.Powered === 'yes') this.#scanOn();
  }

  // ── private: battery polling ──────────────────────────────────────────────

  /**
   * Start a periodic timer that queries `info <address>` every #batteryPollMs.
   * The response feeds through the existing #applyDeviceLine → DEVICE_BATTERY_CHANGED
   * pipeline, so no extra parsing is needed here.
   * BlueZ may also push [CHG] Battery Percentage lines spontaneously; the timer
   * catches devices that don't push proactively.
   */
  #startBatteryTimer(address) {
    this.#stopBatteryTimer();
    log.info(`battery poll started for ${address} (every ${this.#batteryPollMs / 1000}s)`);
    const batteryFirstPollMs = config.has('bt.btBatteryFirstPollMs')
      ? config.get('bt.btBatteryFirstPollMs')
      : 3000; // 4s is usually enough for BlueZ to negotiate the battery service

    // First read: short delay to let BlueZ expose the battery interface
    const firstRead = setTimeout(() => {
      if (!this.#proc) return;
      this.#sendCmd(`info ${address}`);
      // Then settle into the regular cadence
      this.#batteryTimer = setInterval(() => {
        if (!this.#proc) return;
        this.#sendCmd(`info ${address}`);
      }, this.#batteryPollMs);
    }, batteryFirstPollMs);

    // Store the firstRead handle so #stopBatteryTimer can cancel it too
    this.#batteryTimer = firstRead;
  }

  #stopBatteryTimer() {
    if (this.#batteryTimer) {
      clearInterval(this.#batteryTimer);
      this.#batteryTimer = null;
      log.info('battery poll stopped');
    }
  }

  // ── private: scanning ─────────────────────────────────────────────────────

  async #scanOn() {
    await this.#sleep(200);
    this.#sendCmd('discoverable on');
    if (this.#selectedCtrl?.Pairable === 'no') {
      await this.#sleep(200);
      this.#sendCmd('pairable on');
    }
    await this.#sleep(200);
    this.#sendCmd('scan on');
  }

  #scanOff() {
    if (this.#selectedCtrl?.Pairable === 'yes') {
      this.#sendCmd('discoverable off');
    }
    this.#sendCmd('scan off');
  }

  // ── private: persistence ──────────────────────────────────────────────────

  async #saveLastConnected(address) {
    try {
      const content = await cfgfile.read();
      if (!content.bt) content.bt = {};
      if (content.bt.lastConnected === address) return;
      content.bt.lastConnected = address;
      await cfgfile.save(content);
      log.info(`last connected device saved: ${address}`);
    } catch (err) {
      log.error(`failed to save last connected device: ${err.message}`);
    }
  }

  // ── private: lookup helpers ───────────────────────────────────────────────

  #controllerByAddress(address) {
    return this.#controllers.find(c => c.Address === address) ?? null;
  }

  #deviceByAddress(address) {
    return this.#devices.find(d => d.Address === address) ?? null;
  }

  // ── private: logging ──────────────────────────────────────────────────────

  #log(line) {
    if (this.#logBuffer.length >= this.#logMaxLen) this.#logBuffer.shift();
    this.#logBuffer.push(line);
  }

  // ── private: utilities ────────────────────────────────────────────────────

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const btService = new BtService();

export default btService;
export { btService, btEvents };