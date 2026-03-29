export type PressureScaleStop = {
    position: number;
    color: string;
};

export const PRESSURE_SCALE_STOPS: PressureScaleStop[] = [
    { position: 0.00, color: '#123a7a' },
    { position: 0.22, color: '#1c76d2' },
    { position: 0.42, color: '#6fd9ff' },
    { position: 0.50, color: '#eef6ff' },
    { position: 0.58, color: '#ffd58a' },
    { position: 0.78, color: '#ff9248' },
    { position: 1.00, color: '#cf4c2d' }
];

export function getPressureDisplayRange(
    ambientTemperature: number,
    heaterTemperature: number,
    gravity: number,
    thermalExpansionCoefficient: number
): { min: number; max: number } {
    const deltaTemperature = Math.max(heaterTemperature - ambientTemperature, 1.0);
    const buoyancyScale =
        gravity *
        thermalExpansionCoefficient *
        deltaTemperature;
    const magnitude = Math.max(1e-5, 4e-5 * buoyancyScale);

    return {
        min: -magnitude,
        max: magnitude
    };
}
