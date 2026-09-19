import "./index.css";
import "./fonts";
import { Composition } from "remotion";
import { Showcase } from "./Composition";
export const RemotionRoot = () => (
  <Composition
    id="PetitionU"
    component={Showcase}
    durationInFrames={720}
    fps={30}
    width={1920}
    height={1080}
  />
);
