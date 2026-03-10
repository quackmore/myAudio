import log from './logger.js';
import cfg from 'config';
import cfgfile from '../services/cfgfile.js';
import espFetch from '../utils/espFetch.js';
import pactl from '../services/pactl.js';

async function status() {
  try {
    let speakers = await pactl.volumeGet();
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
    if (speakers.speakerOn === 'on') {
      await pactl.setDefaultSink(cfg.get('speakers.pactlDefaultSink'));
    }
    return speakers;
  }
  catch (err) {
    log.error(err);
    throw new Error(err.msg);
  }
}

export default {
  status: status,
  toggle: toggle,
};