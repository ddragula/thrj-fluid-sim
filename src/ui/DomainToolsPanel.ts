import {
    type DomainEditMode,
    MAX_DOMAIN_ELEMENTS
} from '../sim/DomainElement';
import { getPanelsHost } from './panelHost';

const EDIT_MODE_OPTIONS = [
    { mode: 'navigate', label: 'Navigate' },
    { mode: 'hotCircle', label: 'Hot Circle' },
    { mode: 'ambientWall', label: 'Ambient Wall' }
] as const satisfies ReadonlyArray<{ mode: DomainEditMode; label: string }>;

export class DomainToolsPanel {
    private readonly root: HTMLDetailsElement;
    private readonly countValue: HTMLSpanElement;
    private readonly modeButtons = new Map<DomainEditMode, HTMLButtonElement>();
    private domainEditMode: DomainEditMode;
    private elementCount = 0;

    constructor(
        initialDomainEditMode: DomainEditMode,
        initialElementCount: number,
        private readonly onDomainEditModeChange: (mode: DomainEditMode) => void,
        private readonly onClearDomainElements: () => void,
        private readonly onResetDomainElements: () => void
    ) {
        document.querySelector('.domain-tools-panel')?.remove();
        this.domainEditMode = initialDomainEditMode;

        this.root = document.createElement('details');
        this.root.className = 'simulation-panel domain-tools-panel';
        this.root.open = false;

        const summary = document.createElement('summary');
        summary.className = 'simulation-panel__summary';
        summary.textContent = 'DOMAIN TOOLS';
        this.root.appendChild(summary);

        const content = document.createElement('div');
        content.className = 'simulation-panel__content';
        this.root.appendChild(content);

        const modeSection = document.createElement('div');
        modeSection.className = 'simulation-panel__row';

        const modeLabel = document.createElement('div');
        modeLabel.className = 'simulation-panel__label';
        modeLabel.textContent = 'Insert Mode';
        modeSection.appendChild(modeLabel);

        const modeGroup = document.createElement('div');
        modeGroup.className = 'simulation-panel__mode-group';

        for (const option of EDIT_MODE_OPTIONS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'simulation-panel__mode-button';
            button.textContent = option.label;
            button.addEventListener('click', () => {
                this.setDomainEditMode(option.mode);
                this.onDomainEditModeChange(option.mode);
            });
            this.modeButtons.set(option.mode, button);
            modeGroup.appendChild(button);
        }

        modeSection.appendChild(modeGroup);
        content.appendChild(modeSection);

        const infoSection = document.createElement('div');
        infoSection.className = 'simulation-panel__row';

        const infoLabel = document.createElement('div');
        infoLabel.className = 'simulation-panel__label';
        infoLabel.textContent = 'Current Layout';
        infoSection.appendChild(infoLabel);

        const layoutInfo = document.createElement('div');
        layoutInfo.className = 'simulation-panel__derived';
        layoutInfo.innerHTML = '<span>Elements</span>';
        this.countValue = document.createElement('span');
        layoutInfo.appendChild(this.countValue);
        infoSection.appendChild(layoutInfo);

        const help = document.createElement('div');
        help.className = 'simulation-panel__help';
        help.textContent =
            'WL 352 start layout loads 17 hot rods inside a 120 mm duct. Click to place hot circles, drag to place ambient walls.';
        infoSection.appendChild(help);
        content.appendChild(infoSection);

        const actions = document.createElement('div');
        actions.className = 'simulation-panel__actions';

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'simulation-panel__button';
        resetButton.textContent = 'Reset WL 352';
        resetButton.addEventListener('click', () => {
            this.onResetDomainElements();
        });
        actions.appendChild(resetButton);

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'simulation-panel__button simulation-panel__button--secondary';
        clearButton.textContent = 'Clear Elements';
        clearButton.addEventListener('click', () => {
            this.onClearDomainElements();
        });
        actions.appendChild(clearButton);

        content.appendChild(actions);

        getPanelsHost().appendChild(this.root);

        this.refresh(initialElementCount);
    }

    refresh(elementCount: number): void {
        this.elementCount = elementCount;
        this.countValue.textContent = `${elementCount} / ${MAX_DOMAIN_ELEMENTS}`;

        for (const [mode, button] of this.modeButtons) {
            button.classList.toggle(
                'simulation-panel__mode-button--active',
                mode === this.domainEditMode
            );
            button.setAttribute('aria-pressed', mode === this.domainEditMode ? 'true' : 'false');
        }
    }

    setDomainEditMode(mode: DomainEditMode): void {
        this.domainEditMode = mode;
        this.refresh(this.elementCount);
    }
}
