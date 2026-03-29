import { GpuContext } from '../gpu/GpuContext';
import { FieldRenderer } from '../render/FieldRenderer';
import { FlowEngine } from '../sim/FlowEngine';

export class App {
    private readonly gpu: GpuContext;

    private readonly renderer: FieldRenderer;
    private readonly flow: FlowEngine;

    private lastTimeSeconds: number | null = null;

    constructor(gpu: GpuContext) {
        this.gpu = gpu;
        
        this.flow = new FlowEngine(gpu.device, 512, 512);
        this.renderer = new FieldRenderer(gpu);

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
        const nowSeconds = nowMs * 0.001;
        
        const dt =
            this.lastTimeSeconds === null
                ? 1 / 60
                : Math.min(1 / 30, nowSeconds - this.lastTimeSeconds);

        this.lastTimeSeconds = nowSeconds;

        this.flow.step(nowSeconds, dt);
        this.renderer.render(this.flow.getDensityView());

        requestAnimationFrame(this.frame);
    }
}
