import {
    type FlowSimulationParamKey,
    type FlowSimulationParamValues,
    FlowSimulationParams
} from '../sim/FlowSimulationParams';
import { RenderMode } from '../render/RenderMode';
import {
    TEMPERATURE_SCALE_STOPS,
    getTemperatureDisplayRange
} from '../render/temperatureScale';
import {
    PRESSURE_SCALE_STOPS,
    getPressureDisplayRange
} from '../render/pressureScale';
import { getPanelsHost } from './panelHost';

type ParamControlDescriptor = {
    key: FlowSimulationParamKey;
    label: string;
    unit: string;
    step: number;
    min: number;
    max: number;
    useRange: boolean;
    wideNumber?: boolean;
};

type ParamControlElements = {
    numberInput: HTMLInputElement;
    rangeInput: HTMLInputElement | null;
};

const PARAM_CONTROLS: ParamControlDescriptor[] = [
    {
        key: 'ambientTemperature',
        label: 'Ambient Temperature',
        unit: '°C',
        step: 1,
        min: -20,
        max: 100,
        useRange: true
    },
    {
        key: 'heaterTemperature',
        label: 'Heater Temperature',
        unit: '°C',
        step: 1,
        min: -20,
        max: 1000,
        useRange: true
    },
    {
        key: 'gravity',
        label: 'Gravity',
        unit: 'm/s^2',
        step: 0.1,
        min: 0,
        max: 20,
        useRange: true
    },
    {
        key: 'kinematicViscosity',
        label: 'Kinematic Viscosity',
        unit: 'm^2/s',
        step: 0.000001,
        min: 0,
        max: 0.001,
        useRange: false,
        wideNumber: true
    },
    {
        key: 'thermalDiffusivity',
        label: 'Thermal Diffusivity',
        unit: 'm^2/s',
        step: 0.000001,
        min: 0,
        max: 0.001,
        useRange: false,
        wideNumber: true
    }
];

const DYE_PARAM_CONTROLS: ParamControlDescriptor[] = [
    {
        key: 'dyeDecayRate',
        label: 'Dye Decay',
        unit: '1/s',
        step: 0.01,
        min: 0,
        max: 2,
        useRange: true
    },
    {
        key: 'dyeBrushStrength',
        label: 'Brush Strength',
        unit: '1/s',
        step: 0.1,
        min: 0,
        max: 12,
        useRange: true
    },
    {
        key: 'dyeBrushRadius',
        label: 'Brush Radius',
        unit: 'm',
        step: 0.001,
        min: 0.001,
        max: 0.05,
        useRange: true
    }
];

const ALL_PARAM_CONTROLS: ParamControlDescriptor[] = [
    ...PARAM_CONTROLS,
    ...DYE_PARAM_CONTROLS
];

const RENDER_MODE_OPTIONS = [
    { mode: RenderMode.Temperature, label: 'Temperature' },
    { mode: RenderMode.Dye, label: 'Dye' },
    { mode: RenderMode.Velocity, label: 'Velocity' },
    { mode: RenderMode.Pressure, label: 'Projection Pressure' }
] as const;

export class SimulationControlPanel {
    private readonly root: HTMLDetailsElement;
    private readonly dyeHint: HTMLDivElement;
    private readonly controls = new Map<FlowSimulationParamKey, ParamControlElements>();
    private readonly modeButtons = new Map<RenderMode, HTMLButtonElement>();
    private readonly betaValue: HTMLSpanElement;
    private readonly temperatureLegend: HTMLDivElement;
    private readonly pressureLegend: HTMLDivElement;
    private readonly dyeControlsSection: HTMLDivElement;
    private temperatureLegendBar!: HTMLDivElement;
    private temperatureLegendMin!: HTMLSpanElement;
    private temperatureLegendMax!: HTMLSpanElement;
    private temperatureLegendContext!: HTMLSpanElement;
    private pressureLegendBar!: HTMLDivElement;
    private pressureLegendMin!: HTMLSpanElement;
    private pressureLegendMid!: HTMLSpanElement;
    private pressureLegendMax!: HTMLSpanElement;
    private pressureLegendContext!: HTMLSpanElement;
    private dyeHintDismissed = false;
    private renderMode: RenderMode;

