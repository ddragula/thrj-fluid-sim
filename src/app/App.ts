import { GpuContext } from '../gpu/GpuContext';
import { FieldRenderer } from '../render/FieldRenderer';
import { RenderMode } from '../render/RenderMode';
import { FlowEngine } from '../sim/FlowEngine';
import { FlowSimulationParams } from '../sim/FlowSimulationParams';
import { SimulationControlPanel } from '../ui/SimulationControlPanel';

export class App {
    private readonly gpu: GpuContext;

    private readonly renderer: FieldRenderer;
    private readonly flow: FlowEngine;
    private readonly controls: SimulationControlPanel;
    readonly simulationParams: FlowSimulationParams;

    private lastTimeSeconds: number | null = null;
    private renderMode = RenderMode.Temperature;
    private activePointerId: number | null = null;
    private pointerCurrentUv: { x: number; y: number } | null = null;
    private pointerPreviousUv: { x: number; y: number } | null = null;

    constructor(gpu: GpuContext) {
        this.gpu = gpu;

        this.flow = new FlowEngine(gpu.device, 512, 512);
        this.simulationParams = this.flow.simulationParams;
        this.renderer = new FieldRenderer(gpu);
        this.controls = new SimulationControlPanel(
            this.simulationParams,
            this.renderMode,
            (mode) => {
                this.renderMode = mode;
            }
        );

        this.handleResize = this.handleResize.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.frame = this.frame.bind(this);
    }

    start(): void {
        window.addEventListener('resize', this.handleResize);
        this.gpu.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.gpu.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.gpu.canvas.addEventListener('pointerup', this.handlePointerUp);
        this.gpu.canvas.addEventListener('pointercancel', this.handlePointerUp);
        this.handleResize();
        requestAnimationFrame(this.frame);
    }

    private handleResize(): void {
        this.gpu.resize();
    }

    private handlePointerDown(event: PointerEvent): void {
        if (event.button !== 0) {
            return;
        }

        this.controls.dismissDyeHint();

        const uv = this.getPointerUv(event);

        this.activePointerId = event.pointerId;
        this.pointerCurrentUv = uv;
        this.pointerPreviousUv = uv;
        this.gpu.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    private handlePointerMove(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId || !this.pointerCurrentUv) {
            return;
        }

        this.pointerPreviousUv = this.pointerCurrentUv;
        this.pointerCurrentUv = this.getPointerUv(event);
    }

    private handlePointerUp(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId) {
            return;
        }

        if (this.gpu.canvas.hasPointerCapture(event.pointerId)) {
            this.gpu.canvas.releasePointerCapture(event.pointerId);
        }

        this.activePointerId = null;
        this.pointerCurrentUv = null;
        this.pointerPreviousUv = null;
        this.flow.clearDyeBrush();
    }

    private frame(nowMs: number): void {
        const nowSeconds = nowMs * 0.001;

        const dt =
            this.lastTimeSeconds === null
                ? 1 / 60
                : Math.min(1 / 30, nowSeconds - this.lastTimeSeconds);

        this.lastTimeSeconds = nowSeconds;

        if (this.pointerCurrentUv && this.pointerPreviousUv) {
            this.flow.setDyeBrushStroke(this.pointerPreviousUv, this.pointerCurrentUv);
            this.pointerPreviousUv = this.pointerCurrentUv;
        } else {
            this.flow.clearDyeBrush();
        }

        this.flow.step(nowSeconds, dt);
        this.renderer.render(
            this.flow.getDyeView(),
            this.flow.getTemperatureView(),
            this.flow.getVelocityView(),
            this.renderMode,
            this.simulationParams.ambientTemperature,
            this.simulationParams.heaterTemperature
        );

        requestAnimationFrame(this.frame);
    }

    private getPointerUv(event: PointerEvent): { x: number; y: number } {
        const rect = this.gpu.canvas.getBoundingClientRect();

        return {
            x: clamp((event.clientX - rect.left) / rect.width, 0.0, 1.0),
            y: clamp((event.clientY - rect.top) / rect.height, 0.0, 1.0)
        };
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
