export type TemperatureScaleStop = {
    position: number;
    color: string;
};

export const TEMPERATURE_COLOR_BAND_COUNT = 21;

export const TEMPERATURE_SCALE_STOPS: TemperatureScaleStop[] = [
    { position: 0.00, color: '#1f12c6' },
    { position: 0.16, color: '#2930cf' },
    { position: 0.32, color: '#7a33c9' },
    { position: 0.46, color: '#c92b96' },
    { position: 0.58, color: '#ef3b4f' },
    { position: 0.68, color: '#ff6518' },
    { position: 0.80, color: '#ffab1d' },
    { position: 0.90, color: '#ffe56d' },
    { position: 1.00, color: '#fffbd2' }
];

export function getTemperatureDisplayRange(
    ambientTemperature: number,
    heaterTemperature: number
): { min: number; max: number } {
    const min = Math.min(ambientTemperature, heaterTemperature);
    const max = Math.max(ambientTemperature, heaterTemperature);

    if (max - min < 1e-3) {
        return {
            min,
            max: min + 1.0
        };
    }

    return { min, max };
}
