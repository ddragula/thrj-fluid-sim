export function getPanelsHost(): HTMLDivElement {
    let host = document.querySelector('.simulation-panels') as HTMLDivElement | null;
    let viewport = document.querySelector('.simulation-panels-viewport') as HTMLDivElement | null;
    let scroll = document.querySelector('.simulation-panels-scroll') as HTMLDivElement | null;
    let toggle = document.querySelector('.simulation-panels-toggle') as HTMLButtonElement | null;

    if (host && viewport && scroll && host.parentElement === scroll && scroll.parentElement === viewport) {
        ensureToggle(viewport, toggle);
        return host;
    }

    if (!viewport) {
        viewport = document.createElement('div');
        viewport.className = 'simulation-panels-viewport simulation-panels-viewport--collapsed';
        document.body.appendChild(viewport);
    }

    ensureToggle(viewport, toggle);

    if (!scroll) {
        scroll = document.createElement('div');
        scroll.className = 'simulation-panels-scroll';
    }

    if (!host) {
        host = document.createElement('div');
        host.className = 'simulation-panels';
    }

    if (host.parentElement !== scroll) {
        scroll.appendChild(host);
    }

    if (scroll.parentElement !== viewport) {
        viewport.appendChild(scroll);
    }

    return host;
}

function ensureToggle(
    viewport: HTMLDivElement,
    existingToggle: HTMLButtonElement | null
): void {
    const toggle = existingToggle ?? createToggleButton(viewport);
    const collapsed = viewport.classList.contains('simulation-panels-viewport--collapsed');

    if (!toggle.isConnected) {
        document.body.appendChild(toggle);
    }

    toggle.classList.toggle('simulation-panels-toggle--collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function createToggleButton(viewport: HTMLDivElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'simulation-panels-toggle';
    button.setAttribute('aria-label', 'Toggle sidebar panels');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span></span><span></span><span></span>';
    button.addEventListener('click', () => {
        const collapsed = viewport.classList.toggle('simulation-panels-viewport--collapsed');
        button.classList.toggle('simulation-panels-toggle--collapsed', collapsed);
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    return button;
}
