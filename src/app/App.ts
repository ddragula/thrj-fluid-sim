import { GpuContext } from '../gpu/GpuContext';
import { FieldRenderer } from '../render/FieldRenderer';
import { RenderMode } from '../render/RenderMode';
import { FlowEngine } from '../sim/FlowEngine';

export class App {
    private readonly gpu: GpuContext;

    private readonly renderer: FieldRenderer;
    private readonly flow: FlowEngine;

    private lastTimeSeconds: number | null = null;
    private renderMode = RenderMode.Dye;

    constructor(gpu: GpuContext) {
        this.gpu = gpu;

        this.flow = new FlowEngine(gpu.device, 512, 512);
        this.renderer = new FieldRenderer(gpu);

        this.handleResize = this.handleResize.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.frame = this.frame.bind(this);
    }

    start(): void {
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyDown);
        this.handleResize();
        requestAnimationFrame(this.frame);
    }

    private handleResize(): void {
        this.gpu.resize();
    }

    private handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case '1':
                this.renderMode = RenderMode.Dye;
                break;
            case '2':
                this.renderMode = RenderMode.Temperature;
                break;
            case '3':
                this.renderMode = RenderMode.Velocity;
                break;
        }
    }

    private frame(nowMs: number): void {
        const nowSeconds = nowMs * 0.001;

        const dt =
            this.lastTimeSeconds === null
                ? 1 / 60
                : Math.min(1 / 30, nowSeconds - this.lastTimeSeconds);

        this.lastTimeSeconds = nowSeconds;

        this.flow.step(nowSeconds, dt);
        this.renderer.render(
            this.flow.getDyeView(),
            this.flow.getTemperatureView(),
            this.flow.getVelocityView(),
            this.renderMode
        );

        requestAnimationFrame(this.frame);
    }
}
