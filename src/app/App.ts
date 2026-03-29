import { GpuContext } from '../gpu/GpuContext';
import { FullscreenRenderer } from '../render/FullscreenRenderer';

export class App {
    private readonly renderer: FullscreenRenderer;
    private readonly gpu: GpuContext;

    constructor(gpu: GpuContext) {
        this.gpu = gpu;
        this.renderer = new FullscreenRenderer(gpu);
        this.handleResize = this.handleResize.bind(this);
        this.frame = this.frame.bind(this);
    }

    start(): void {
        window.addEventListener('resize', this.handleResize);
        this.handleResize();
        requestAnimationFrame(this.frame);
    }

    private handleResize(): void {
        this.gpu.resize();
    }

    private frame(nowMs: number): void {
        const timeSeconds = nowMs * 0.001;

        this.renderer.render(timeSeconds);
        requestAnimationFrame(this.frame);
    }
}
