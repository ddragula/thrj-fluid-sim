import {
    type PerformanceProfileLabel,
    type PerformanceProfilePreference
} from '../app/performanceProfile';
import { getPanelsHost } from './panelHost';

export class SettingsPanel {
    private readonly root: HTMLDetailsElement;
    private readonly performanceSelect: HTMLSelectElement;
    private readonly performanceContext: HTMLDivElement;

    constructor(
        initialPerformanceProfilePreference: PerformanceProfilePreference,
        effectivePerformanceProfileLabel: PerformanceProfileLabel,
        private readonly onPerformanceProfilePreferenceChange: (
            preference: PerformanceProfilePreference
        ) => void
    ) {
        document.querySelector('.settings-panel')?.remove();

        this.root = document.createElement('details');
        this.root.className = 'simulation-panel settings-panel';
        this.root.open = false;

        const summary = document.createElement('summary');
        summary.className = 'simulation-panel__summary';
        summary.textContent = 'SETTINGS';
        this.root.appendChild(summary);

        const content = document.createElement('div');
        content.className = 'simulation-panel__content';
        this.root.appendChild(content);

        const section = document.createElement('div');
        section.className = 'simulation-panel__row';

        const label = document.createElement('label');
        label.className = 'simulation-panel__label';
        label.textContent = 'Performance';
        section.appendChild(label);

        const select = document.createElement('select');
        select.className = 'simulation-panel__select';

        for (const option of [
            { value: 'auto', label: 'Auto' },
            { value: 'potato', label: 'Potato' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' }
        ] as const satisfies ReadonlyArray<{
            value: PerformanceProfilePreference;
            label: string;
        }>) {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            select.appendChild(optionElement);
        }

        select.value = initialPerformanceProfilePreference;
        select.addEventListener('change', () => {
            const value = select.value;

            if (
                value === 'auto' ||
                value === 'potato' ||
                value === 'low' ||
                value === 'medium' ||
                value === 'high'
            ) {
                this.onPerformanceProfilePreferenceChange(value);
            }
        });
        section.appendChild(select);

        const context = document.createElement('div');
        context.className = 'simulation-panel__help';
        section.appendChild(context);

        content.appendChild(section);

        this.performanceSelect = select;
        this.performanceContext = context;

        getPanelsHost().appendChild(this.root);

        this.refresh(
            initialPerformanceProfilePreference,
            effectivePerformanceProfileLabel
        );
    }

    refresh(
        performanceProfilePreference: PerformanceProfilePreference,
        effectivePerformanceProfileLabel: PerformanceProfileLabel
    ): void {
        this.performanceSelect.value = performanceProfilePreference;
        this.performanceContext.textContent =
            `Current effective profile: ${formatPerformanceProfileLabel(effectivePerformanceProfileLabel)}`;
    }
}

function formatPerformanceProfileLabel(label: PerformanceProfileLabel): string {
    return label[0].toUpperCase() + label.slice(1);
}
