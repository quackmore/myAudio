import log from './logger.js';
import config from 'config';
import { spawn } from 'child_process';
import EventEmitter from 'events';
import { btService, btEvents } from './bt.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Derive the PipeWire sink name from a Bluetooth MAC address.
 * e.g. "01:15:21:47:16:D4" → "bluez_output.01_15_21_47_16_D4.1"
 */
const btSinkName = (address) =>
  `bluez_output.${address.replaceAll(':', '_')}.1`;

/**
 * Derive the PipeWire sink type from the sink name.
 */
const sinkType = (name) =>
  name.startsWith('bluez_output') ? 'bt' : 'speakers';

/**
 * Run a pactl command, return stdout as a string.
 */
const pactlRun = async (...args) => {
  const cmd = spawn('pactl', args);
  let stdout = '';
  let stderr = '';
  for await (const chunk of cmd.stdout) stdout += chunk;
  for await (const chunk of cmd.stderr) stderr += chunk;
  const exitCode = await new Promise(resolve => cmd.on('close', resolve));
  if (exitCode) {
    const msg = `pactl ${args.join(' ')} → exit ${exitCode}: ${stderr.trim()}`;
    log.error(msg);
    throw new Error(msg);
  }
  return stdout;
};

/**
 * Parse the output of `pactl get-sink-volume` into a normalised object:
 *   { volumeLeft: "60%", volumeRight: "60%", volume: "60%" }
 *
 * Handles both stereo ("front-left / front-right") and mono ("mono") sinks.
 */
const parseVolume = (raw) => {
  const pct = [...raw.matchAll(/(\d+)%/g)].map(m => m[1]);
  if (pct.length === 0) throw new Error(`Cannot parse volume from: ${raw}`);
  const left = pct[0] + '%';
  const right = (pct[1] ?? pct[0]) + '%';
  const avg = Math.round((parseInt(pct[0]) + parseInt(pct[1] ?? pct[0])) / 2) + '%';
  return { volumeLeft: left, volumeRight: right, volume: avg };
};

/**
 * Parse the output of `pactl get-sink-mute`:
 *   Mute: yes  →  "yes"
 *   Mute: no   →  "no"
 */
const parseMute = (raw) => (raw.includes('yes') ? 'yes' : 'no');

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * Read current volume and mute state for a sink.
 * Pass a sink name or omit / pass null to target @DEFAULT_SINK@.
 *
 * Returns: { volume, volumeLeft, volumeRight, mute }
 */
const volumeGet = async (sink = '@DEFAULT_SINK@') => {
  const [volRaw, muteRaw] = await Promise.all([
    pactlRun('get-sink-volume', sink),
    pactlRun('get-sink-mute', sink),
  ]);
  return { ...parseVolume(volRaw), mute: parseMute(muteRaw) };
};

/**
 * Set absolute volume.  value examples: "60%", "55% 65%" (left right)
 */
const volumeSet = async (value, sink = '@DEFAULT_SINK@') => {
  await pactlRun('set-sink-volume', sink, ...value.split(' '));
  return volumeGet(sink);
};

/**
 * Increment volume by 1% (optionally per-channel: 'frontleft' | 'frontright').
 */
const volumeInc = async (channel = 'both', sink = '@DEFAULT_SINK@') => {
  if (channel === 'both') {
    await pactlRun('set-sink-volume', sink, '+1%');
  } else {
    const cur = await volumeGet(sink);
    const l = parseInt(cur.volumeLeft);
    const r = parseInt(cur.volumeRight);
    const newL = channel === 'frontleft' ? Math.min(100, l + 1) : l;
    const newR = channel === 'frontright' ? Math.min(100, r + 1) : r;
    await pactlRun('set-sink-volume', sink, `${newL}%`, `${newR}%`);
  }
  return volumeGet(sink);
};

/**
 * Decrement volume by 1% (optionally per-channel).
 */
const volumeDec = async (channel = 'both', sink = '@DEFAULT_SINK@') => {
  if (channel === 'both') {
    await pactlRun('set-sink-volume', sink, '-1%');
  } else {
    const cur = await volumeGet(sink);
    const l = parseInt(cur.volumeLeft);
    const r = parseInt(cur.volumeRight);
    const newL = channel === 'frontleft' ? Math.max(0, l - 1) : l;
    const newR = channel === 'frontright' ? Math.max(0, r - 1) : r;
    await pactlRun('set-sink-volume', sink, `${newL}%`, `${newR}%`);
  }
  return volumeGet(sink);
};

/**
 * Mute or unmute.  val: "mute" | "unmute"
 */
const volumeMute = async (val, sink = '@DEFAULT_SINK@') => {
  if (val !== 'mute' && val !== 'unmute') throw new Error(`Invalid mute value: ${val}`);
  await pactlRun('set-sink-mute', sink, val === 'mute' ? '1' : '0');
  return volumeGet(sink);
};

