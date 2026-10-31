import "./index.css";
import "./fonts";
import { Composition } from "remotion";
import { Showcase } from "./Composition";
import { FPS } from "./motion";
import { TOTAL } from "./timeline";

export const RemotionRoot = () => (
  <Composition
    id="PetitionU"
    component={Showcase}
    durationInFrames={TOTAL}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
