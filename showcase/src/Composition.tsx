import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Intro } from "./scenes/Intro";
import { Discover } from "./scenes/Discover";
import { Support } from "./scenes/Support";
import { Conversation } from "./scenes/Conversation";
import { Create } from "./scenes/Create";
import { Classroom } from "./scenes/Classroom";
import { Outro } from "./scenes/Outro";
export const Showcase = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence
      durationInFrames={90}
      name="Your campus. Your say."
    >
      <Intro />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 8 })}
    />
    <TransitionSeries.Sequence durationInFrames={114} name="Discover petitions">
      <Discover />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 8 })}
    />
    <TransitionSeries.Sequence durationInFrames={132} name="Add your voice">
      <Support />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 8 })}
    />
    <TransitionSeries.Sequence
      durationInFrames={102}
      name="Join the conversation"
    >
      <Conversation />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 8 })}
    />
    <TransitionSeries.Sequence durationInFrames={114} name="Start an idea">
      <Create />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 8 })}
    />
    <TransitionSeries.Sequence
      durationInFrames={102}
      name="Bring classmates together"
    >
      <Classroom />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 8 })}
    />
    <TransitionSeries.Sequence
      durationInFrames={114}
      name="Start with your idea"
    >
      <Outro />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