/**
 * Switch the active output sink.  Both MPD (pulse, no device) and the volume
 * functions above target @DEFAULT_SINK@, so this one call reroutes everything.
 */
const setDefaultSink = async (sinkName) => {
  await pactlRun('set-default-sink', sinkName);
  log.info(`default sink → ${sinkName}`);
};

const getDefaultSink = async () => {
  const sinkName = (await pactlRun('get-default-sink')).trim();
  const type = sinkName === config.get('pactl.defaultSink') ? 'speakers' : 'bt';
  return { sinkName, type };
};

// ---------------------------------------------------------------------------
// Event emitter — consumers (SSE route) subscribe to these
// ---------------------------------------------------------------------------

const PactlEvents = {
  VOLUME_CHANGED: 'volume_changed',
  DEFAULT_SINK_CHANGED: 'default_sink_changed',
};

class PactlService extends EventEmitter {

  #watcherProc  = null;
  #restarting   = true;

  // When a BT device connects we store the sink name we are waiting for.
  // The subscribe watcher checks each new sink against this value and
  // switches immediately when it appears, cancelling the fallback timeout.
  #pendingBtSink        = null;   // string | null
  #pendingBtSinkTimeout = null;   // fallback setTimeout handle

  // Debounce handle for restoring the speakers sink after disconnect.
  #disconnectDebounce = null;

  // -------------------------------------------------------------------------
  // Watcher lifecycle
  // -------------------------------------------------------------------------

