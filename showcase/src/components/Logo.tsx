import { color, font } from "../theme";

// The PetitionU asterisk, drawn as eight thin spokes like the app's header mark.
export const Asterisk = ({
  size,
  spin = 0,
  stroke = color.foreground,
}: {
  size: number;
  spin?: number;
  stroke?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="-12 -12 24 24"
    style={{ rotate: `${spin}deg` }}
  >
    {[0, 45, 90, 135].map((angle) => (
      <line
        key={angle}
        x1={0}
        y1={-10}
        x2={0}
        y2={10}
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        transform={`rotate(${angle})`}
      />
    ))}
  </svg>
);

export const Logo = ({ size, spin = 0 }: { size: number; spin?: number }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: size * 0.28,
      fontFamily: font.display,
      fontSize: size,
      letterSpacing: -size * 0.025,
      color: color.foreground,
      lineHeight: 1,
    }}
  >
    PetitionU
    <Asterisk size={size * 0.62} spin={spin} />
  </div>
);
