import log from './logger.js';
import cfg from 'config';
import espFetch from '../utils/espFetch.js';
import EventEmitter from 'events';

const speakersEvents = {
  SPEAKERS_POWERED_ON: 'speakers_powered_on',
  SPEAKERS_POWERED_OFF: 'speakers_powered_off',
};

class SpeakersService extends EventEmitter {

  #speakersPower = null;

  async status() {
    try {
      let res = await espFetch(`http://${cfg.get('speakers.contactDevice')}/auxContactsStatus`, 5000);
      let data = await res.json();
      this.#speakersPower = (data.aux_contacts_status[cfg.get('speakers.contactRelay')] === 'closed' ? 'on' : 'off');
      return { power: this.#speakersPower };
    }
    catch (err) {
      log.error(err.message);
      throw new Error(err.message);
    }
  }

  async togglePower() {
    try {
      let req = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: `{"aux_contacts_status": "${this.#speakersPower === 'on' ? "open" : "closed"}"}`
      };
      let url = `http://${cfg.get('speakers.contactDevice')}/auxContactsStatus?${new URLSearchParams({ "id": cfg.get('speakers.contactRelay') })}`;
      await espFetch(url, 5000, req);
      this.#speakersPower = (this.#speakersPower === 'on' ? 'off' : 'on');
      this.emit(this.#speakersPower === 'on' ? speakersEvents.SPEAKERS_POWERED_ON : speakersEvents.SPEAKERS_POWERED_OFF, { power: this.#speakersPower });
      return { power: this.#speakersPower };
    }
    catch (err) {
      log.error(err);
      throw new Error(err.msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const speakersService = new SpeakersService();

speakersService.status().then((data) => {
  log.info(`Speakers are ${data.power}`);
}).catch(err => {
  log.error(`Cannot get speakers status: ${err.message}`);
});

export default speakersService;
export { speakersService, speakersEvents };