    constructor(
        private readonly params: FlowSimulationParams,
        initialRenderMode: RenderMode,
        private readonly onRenderModeChange: (mode: RenderMode) => void
    ) {
        document.querySelector('.simulation-controls-panel')?.remove();
        document.querySelector('.simulation-hint')?.remove();
        this.renderMode = initialRenderMode;

        this.root = document.createElement('details');
        this.root.className = 'simulation-panel simulation-controls-panel';
        this.root.open = false;

        this.dyeHint = document.createElement('div');
        this.dyeHint.className = 'simulation-hint';
        this.dyeHint.textContent = 'Drag on the canvas to add dye and reveal the flow.';

        const summary = document.createElement('summary');
        summary.className = 'simulation-panel__summary';
        summary.textContent = 'SIMULATION CONTROLS';
        this.root.appendChild(summary);

        const content = document.createElement('div');
        content.className = 'simulation-panel__content';
        this.root.appendChild(content);

        content.appendChild(this.createRenderModeSection());
        this.temperatureLegend = this.createTemperatureLegendSection();
        content.appendChild(this.temperatureLegend);
        this.pressureLegend = this.createPressureLegendSection();
        content.appendChild(this.pressureLegend);
        this.dyeControlsSection = this.createDyeControlsSection();
        content.appendChild(this.dyeControlsSection);

        const derived = document.createElement('div');
        derived.className = 'simulation-panel__derived';
        derived.innerHTML = '<span>Beta (air)</span>';
        this.betaValue = document.createElement('span');
        derived.appendChild(this.betaValue);
        content.appendChild(derived);

        for (const descriptor of PARAM_CONTROLS) {
            content.appendChild(this.createControl(descriptor));
        }

        const actions = document.createElement('div');
        actions.className = 'simulation-panel__actions';

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'simulation-panel__button';
        resetButton.textContent = 'Reset Defaults';
        resetButton.addEventListener('click', () => {
            this.params.reset();
            this.refresh();
        });
        actions.appendChild(resetButton);

        content.appendChild(actions);

        const host = getPanelsHost();
        host.appendChild(this.root);
        document.body.appendChild(this.dyeHint);

        this.refresh();
    }

    dismissDyeHint(): void {
        if (this.renderMode !== RenderMode.Dye || this.dyeHintDismissed) {
            return;
        }

        this.dyeHintDismissed = true;
        this.updateModeButtons();
    }

    private createTemperatureLegendSection(): HTMLDivElement {
        const section = document.createElement('div');
        section.className = 'simulation-panel__legend';

        const title = document.createElement('div');
        title.className = 'simulation-panel__legend-title';
        title.textContent = 'Temperature Scale';
        section.appendChild(title);

        const bar = document.createElement('div');
        bar.className = 'simulation-panel__legend-bar';
        section.appendChild(bar);
        this.temperatureLegendBar = bar;

        const range = document.createElement('div');
        range.className = 'simulation-panel__legend-range';

        const min = document.createElement('span');
        const max = document.createElement('span');
        range.appendChild(min);
        range.appendChild(max);
        section.appendChild(range);
        this.temperatureLegendMin = min;
        this.temperatureLegendMax = max;

        const context = document.createElement('div');
        context.className = 'simulation-panel__legend-context';
        section.appendChild(context);
        this.temperatureLegendContext = context;

        return section;
    }

    private createDyeControlsSection(): HTMLDivElement {
        const section = document.createElement('div');
        section.className = 'simulation-panel__legend simulation-panel__legend--hidden';

        const title = document.createElement('div');
        title.className = 'simulation-panel__legend-title';
        title.textContent = 'Dye Controls';
        section.appendChild(title);

        for (const descriptor of DYE_PARAM_CONTROLS) {
            section.appendChild(this.createControl(descriptor));
        }

        return section;
    }

