import express from 'express';
import log from '../services/logger.js';
import { speakersService, speakersEvents } from '../services/speakers.js';
import { btService, btEvents } from '../services/bt.js';
import { pactlService, PactlEvents } from '../services/pactl.js';
import { mpdService, MpdEvents } from '../services/mpd.js';

const router = express.Router();

/**
 * Server-Sent Events endpoint.
 * Streams real-time Bluetooth, audio and MPD events to connected clients.
 */
router.get('/', (req, res) => {

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (type, data) => {
    log.debug(`Sending event: ${type}`, data);
    res.write('data: ' + JSON.stringify({ type, data, timestamp: Date.now() }) + '\n\n');
  };

  // send connection confirmation — client uses this to trigger a status refresh
  sendEvent('connected', {});
  log.info('SSE client connected');

  // ── Speakers handlers ────────────────────────────────────────────────────

  const onSpeakersPoweredOn  = (val) => sendEvent('speakers_powered_on',  val);
  const onSpeakersPoweredOff = (val) => sendEvent('speakers_powered_off', val);

  speakersService.on(speakersEvents.SPEAKERS_POWERED_ON,  onSpeakersPoweredOn);
  speakersService.on(speakersEvents.SPEAKERS_POWERED_OFF, onSpeakersPoweredOff);

  // ── Bluetooth handlers ───────────────────────────────────────────────────

  const onControllerPoweredOn  = ({ address }) => sendEvent('bt_controller_powered_on',  { address });
  const onControllerPoweredOff = ({ address }) => sendEvent('bt_controller_powered_off', { address });
  const onDeviceFound          = ({ address, name }) => sendEvent('bt_device_found',      { address, name });
  const onDeviceConnected      = ({ address, name }) => sendEvent('bt_device_connected',  { address, name });
  const onDeviceDisconnected   = ({ address }) => sendEvent('bt_device_disconnected',     { address });
  const onDeviceRemoved        = ({ address }) => sendEvent('bt_device_removed',          { address });
  const onBatteryChanged       = ({ address, battery }) => sendEvent('bt_battery_changed', { address, battery });

  btService.on(btEvents.CONTROLLER_POWERED_ON,  onControllerPoweredOn);
  btService.on(btEvents.CONTROLLER_POWERED_OFF, onControllerPoweredOff);
  btService.on(btEvents.DEVICE_FOUND,           onDeviceFound);
  btService.on(btEvents.DEVICE_CONNECTED,       onDeviceConnected);
  btService.on(btEvents.DEVICE_DISCONNECTED,    onDeviceDisconnected);
  btService.on(btEvents.DEVICE_REMOVED,         onDeviceRemoved);
  btService.on(btEvents.DEVICE_BATTERY_CHANGED, onBatteryChanged);

  // ── Pactl handlers ───────────────────────────────────────────────────────

  const onVolumeChanged      = (vol)         => sendEvent('volume_changed',       vol);
  const onDefaultSinkChanged = (defaultSink) => sendEvent('default_sink_changed', defaultSink);

  pactlService.on(PactlEvents.VOLUME_CHANGED,       onVolumeChanged);
  pactlService.on(PactlEvents.DEFAULT_SINK_CHANGED, onDefaultSinkChanged);

  // ── MPD handlers ─────────────────────────────────────────────────────────

  const onMpdStateChanged          = (data) => sendEvent('mpd_state_changed',           data);
  const onMpdOptionsChanged        = (data) => sendEvent('mpd_options_changed',         data);
  const onMpdQueueChanged          = (data) => sendEvent('mpd_queue_changed',           data);
  const onMpdStoredPlaylistChanged = ()     => sendEvent('mpd_stored_playlist_changed',  {});

  mpdService.on(MpdEvents.STATE_CHANGED,           onMpdStateChanged);
  mpdService.on(MpdEvents.OPTIONS_CHANGED,         onMpdOptionsChanged);
  mpdService.on(MpdEvents.QUEUE_CHANGED,           onMpdQueueChanged);
  mpdService.on(MpdEvents.STORED_PLAYLIST_CHANGED, onMpdStoredPlaylistChanged);

  // ── Cleanup on disconnect ────────────────────────────────────────────────

  req.on('close', () => {
    log.info('SSE client disconnected');

    speakersService.off(speakersEvents.SPEAKERS_POWERED_ON,  onSpeakersPoweredOn);
    speakersService.off(speakersEvents.SPEAKERS_POWERED_OFF, onSpeakersPoweredOff);

    btService.off(btEvents.CONTROLLER_POWERED_ON,  onControllerPoweredOn);
    btService.off(btEvents.CONTROLLER_POWERED_OFF, onControllerPoweredOff);
    btService.off(btEvents.DEVICE_FOUND,           onDeviceFound);
    btService.off(btEvents.DEVICE_CONNECTED,       onDeviceConnected);
    btService.off(btEvents.DEVICE_DISCONNECTED,    onDeviceDisconnected);
    btService.off(btEvents.DEVICE_REMOVED,         onDeviceRemoved);
    btService.off(btEvents.DEVICE_BATTERY_CHANGED, onBatteryChanged);

    pactlService.off(PactlEvents.VOLUME_CHANGED,       onVolumeChanged);
    pactlService.off(PactlEvents.DEFAULT_SINK_CHANGED, onDefaultSinkChanged);

    mpdService.off(MpdEvents.STATE_CHANGED,           onMpdStateChanged);
    mpdService.off(MpdEvents.OPTIONS_CHANGED,         onMpdOptionsChanged);
    mpdService.off(MpdEvents.QUEUE_CHANGED,           onMpdQueueChanged);
    mpdService.off(MpdEvents.STORED_PLAYLIST_CHANGED, onMpdStoredPlaylistChanged);

    res.end();
  });

  // ── Keep-alive ping ──────────────────────────────────────────────────────

  const keepAlive = setInterval(() => res.write(':ping\n\n'), 30_000);
  req.on('close', () => clearInterval(keepAlive));
});

export default router;