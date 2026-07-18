import { SWATCH_COLORS } from '../lib/colors';

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorSwatchPicker({ value, onChange }: Props) {
  return (
    <div className="color-swatch-grid">
      {SWATCH_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`color-swatch${color.toLowerCase() === value.toLowerCase() ? ' selected' : ''}`}
          style={{ background: color }}
          aria-label={color}
          aria-pressed={color.toLowerCase() === value.toLowerCase()}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