    private createPressureLegendSection(): HTMLDivElement {
        const section = document.createElement('div');
        section.className = 'simulation-panel__legend simulation-panel__legend--hidden';

        const title = document.createElement('div');
        title.className = 'simulation-panel__legend-title';
        title.textContent = 'Projection Pressure q';
        section.appendChild(title);

        const bar = document.createElement('div');
        bar.className = 'simulation-panel__legend-bar';
        section.appendChild(bar);
        this.pressureLegendBar = bar;

        const range = document.createElement('div');
        range.className = 'simulation-panel__legend-range';

        const min = document.createElement('span');
        const mid = document.createElement('span');
        const max = document.createElement('span');
        range.appendChild(min);
        range.appendChild(mid);
        range.appendChild(max);
        section.appendChild(range);
        this.pressureLegendMin = min;
        this.pressureLegendMid = mid;
        this.pressureLegendMax = max;

        const context = document.createElement('div');
        context.className = 'simulation-panel__legend-context';
        section.appendChild(context);
        this.pressureLegendContext = context;

        return section;
    }

    private createControl(descriptor: ParamControlDescriptor): HTMLElement {
        const row = document.createElement('div');
        row.className = 'simulation-panel__row';

        const label = document.createElement('label');
        label.className = 'simulation-panel__label';
        label.textContent = descriptor.label;
        row.appendChild(label);

        const inputs = document.createElement('div');
        inputs.className = 'simulation-panel__inputs';

        let rangeInput: HTMLInputElement | null = null;
        if (descriptor.useRange) {
            rangeInput = document.createElement('input');
            rangeInput.className = 'simulation-panel__range';
            rangeInput.type = 'range';
            rangeInput.min = String(descriptor.min);
            rangeInput.max = String(descriptor.max);
            rangeInput.step = String(descriptor.step);
            rangeInput.addEventListener('input', () => {
                this.applyValue(descriptor.key, Number(rangeInput?.value));
            });
            inputs.appendChild(rangeInput);
        }

        const numberWrap = document.createElement('div');
        numberWrap.className = 'simulation-panel__number-wrap';

        const numberInput = document.createElement('input');
        numberInput.className = 'simulation-panel__number';
        if (descriptor.wideNumber) {
            numberInput.classList.add('simulation-panel__number--wide');
        }
        numberInput.type = 'number';
        numberInput.min = String(descriptor.min);
        numberInput.max = String(descriptor.max);
        numberInput.step = String(descriptor.step);
        numberInput.addEventListener('change', () => {
            this.applyValue(descriptor.key, Number(numberInput.value));
        });
        numberWrap.appendChild(numberInput);

        const unit = document.createElement('span');
        unit.className = 'simulation-panel__unit';
        unit.textContent = descriptor.unit;
        numberWrap.appendChild(unit);

        inputs.appendChild(numberWrap);
        row.appendChild(inputs);

        this.controls.set(descriptor.key, {
            numberInput,
            rangeInput
        });

        return row;
    }

    private createRenderModeSection(): HTMLElement {
        const section = document.createElement('div');
        section.className = 'simulation-panel__row';

        const label = document.createElement('div');
        label.className = 'simulation-panel__label';
        label.textContent = 'View';
        section.appendChild(label);

        const modeGroup = document.createElement('div');
        modeGroup.className = 'simulation-panel__mode-group simulation-panel__mode-group--views';

        for (const option of RENDER_MODE_OPTIONS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'simulation-panel__mode-button';
            button.textContent = option.label;
            button.addEventListener('click', () => {
                this.setRenderMode(option.mode);
                this.onRenderModeChange(option.mode);
            });
            this.modeButtons.set(option.mode, button);
            modeGroup.appendChild(button);
        }

        section.appendChild(modeGroup);
        return section;
    }

    private applyValue(key: FlowSimulationParamKey, value: number): void {
        if (!Number.isFinite(value)) {
            this.refresh();
            return;
        }

        this.params.assign({
            [key]: value
        } as Partial<FlowSimulationParamValues>);
        this.refresh();
    }

    private refresh(): void {
        const snapshot = this.params.toObject();

        for (const descriptor of ALL_PARAM_CONTROLS) {
            const control = this.controls.get(descriptor.key);
            if (!control) {
                continue;
            }

            const value = snapshot[descriptor.key];
            const min =
                descriptor.key === 'heaterTemperature'
                    ? Math.max(descriptor.min, snapshot.ambientTemperature)
                    : descriptor.min;

            control.numberInput.min = String(min);
            control.numberInput.value = formatControlValue(descriptor.key, value);

            if (control.rangeInput) {
                control.rangeInput.min = String(min);
                control.rangeInput.value = String(clampValue(value, min, descriptor.max));
            }
        }

        this.betaValue.textContent = `${this.params.thermalExpansionCoefficient.toExponential(3)} 1/K`;
        this.refreshTemperatureLegend(snapshot);
        this.refreshPressureLegend(snapshot);
        this.updateModeButtons();
    }

