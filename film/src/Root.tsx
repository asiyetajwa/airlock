import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './components/Film';
import { airlockFilm } from './airlock/AirlockFilm';

export const Root: React.FC = () => (
  <>
    <Composition
      id="AirlockLandscape"
      component={airlockFilm.Component}
      durationInFrames={airlockFilm.durationInFrames}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={airlockFilm.defaultProps}
      calculateMetadata={airlockFilm.calculateMetadata}
    />
  </>
);