  startWatcher() {
    if (this.#watcherProc) return;
    this.#spawnWatcher();
  }

  stopWatcher() {
    this.#restarting = false;
    clearTimeout(this.#pendingBtSinkTimeout);
    clearTimeout(this.#disconnectDebounce);
    if (this.#watcherProc) {
      this.#watcherProc.kill();
      this.#watcherProc = null;
    }
  }

  #spawnWatcher() {
    const proc = spawn('pactl', ['subscribe']);
    this.#watcherProc = proc;

    let buf = '';

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();               // keep incomplete last line
      for (const line of lines)
        this.#handleSubscribeLine(line.trim());
    });

    proc.on('close', (code) => {
      this.#watcherProc = null;
      if (this.#restarting === false) return;
      log.warn(`pactl subscribe exited (${code}), restarting in 3s`);
      setTimeout(() => this.#spawnWatcher(), 3000);
    });

    this.#restarting = false;
    log.info('pactl subscribe watcher started');
  }

  // -------------------------------------------------------------------------
  // BT device connected — wait for sink to appear, then switch
  // -------------------------------------------------------------------------

  /**
   * Called when a BT device connects.
   *
   * Rather than sleeping a fixed duration, we arm #pendingBtSink with the
   * expected sink name.  #handleSubscribeLine watches for 'Event new on sink'
   * lines and — as soon as the bluez sink appears in `pactl list sinks short`
   * — switches immediately and cancels the fallback.
   *
   * A fallback timeout (default 15 s, configurable via pactl.btSinkTimeoutMs)
   * fires if PipeWire never emits the new-sink event (e.g. on slower hardware
   * or when subscribe restarts mid-negotiation).
   */
  onBtDeviceConnected({ address }) {
    // A new connection supersedes any pending speakers-restore from a disconnect.
    clearTimeout(this.#disconnectDebounce);
    this.#disconnectDebounce = null;
    // Cancel any leftover pending switch from a previous connect cycle.
    this.#cancelPendingBtSink();

    const sink      = btSinkName(address);
    const timeoutMs = config.has('pactl.btSinkTimeoutMs')
      ? config.get('pactl.btSinkTimeoutMs')
      : 15_000;

    log.info(`BT device connected (${address}), waiting for sink ${sink}`);
    this.#pendingBtSink = sink;

    // Fallback: if the sink-new event never arrives, try switching anyway.
    this.#pendingBtSinkTimeout = setTimeout(async () => {
      if (this.#pendingBtSink !== sink) return; // already handled
      log.warn(`sink ${sink} did not appear within ${timeoutMs}ms, switching anyway`);
      await this.#switchToBtSink(sink);
    }, timeoutMs);
  }

  // -------------------------------------------------------------------------
  // BT device disconnected — debounced restore of speakers sink
  // -------------------------------------------------------------------------

  /**
   * Called when a BT device disconnects.  A short debounce (default 3 s,
   * configurable via pactl.btDisconnectDebounceMs) avoids flipping the sink
   * back during transient BlueZ reconnect attempts.
   */
  onBtDeviceDisconnected() {
    // A new connect event arriving before the debounce fires will cancel this.
    clearTimeout(this.#disconnectDebounce);

    const debounceMs = config.has('pactl.btDisconnectDebounceMs')
      ? config.get('pactl.btDisconnectDebounceMs')
      : 3_000;

    log.info(`BT device disconnected, will restore speakers sink in ${debounceMs}ms`);

    this.#disconnectDebounce = setTimeout(async () => {
      const defaultSink = config.get('pactl.defaultSink');
      try {
        await setDefaultSink(defaultSink);
        this.emit(PactlEvents.DEFAULT_SINK_CHANGED, {
          sinkName: defaultSink,
          sinkType: 'speakers',
        });
      } catch (err) {
        log.error(`failed to restore speakers sink: ${err.message}`);
      }
    }, debounceMs);
  }

  // -------------------------------------------------------------------------
  // Internal: perform the actual BT sink switch
  // -------------------------------------------------------------------------

  async #switchToBtSink(sink) {
    this.#pendingBtSink = null;
    clearTimeout(this.#pendingBtSinkTimeout);
    this.#pendingBtSinkTimeout = null;
    try {
      await setDefaultSink(sink);
      this.emit(PactlEvents.DEFAULT_SINK_CHANGED, { sinkName: sink, sinkType: 'bt' });
    } catch (err) {
      log.error(`failed to switch to BT sink ${sink}: ${err.message}`);
    }
  }

  #cancelPendingBtSink() {
    this.#pendingBtSink = null;
    clearTimeout(this.#pendingBtSinkTimeout);
    this.#pendingBtSinkTimeout = null;
  }

  // -------------------------------------------------------------------------
  // Line parser
  // -------------------------------------------------------------------------

  /**
   * pactl subscribe emits lines like:
   *   Event 'change' on sink #0
   *   Event 'new'    on sink #3          ← new sink registered (e.g. BT A2DP)
   *   Event 'remove' on sink #3          ← sink unregistered
   *   Event 'change' on server #0        ← default sink changed
   *   Event 'new'    on sink-input #3    ← NOT a sink, ignore
   */
  #volumeDebounceTimer = null;

  async #handleSubscribeLine(line) {
    if (!line) return;

    const isSinkNew    = /Event 'new' on sink #/.test(line);
    const isSinkChange = /Event 'change' on sink #/.test(line);
    const isServerChg  = /Event 'change' on server #/.test(line);

    // ── New sink appeared — check if it's the BT sink we are waiting for ──
    if (isSinkNew && this.#pendingBtSink) {
      try {
        // `pactl list sinks short` outputs tab-separated lines:
        //   <index>\t<name>\t<module>\t<sample-spec>\t<state>
        const raw   = await pactlRun('list', 'sinks', 'short');
        const names = raw.split('\n').map(l => l.split('\t')[1]).filter(Boolean);
        if (names.includes(this.#pendingBtSink)) {
          log.info(`sink ${this.#pendingBtSink} appeared in PipeWire, switching now`);
          await this.#switchToBtSink(this.#pendingBtSink);
        }
      } catch (err) {
        log.error(`pactl watcher: failed to list sinks — ${err.message}`);
      }
      return;
    }

    // ── Default sink changed (server event) ───────────────────────────────
    if (isServerChg) {
      try {
        const sinkName   = (await pactlRun('get-default-sink')).trim();
        const defaultSink = { sinkName, sinkType: sinkType(sinkName) };
        this.emit(PactlEvents.DEFAULT_SINK_CHANGED, defaultSink);
        log.info(`default_sink_changed → ${JSON.stringify(defaultSink)}`);
      } catch (err) {
        log.error(`pactl watcher: failed to read default sink — ${err.message}`);
      }
      return;
    }

    // ── Sink volume/state changed — debounce and emit ─────────────────────
    if (isSinkChange) {
      clearTimeout(this.#volumeDebounceTimer);
      this.#volumeDebounceTimer = setTimeout(async () => {
        try {
          const vol = await volumeGet();
          this.emit(PactlEvents.VOLUME_CHANGED, vol);
          log.info(`volume_changed → ${JSON.stringify(vol)}`);
        } catch (err) {
          log.error(`pactl watcher: failed to read volume — ${err.message}`);
        }
      }, 300);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const pactlService = new PactlService();

btService.on(btEvents.DEVICE_CONNECTED,    ({ address }) => {
  pactlService.onBtDeviceConnected({ address });
});

btService.on(btEvents.DEVICE_DISCONNECTED, () => {
  pactlService.onBtDeviceDisconnected();
});

setDefaultSink(config.get('pactl.defaultSink'));

export default {
  btSinkName,
  volumeGet,
  volumeSet,
  volumeInc,
  volumeDec,
  volumeMute,
  setDefaultSink,
  getDefaultSink,
  startWatcher: () => pactlService.startWatcher(),
  stopWatcher:  () => pactlService.stopWatcher(),
};

// named export for SSE route to subscribe
export { pactlService, PactlEvents };