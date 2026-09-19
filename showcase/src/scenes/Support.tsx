import {
  CanvasImage,
  staticFile,
  useCurrentFrame,
  interpolate,
  Interactive,
} from "remotion";
import { Product } from "../Frame";
export const Support = () => {
  const frame = useCurrentFrame();
  return (
    <Product
      step="02 / ADD YOUR VOICE"
      title="Make it count."
      caption="Read the ask. Add your reason. Show your support."
      src="petition"
    >
      <CanvasImage
        src={staticFile("captures/signed.png")}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          opacity: interpolate(frame, [53, 59], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <Interactive.Div
        name="Signature focus"
        style={{
          position: "absolute",
          left: "64.8%",
          top: "15%",
          width: "25%",
          height: "52.5%",
          border: "3px solid #a67076",
          borderRadius: 30,
          opacity: interpolate(frame, [16, 24, 74, 88], [0, 0.9, 0.9, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </Product>
  );
};
