import './style.css';
import { App } from './app/App';
import { GpuContext } from './gpu/GpuContext';

async function bootstrap(): Promise<void> {
    const canvas = document.getElementById('app') as HTMLCanvasElement | null;

    if (!canvas) {
        throw new Error('Canvas #app not found');
    }

    const gpu = await GpuContext.create(canvas);
    const app = new App(gpu);

    app.start();
}

bootstrap().catch((error: unknown) => {
    console.error(error);

    const pre = document.createElement('pre');
    pre.style.color = 'white';
    pre.style.padding = '16px';
    pre.textContent = error instanceof Error ? error.message : 'Unknown startup error';

    document.body.innerHTML = '';
    document.body.appendChild(pre);
});
