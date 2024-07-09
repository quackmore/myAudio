import log from '../logger/logger.js';
import cfg from 'config';
import cfgfile from '../cfgfile/cfgfile.js';
import espFetch from '../utils/espFetch.js';

import { spawn } from 'child_process';

async function status() {
  try {
    let speakers = await volumeGet();
    let res = await espFetch(`http://${cfg.get('speakers.contactDevice')}/auxContactsStatus`, 5000);
    let data = await res.json();
    speakers.speakerOn = (data.aux_contacts_status[cfg.get('speakers.contactRelay')] === 'closed' ? 'on' : 'off');
    return speakers;
  }
  catch (err) {
    log.error(err.message);
    throw new Error(err.message);
  }
}

async function toggle() {
  try {
    let speakers = {};
    let res = await espFetch(`http://${cfg.get('speakers.contactDevice')}/auxContactsStatus`, 5000);
    let data = await res.json();
    speakers.speakerOn = (data.aux_contacts_status[cfg.get('speakers.contactRelay')] === 'closed' ? 'on' : 'off');
    let req = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `{"aux_contacts_status": "${speakers.speakerOn === 'on' ? "open" : "closed"}"}`
    };
    let url = `http://${cfg.get('speakers.contactDevice')}/auxContactsStatus?${new URLSearchParams({ "id": cfg.get('speakers.contactRelay') })}`;
    res = await espFetch(url, 5000, req);
    speakers.speakerOn = (speakers.speakerOn === 'on' ? 'off' : 'on');
    return speakers;
  }
  catch (err) {
    log.error(err);
    throw new Error(err.msg);
  }
}

async function volumeGet() {
  let spkrsCmd = spawn("amixer", ["-c", cfg.get('speakers.card'), "sget", cfg.get('speakers.volumeCtrl')]);
  let speakers = {};
  let data = "";
  for await (const chunk of spkrsCmd.stdout)
    data += chunk;
  let volLevel = "";
  for (let line of data.toString().split('\n')) {
    if (line.toString().length < 2) continue;
    volLevel = line.toString();
  }
  if (volLevel.length > 5) {
    speakers.volume = volLevel.match(/\[(.*?)\]/)[1];
    speakers.mute = volLevel.match(/\[on\]/) ? "no" : "yes";
  }
  let error = "";
  for await (const chunk of spkrsCmd.stderr) {
    error += chunk;
  }
  let exitCode = await new Promise((resolve, reject) => {
    spkrsCmd.on('close', resolve);
  });

  if (exitCode) {
    let msg = `amixer -c ${cfg.get('speakers.card')} sget '${cfg.get('speakers.volumeCtrl')}' got ${data} - ${error}`;
    log.error(msg);
    throw new Error(msg);
  }
  return speakers;
}

async function saveVolume(value) {
  let content = await cfgfile.read();
  if (!content.hasOwnProperty('spkrs')) content.spkrs = {};
  content.spkrs.defaultVolume = value;
  cfgfile.save(content);
}

async function saveVolumeInc(value) {
  let content = await cfgfile.read();
  if (content.hasOwnProperty('spkrs') && content.spkrs.hasOwnProperty('defaultVolume')) {
    content.spkrs.defaultVolume = `${parseInt(content.spkrs.defaultVolume.split('%')[0]) + value}%`;
    cfgfile.save(content);
  }
}

async function volumeSet(value) {
  let spkrsCmd = spawn("amixer", ["-c", cfg.get('speakers.card'), "sset", cfg.get('speakers.volumeCtrl'), value]);
  let data = "";
  for await (const chunk of spkrsCmd.stdout)
    data += chunk;
  let error = "";
  for await (const chunk of spkrsCmd.stderr) {
    error += chunk;
  }
  let exitCode = await new Promise((resolve, reject) => {
    spkrsCmd.on('close', resolve);
  });

  if (exitCode) {
    let msg = `amixer -c ${cfg.get('speakers.card')} sset '${cfg.get('speakers.volumeCtrl')}' ${value} got ${data} - ${error}`;
    log.error(msg);
    throw new Error(msg);
  }

  // save default volume value
  saveVolume(value);
  return "done";
}

async function volumeInc() {
  let speakers = await volumeGet();
  if (speakers.volume != "100%") {
    let spkrsCmd = spawn("amixer", ["-c", cfg.get('speakers.card'), "sset", cfg.get('speakers.volumeCtrl'), "1%+"]);
    let data = "";
    for await (const chunk of spkrsCmd.stdout)
      data += chunk;
    let error = "";
    for await (const chunk of spkrsCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      spkrsCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `amixer -c ${cfg.get('speakers.card')} sset '${cfg.get('speakers.volumeCtrl')}' 1%+ got ${data} - ${error}`;
      log.error(msg);
      throw new Error(msg);
    }
    // save default volume value
    saveVolumeInc(1);
  }
  return "done";
}

async function volumeDec() {
  let speakers = await volumeGet();
  if (speakers.volume != "100%") {
    let spkrsCmd = spawn("amixer", ["-c", cfg.get('speakers.card'), "sset", cfg.get('speakers.volumeCtrl'), "1%-"]);
    let data = "";
    for await (const chunk of spkrsCmd.stdout)
      data += chunk;
    let error = "";
    for await (const chunk of spkrsCmd.stderr) {
      error += chunk;
    }
    let exitCode = await new Promise((resolve, reject) => {
      spkrsCmd.on('close', resolve);
    });

    if (exitCode) {
      let msg = `amixer -c ${cfg.get('speakers.card')} sset '${cfg.get('speakers.volumeCtrl')}' 1%- got ${data} - ${error}`;
      log.error(msg);
      throw new Error(msg);
    }
    // save default volume value
    saveVolumeInc(-1);
  }
  return "done";
}

async function volumeMute(val) {
  if (val !== "mute" && val !== "unmute") return "invalid command";
  // val = "mute" || "unmute"
  let spkrsCmd = spawn("amixer", ["-c", cfg.get('speakers.card'), "sset", cfg.get('speakers.volumeCtrl'), val]);
  let data = "";
  for await (const chunk of spkrsCmd.stdout)
    data += chunk;
  let error = "";
  for await (const chunk of spkrsCmd.stderr) {
    error += chunk;
  }
  let exitCode = await new Promise((resolve, reject) => {
    spkrsCmd.on('close', resolve);
  });

  if (exitCode) {
    let msg = `amixer -c ${cfg.get('speakers.card')} sset '${cfg.get('speakers.volumeCtrl')}' [mute|unmute] got ${data} - ${error}`;
    log.error(msg);
    throw new Error(msg);
  }
  return "done";
}

export default {
  status: status,
  toggle: toggle,
  volumeGet: volumeGet,
  volumeSet: volumeSet,
  volumeInc: volumeInc,
  volumeDec: volumeDec,
  volumeMute: volumeMute
};