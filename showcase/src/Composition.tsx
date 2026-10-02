import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { Bridge } from "./scenes/Bridge";
import { Close } from "./scenes/Close";
import { Problem } from "./scenes/Problem";
import { Tour } from "./scenes/Tour";
import { BRIDGE, CLOSE, PROBLEM, TOUR } from "./timeline";

export const Showcase = () => (
  <AbsoluteFill>
    <Background />
    <Sequence
      name="Ideas get lost"
      from={PROBLEM.from}
      durationInFrames={PROBLEM.duration}
    >
      <Problem duration={PROBLEM.duration} />
    </Sequence>
    <Sequence
      name="PetitionU"
      from={BRIDGE.from}
      durationInFrames={BRIDGE.duration}
    >
      <Bridge duration={BRIDGE.duration} />
    </Sequence>
    <Sequence
      name="Product tour"
      from={TOUR.from}
      durationInFrames={TOUR.duration}
    >
      <Tour duration={TOUR.duration} />
    </Sequence>
    <Sequence
      name="Your campus. Your say."
      from={CLOSE.from}
      durationInFrames={CLOSE.duration}
    >
      <Close />
    </Sequence>
  </AbsoluteFill>
);
