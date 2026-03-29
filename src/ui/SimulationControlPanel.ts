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

type ParamControlDescriptor = {
    key: FlowSimulationParamKey;
    label: string;
    unit: string;
    step: number;
    min: number;
    max: number;
    useRange: boolean;
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
        key: 'dyeDecayRate',
        label: 'Dye Decay',
        unit: '1/s',
        step: 0.01,
        min: 0,
        max: 2,
        useRange: true
    },
    {
        key: 'kinematicViscosity',
        label: 'Kinematic Viscosity',
        unit: 'm^2/s',
        step: 0.000001,
        min: 0,
        max: 0.001,
        useRange: false
    },
    {
        key: 'thermalDiffusivity',
        label: 'Thermal Diffusivity',
        unit: 'm^2/s',
        step: 0.000001,
        min: 0,
        max: 0.001,
        useRange: false
    }
];

const RENDER_MODE_OPTIONS = [
    { mode: RenderMode.Dye, label: 'Dye' },
    { mode: RenderMode.Temperature, label: 'Temperature' },
    { mode: RenderMode.Velocity, label: 'Velocity' }
] as const;

export class SimulationControlPanel {
    private readonly root: HTMLDetailsElement;
    private readonly controls = new Map<FlowSimulationParamKey, ParamControlElements>();
    private readonly modeButtons = new Map<RenderMode, HTMLButtonElement>();
    private readonly betaValue: HTMLSpanElement;
    private readonly temperatureLegend: HTMLDivElement;
    private temperatureLegendBar!: HTMLDivElement;
    private temperatureLegendMin!: HTMLSpanElement;
    private temperatureLegendMax!: HTMLSpanElement;
    private temperatureLegendContext!: HTMLSpanElement;
    private renderMode: RenderMode;

    constructor(
        private readonly params: FlowSimulationParams,
        initialRenderMode: RenderMode,
        private readonly onRenderModeChange: (mode: RenderMode) => void
    ) {
        document.querySelector('.simulation-panel')?.remove();
        this.renderMode = initialRenderMode;

        this.root = document.createElement('details');
        this.root.className = 'simulation-panel';
        this.root.open = false;

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
        document.body.appendChild(this.root);

        this.refresh();
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

        for (const descriptor of PARAM_CONTROLS) {
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
        this.updateModeButtons();
    }

    private createRenderModeSection(): HTMLElement {
        const section = document.createElement('div');
        section.className = 'simulation-panel__row';

        const label = document.createElement('div');
        label.className = 'simulation-panel__label';
        label.textContent = 'View';
        section.appendChild(label);

        const modeGroup = document.createElement('div');
        modeGroup.className = 'simulation-panel__mode-group';

        for (const option of RENDER_MODE_OPTIONS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'simulation-panel__mode-button';
            button.textContent = option.label;
            button.addEventListener('click', () => {
                this.renderMode = option.mode;
                this.onRenderModeChange(option.mode);
                this.updateModeButtons();
            });
            this.modeButtons.set(option.mode, button);
            modeGroup.appendChild(button);
        }

        section.appendChild(modeGroup);
        return section;
    }

    private updateModeButtons(): void {
        this.temperatureLegend.classList.toggle(
            'simulation-panel__legend--hidden',
            this.renderMode !== RenderMode.Temperature
        );

        for (const [mode, button] of this.modeButtons) {
            button.classList.toggle('simulation-panel__mode-button--active', mode === this.renderMode);
            button.setAttribute('aria-pressed', mode === this.renderMode ? 'true' : 'false');
        }
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

function formatLegendTemperature(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}