    private updateModeButtons(): void {
        this.temperatureLegend.classList.toggle(
            'simulation-panel__legend--hidden',
            this.renderMode !== RenderMode.Temperature
        );
        this.pressureLegend.classList.toggle(
            'simulation-panel__legend--hidden',
            this.renderMode !== RenderMode.Pressure
        );
        this.dyeControlsSection.classList.toggle(
            'simulation-panel__legend--hidden',
            this.renderMode !== RenderMode.Dye
        );
        this.dyeHint.classList.toggle(
            'simulation-hint--hidden',
            this.renderMode !== RenderMode.Dye || this.dyeHintDismissed
        );

        for (const [mode, button] of this.modeButtons) {
            button.classList.toggle('simulation-panel__mode-button--active', mode === this.renderMode);
            button.setAttribute('aria-pressed', mode === this.renderMode ? 'true' : 'false');
        }
    }

    private setRenderMode(mode: RenderMode): void {
        this.renderMode = mode;

        if (mode === RenderMode.Dye) {
            this.dyeHintDismissed = false;
        }

        this.updateModeButtons();
    }

    private refreshTemperatureLegend(snapshot: FlowSimulationParamValues): void {
        const range = getTemperatureLegendRange(
            snapshot.ambientTemperature,
            snapshot.heaterTemperature
        );

        this.temperatureLegendBar.style.background = createTemperatureLegendGradient();
        this.temperatureLegendMin.textContent = `${formatLegendTemperature(range.min)} °C`;
        this.temperatureLegendMax.textContent = `${formatLegendTemperature(range.max)} °C`;
        this.temperatureLegendContext.textContent =
            `Ambient ${formatLegendTemperature(snapshot.ambientTemperature)} °C | ` +
            `Heater ${formatLegendTemperature(snapshot.heaterTemperature)} °C`;
    }

    private refreshPressureLegend(snapshot: FlowSimulationParamValues): void {
        const range = getPressureDisplayRange(
            snapshot.ambientTemperature,
            snapshot.heaterTemperature,
            snapshot.gravity,
            this.params.thermalExpansionCoefficient
        );

        this.pressureLegendBar.style.background = createPressureLegendGradient();
        this.pressureLegendMin.textContent = formatPressureLegendValue(range.min);
        this.pressureLegendMid.textContent = '0';
        this.pressureLegendMax.textContent = formatPressureLegendValue(range.max);
        this.pressureLegendContext.textContent =
            'Relative projection pressure q [m^2/s], centered at zero. Not absolute static pressure.';
    }
}

function formatControlValue(key: FlowSimulationParamKey, value: number): string {
    if (key === 'pressureIterations') {
        return String(Math.round(value));
    }

    if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.0001)) {
        return value.toExponential(3);
    }

    if (Math.abs(value) >= 10) {
        return value.toFixed(2);
    }

    if (Math.abs(value) >= 1) {
        return value.toFixed(3);
    }

    return value.toFixed(6);
}

function clampValue(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function getTemperatureLegendRange(
    ambientTemperature: number,
    heaterTemperature: number
): { min: number; max: number } {
    return getTemperatureDisplayRange(ambientTemperature, heaterTemperature);
}

function createTemperatureLegendGradient(): string {
    const colorStops = TEMPERATURE_SCALE_STOPS.map((stop) => {
        return `${stop.color} ${(clamp01(stop.position) * 100).toFixed(2)}%`;
    });

    return `linear-gradient(90deg, ${colorStops.join(', ')})`;
}

function createPressureLegendGradient(): string {
    const colorStops = PRESSURE_SCALE_STOPS.map((stop) => {
        return `${stop.color} ${(clamp01(stop.position) * 100).toFixed(2)}%`;
    });

    return `linear-gradient(90deg, ${colorStops.join(', ')})`;
}

function formatLegendTemperature(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPressureLegendValue(value: number): string {
    return `${value.toExponential(1)} m^2/s`;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}
