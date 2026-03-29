export function getPanelsHost(): HTMLDivElement {
    let host = document.querySelector('.simulation-panels') as HTMLDivElement | null;
    let viewport = document.querySelector('.simulation-panels-viewport') as HTMLDivElement | null;

    if (host && viewport && host.parentElement === viewport) {
        return host;
    }

    if (!viewport) {
        viewport = document.createElement('div');
        viewport.className = 'simulation-panels-viewport';
        document.body.appendChild(viewport);
    }

    if (!host) {
        host = document.createElement('div');
        host.className = 'simulation-panels';
    }

    if (host.parentElement !== viewport) {
        viewport.appendChild(host);
    }

    return host;
}
