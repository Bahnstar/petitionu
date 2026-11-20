import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Bundled fonts keep previews and exports independent of Google Fonts requests.
loadFont({
  family: "Newsreader",
  url: staticFile("fonts/newsreader.ttf"),
  weight: "400 700",
});
loadFont({
  family: "Geist",
  url: staticFile("fonts/geist.ttf"),
  weight: "100 900",
});
