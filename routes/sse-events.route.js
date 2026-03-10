import express from 'express';
import btService, { BtEvents } from '../services/bt.js';
import log from '../services/logger.js';

const router = express.Router();

/**
 * Server-Sent Events (SSE) endpoint
 * Provides real-time updates for Bluetooth and other events
 */

router.get('/', (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // Send initial connection confirmation
  res.write('data: ' + JSON.stringify({ type: 'connected', timestamp: Date.now() }) + '\n\n');
  
  log.info('SSE client connected');
  
  // Helper to send SSE message
  const sendEvent = (type, data) => {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    res.write(`data: ${message}\n\n`);
  };
  
  /**
   * Bluetooth Event Handlers
   */
  
  const onControllerPoweredOn = ({ address }) => {
    sendEvent('bt_controller_powered_on', { address });
  };
  
  const onControllerPoweredOff = ({ address }) => {
    sendEvent('bt_controller_powered_off', { address });
  };
  
  const onDeviceFound = (device) => {
    sendEvent('bt_device_found', device);
  };
  
  const onDeviceConnected = (device) => {
    sendEvent('bt_device_connected', device);
  };
  
  const onDeviceDisconnected = ({ address }) => {
    sendEvent('bt_device_disconnected', { address });
  };
  
  const onDeviceRemoved = ({ address }) => {
    sendEvent('bt_device_removed', { address });
  };
  
  const onBatteryChanged = ({ address, battery }) => {
    sendEvent('bt_battery_changed', { address, battery });
  };
  
  const onVolumeChanged = ({ address, volume, volumeLeft, volumeRight, mute }) => {
    sendEvent('bt_volume_changed', { 
      address, 
      volume, 
      volumeLeft, 
      volumeRight, 
      mute 
    });
  };
  
  const onDeviceNameChanged = ({ address, name }) => {
    sendEvent('bt_device_name_changed', { address, name });
  };
  
  /**
   * Subscribe to Bluetooth events
   */
  btService.on(BtEvents.CONTROLLER_POWERED_ON, onControllerPoweredOn);
  btService.on(BtEvents.CONTROLLER_POWERED_OFF, onControllerPoweredOff);
  btService.on(BtEvents.DEVICE_FOUND, onDeviceFound);
  btService.on(BtEvents.DEVICE_CONNECTED, onDeviceConnected);
  btService.on(BtEvents.DEVICE_DISCONNECTED, onDeviceDisconnected);
  btService.on(BtEvents.DEVICE_REMOVED, onDeviceRemoved);
  btService.on(BtEvents.DEVICE_BATTERY_CHANGED, onBatteryChanged);
  btService.on(BtEvents.DEVICE_VOLUME_CHANGED, onVolumeChanged);
  btService.on(BtEvents.DEVICE_NAME_CHANGED, onDeviceNameChanged);
  
  /**
   * TODO: MPD Event Handlers
   * These would be added when you create an MPD service similar to bt-service
   */
  
  // const onMpdSongChanged = (song) => {
  //   sendEvent('mpd_song_changed', song);
  // };
  // 
  // const onMpdStateChanged = (state) => {
  //   sendEvent('mpd_state_changed', { state });
  // };
  // 
  // const onMpdQueueChanged = () => {
  //   sendEvent('mpd_queue_changed', {});
  // };
  // 
  // mpdService.on(MpdEvents.SONG_CHANGED, onMpdSongChanged);
  // mpdService.on(MpdEvents.STATE_CHANGED, onMpdStateChanged);
  // mpdService.on(MpdEvents.QUEUE_CHANGED, onMpdQueueChanged);
  
  /**
   * Handle client disconnect
   */
  req.on('close', () => {
    log.info('SSE client disconnected');
    
    // Unsubscribe from all Bluetooth events
    btService.off(BtEvents.CONTROLLER_POWERED_ON, onControllerPoweredOn);
    btService.off(BtEvents.CONTROLLER_POWERED_OFF, onControllerPoweredOff);
    btService.off(BtEvents.DEVICE_FOUND, onDeviceFound);
    btService.off(BtEvents.DEVICE_CONNECTED, onDeviceConnected);
    btService.off(BtEvents.DEVICE_DISCONNECTED, onDeviceDisconnected);
    btService.off(BtEvents.DEVICE_REMOVED, onDeviceRemoved);
    btService.off(BtEvents.DEVICE_BATTERY_CHANGED, onBatteryChanged);
    btService.off(BtEvents.DEVICE_VOLUME_CHANGED, onVolumeChanged);
    btService.off(BtEvents.DEVICE_NAME_CHANGED, onDeviceNameChanged);
    
    // TODO: Unsubscribe from MPD events
    // mpdService.off(MpdEvents.SONG_CHANGED, onMpdSongChanged);
    // mpdService.off(MpdEvents.STATE_CHANGED, onMpdStateChanged);
    // mpdService.off(MpdEvents.QUEUE_CHANGED, onMpdQueueChanged);
    
    res.end();
  });
  
  /**
   * Keep-alive ping every 30 seconds
   * Prevents proxies/firewalls from closing idle connections
   */
  const keepAliveInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAliveInterval);
  });
});

export default router;