import { createFilm } from '../components/Film';
import { SCENES } from './script';
import { AskScene, CaughtScene, IntroScene, LeakScene, OutroScene, PhoneScene, ReceiptScene, ScoreScene, VaultScene } from './scenes';

export const airlockFilm = createFilm('airlock', SCENES, {
  intro: IntroScene,
  vault: VaultScene,
  caught: CaughtScene,
  phone: PhoneScene,
  ask: AskScene,
  receipt: ReceiptScene,
  leak: LeakScene,
  score: ScoreScene,
  outro: OutroScene,
});
