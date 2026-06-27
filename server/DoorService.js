import { AudioContext } from 'node-web-audio-api';
import fs from 'fs';
const context = new AudioContext();

const createAudioBufferFromMP3 = async path => {
  const file = fs.readFileSync(path);
  const audioBuffer = await context.decodeAudioData(file.buffer);
  return audioBuffer;
};

const playAudio = (audioBuffer, volume) => {
  const source = context.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = context.createGain();
  gainNode.gain.value = volume;

  source.connect(gainNode);
  gainNode.connect(context.destination);
  source.start();
};

const DoorService = {
  name: 'DoorService',

  init: async server => {
    console.log('init door service');

    DoorService.doorbellAudioBuffer = await createAudioBufferFromMP3('./data/sounds/doorbell.mp3');

    server.app.get('/doorbell', async (req, res) => {
      playAudio(DoorService.doorbellAudioBuffer, 1);
      res.send('');
    });
  },
};

export default DoorService;
