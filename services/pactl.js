import log from './logger.js';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Derive the PipeWire sink name from a Bluetooth MAC address.
 * e.g. "01:15:21:47:16:D4" → "bluez_output.01_15_21_47_16_D4.a2dp_sink"
 */
const btSinkName = (address) =>
  // `bluez_output.${address.replaceAll(':', '_')}.a2dp_sink`;
  `bluez_output.${address.replaceAll(':', '_')}.1`;

/**
 * Run a pactl command, return { stdout, stderr, exitCode }.
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
 *
 * Example pactl output:
 *   Volume: front-left: 39320 /  60% / -13.31 dB,   front-right: 39320 /  60% / -13.31 dB
 *   Volume: mono: 65536 / 100% / 0.00 dB
 */
const parseVolume = (raw) => {
  const pct = [...raw.matchAll(/(\d+)%/g)].map(m => m[1]);
  if (pct.length === 0) throw new Error(`Cannot parse volume from: ${raw}`);
  const left  = pct[0] + '%';
  const right = (pct[1] ?? pct[0]) + '%';
  const avg   = Math.round((parseInt(pct[0]) + parseInt(pct[1] ?? pct[0])) / 2) + '%';
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
    pactlRun('get-sink-mute',   sink),
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
 * PipeWire does not support per-channel relative increments via pactl, so for
 * balance adjustments we read current levels and compute the new absolute value.
 */
const volumeInc = async (channel = 'both', sink = '@DEFAULT_SINK@') => {
  if (channel === 'both') {
    await pactlRun('set-sink-volume', sink, '+1%');
  } else {
    const cur = await volumeGet(sink);
    const l = parseInt(cur.volumeLeft);
    const r = parseInt(cur.volumeRight);
    const newL = channel === 'frontleft'  ? Math.min(100, l + 1) : l;
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
    const newL = channel === 'frontleft'  ? Math.max(0, l - 1) : l;
    const newR = channel === 'frontright' ? Math.max(0, r - 1) : r;
    await pactlRun('set-sink-volume', sink, `${newL}%`, `${newR}%`);
  }
  return volumeGet(sink);
};

/**
 * Mute or unmute.  val: "mute" | "unmute"
 */
const volumeMute = async (val, sink = '@DEFAULT_SINK@') => {
  console.log(`volumeMute(${val}, ${sink})`);
  if (val !== 'mute' && val !== 'unmute') throw new Error(`Invalid mute value: ${val}`);
  await pactlRun('set-sink-mute', sink, val === 'mute' ? '1' : '0');
  return volumeGet(sink);
};

/**
 * Switch the active output.  Both MPD (pulse, no device) and the volume
 * functions above target @DEFAULT_SINK@, so this one call reroutes everything.
 *
 * sinkName: full PipeWire sink name, e.g.
 *   btSinkName("01:15:21:47:16:D4")
 *   "alsa_output.usb-Generic_iStore_Audio_20210726905926-00.analog-stereo"
 */
const setDefaultSink = async (sinkName) => {
  await pactlRun('set-default-sink', sinkName);
  log.info(`default sink → ${sinkName}`);
};

export default {
  btSinkName,
  volumeGet,
  volumeSet,
  volumeInc,
  volumeDec,
  volumeMute,
  setDefaultSink,
};