export const defaultFlowSimulationParams = {
    ambientTemperature: 25.0,
    gravity: 9.81,
    kinematicViscosity: 1.56e-5,
    thermalDiffusivity: 2.2e-5,
    dyeDecayRate: 0.24,
    dyeBrushRadius: 0.006,
    dyeBrushStrength: 3.0,
    heaterTemperature: 80.0,
    pressureIterations: 80
};

export type FlowSimulationParamValues = typeof defaultFlowSimulationParams;
export type FlowSimulationParamKey = keyof FlowSimulationParamValues;

export class FlowSimulationParams {
    private readonly values: FlowSimulationParamValues;

    constructor(initialValues: Partial<FlowSimulationParamValues> = {}) {
        this.values = { ...defaultFlowSimulationParams };
        this.assign(initialValues);
    }

    get ambientTemperature(): number {
        return this.values.ambientTemperature;
    }

    set ambientTemperature(value: number) {
        this.values.ambientTemperature = clampMin(
            readNumber(
                value,
                defaultFlowSimulationParams.ambientTemperature
            ),
            ABSOLUTE_ZERO_CELSIUS
        );
        this.values.heaterTemperature = clampMin(
            this.values.heaterTemperature,
            this.values.ambientTemperature
        );
    }

    get gravity(): number {
        return this.values.gravity;
    }

    set gravity(value: number) {
        this.values.gravity = clampMin(
            readNumber(value, defaultFlowSimulationParams.gravity),
            0.0
        );
    }

    get thermalExpansionCoefficient(): number {
        return 1 / celsiusToKelvin(this.ambientTemperature);
    }

    get kinematicViscosity(): number {
        return this.values.kinematicViscosity;
    }

    set kinematicViscosity(value: number) {
        this.values.kinematicViscosity = clampMin(
            readNumber(value, defaultFlowSimulationParams.kinematicViscosity),
            0.0
        );
    }

    get thermalDiffusivity(): number {
        return this.values.thermalDiffusivity;
    }

    set thermalDiffusivity(value: number) {
        this.values.thermalDiffusivity = clampMin(
            readNumber(value, defaultFlowSimulationParams.thermalDiffusivity),
            0.0
        );
    }

    get dyeDecayRate(): number {
        return this.values.dyeDecayRate;
    }

    set dyeDecayRate(value: number) {
        this.values.dyeDecayRate = clampMin(
            readNumber(value, defaultFlowSimulationParams.dyeDecayRate),
            0.0
        );
    }

    get dyeBrushRadius(): number {
        return this.values.dyeBrushRadius;
    }

    set dyeBrushRadius(value: number) {
        this.values.dyeBrushRadius = clampMin(
            readNumber(value, defaultFlowSimulationParams.dyeBrushRadius),
            0.0
        );
    }

    get dyeBrushStrength(): number {
        return this.values.dyeBrushStrength;
    }

    set dyeBrushStrength(value: number) {
        this.values.dyeBrushStrength = clampMin(
            readNumber(value, defaultFlowSimulationParams.dyeBrushStrength),
            0.0
        );
    }

    get heaterTemperature(): number {
        return this.values.heaterTemperature;
    }

    set heaterTemperature(value: number) {
        this.values.heaterTemperature = clampMin(
            readNumber(value, defaultFlowSimulationParams.heaterTemperature),
            this.values.ambientTemperature
        );
    }

    get pressureIterations(): number {
        return this.values.pressureIterations;
    }

    set pressureIterations(value: number) {
        this.values.pressureIterations = Math.max(
            1,
            Math.round(readNumber(value, defaultFlowSimulationParams.pressureIterations))
        );
    }

    assign(patch: Partial<FlowSimulationParamValues>): void {
        if (patch.ambientTemperature !== undefined) {
            this.ambientTemperature = patch.ambientTemperature;
        }
        if (patch.gravity !== undefined) {
            this.gravity = patch.gravity;
        }
        if (patch.kinematicViscosity !== undefined) {
            this.kinematicViscosity = patch.kinematicViscosity;
        }
        if (patch.thermalDiffusivity !== undefined) {
            this.thermalDiffusivity = patch.thermalDiffusivity;
        }
        if (patch.dyeDecayRate !== undefined) {
            this.dyeDecayRate = patch.dyeDecayRate;
        }
        if (patch.dyeBrushRadius !== undefined) {
            this.dyeBrushRadius = patch.dyeBrushRadius;
        }
        if (patch.dyeBrushStrength !== undefined) {
            this.dyeBrushStrength = patch.dyeBrushStrength;
        }
        if (patch.heaterTemperature !== undefined) {
            this.heaterTemperature = patch.heaterTemperature;
        }
        if (patch.pressureIterations !== undefined) {
            this.pressureIterations = patch.pressureIterations;
        }
    }

    reset(): void {
        this.assign(defaultFlowSimulationParams);
    }

    toObject(): FlowSimulationParamValues {
        return { ...this.values };
    }
}

function readNumber(value: number, fallback: number): number {
    if (!Number.isFinite(value)) {
        return fallback;
    }

    return value;
}

function clampMin(value: number, min: number): number {
    return Math.max(value, min);
}

function celsiusToKelvin(value: number): number {
    return value + 273.15;
}

const ABSOLUTE_ZERO_CELSIUS = -273.15 + 1e-3;
