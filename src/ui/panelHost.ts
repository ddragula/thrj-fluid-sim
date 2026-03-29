export function getPanelsHost(): HTMLDivElement {
    let host = document.querySelector('.simulation-panels') as HTMLDivElement | null;

    if (host) {
        return host;
    }

    host = document.createElement('div');
    host.className = 'simulation-panels';
    document.body.appendChild(host);

    return host;
}
