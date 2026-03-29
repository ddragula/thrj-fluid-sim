import { GpuContext } from '../gpu/GpuContext';
import { FieldRenderer } from '../render/FieldRenderer';
import { RenderMode } from '../render/RenderMode';
import { FlowEngine } from '../sim/FlowEngine';
import { FlowSimulationParams } from '../sim/FlowSimulationParams';
import { SimulationControlPanel } from '../ui/SimulationControlPanel';

type Point = {
    x: number;
    y: number;
};

type PointerInteractionMode = 'dye' | 'pan';

const MIN_CAMERA_ZOOM = 1e-4;
const ZOOM_SENSITIVITY = 0.0015;
const DEFAULT_CAMERA_CENTER = 0.5;
const DEFAULT_CAMERA_ZOOM = 1.0;
const CAMERA_RESET_EPSILON = 1e-4;

export class App {
    private readonly gpu: GpuContext;

    private readonly renderer: FieldRenderer;
    private readonly flow: FlowEngine;
    private readonly controls: SimulationControlPanel;
    private readonly resetViewButton: HTMLButtonElement;
    readonly simulationParams: FlowSimulationParams;

    private lastTimeSeconds: number | null = null;
    private renderMode = RenderMode.Temperature;
    private activePointerId: number | null = null;
    private pointerMode: PointerInteractionMode | null = null;
    private pointerCurrentUv: Point | null = null;
    private pointerPreviousUv: Point | null = null;
    private panPreviousCanvasUv: Point | null = null;
    private ctrlPressed = false;
    private shiftPressed = false;
    private readonly camera = {
        centerX: DEFAULT_CAMERA_CENTER,
        centerY: DEFAULT_CAMERA_CENTER,
        zoom: DEFAULT_CAMERA_ZOOM
    };

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
        document.querySelector('.simulation-view-reset')?.remove();
        this.resetViewButton = document.createElement('button');
        this.resetViewButton.type = 'button';
        this.resetViewButton.className = 'simulation-view-reset simulation-view-reset--hidden';
        this.resetViewButton.textContent = 'Reset View';
        this.resetViewButton.addEventListener('click', () => {
            this.resetCamera();
        });
        document.body.appendChild(this.resetViewButton);

        this.handleResize = this.handleResize.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleAuxClick = this.handleAuxClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleWindowBlur = this.handleWindowBlur.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.frame = this.frame.bind(this);
    }

    start(): void {
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.handleWindowBlur);
        this.gpu.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.gpu.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.gpu.canvas.addEventListener('pointerup', this.handlePointerUp);
        this.gpu.canvas.addEventListener('pointercancel', this.handlePointerUp);
        this.gpu.canvas.addEventListener('auxclick', this.handleAuxClick);
        this.gpu.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        this.handleResize();
        this.updateCanvasCursor();
        this.updateResetViewButton();
        requestAnimationFrame(this.frame);
    }

    private handleResize(): void {
        this.gpu.resize();
    }

    private handlePointerDown(event: PointerEvent): void {
        if (event.button !== 0 && event.button !== 1) {
            return;
        }

        if (event.button === 0) {
            this.controls.dismissDyeHint();
        }

        this.activePointerId = event.pointerId;
        this.pointerMode = event.button === 1 || event.ctrlKey || event.shiftKey ? 'pan' : 'dye';

        if (this.pointerMode === 'pan') {
            this.panPreviousCanvasUv = this.getCanvasUv(event);
            this.pointerCurrentUv = null;
            this.pointerPreviousUv = null;
        } else {
            const uv = this.getPointerUv(event);
            if (!uv) {
                this.activePointerId = null;
                this.pointerMode = null;
                return;
            }

            this.pointerCurrentUv = uv;
            this.pointerPreviousUv = uv;
            this.panPreviousCanvasUv = null;
        }

        this.gpu.canvas.setPointerCapture(event.pointerId);
        this.updateCanvasCursor();
        event.preventDefault();
    }

    private handlePointerMove(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId) {
            return;
        }

        if (this.pointerMode === 'pan') {
            const canvasUv = this.getCanvasUv(event);

            if (this.panPreviousCanvasUv) {
                const visibleDomainSize = this.getVisibleDomainSize();
                this.camera.centerX -=
                    (canvasUv.x - this.panPreviousCanvasUv.x) * visibleDomainSize.x;
                this.camera.centerY -=
                    (canvasUv.y - this.panPreviousCanvasUv.y) * visibleDomainSize.y;
                this.updateResetViewButton();
            }

            this.panPreviousCanvasUv = canvasUv;
            return;
        }

        const uv = this.getPointerUv(event);
        if (!uv) {
            this.pointerCurrentUv = null;
            this.pointerPreviousUv = null;
            return;
        }

        this.pointerPreviousUv = this.pointerCurrentUv ?? uv;
        this.pointerCurrentUv = uv;
    }

    private handlePointerUp(event: PointerEvent): void {
        if (this.activePointerId !== event.pointerId) {
            return;
        }

        if (this.gpu.canvas.hasPointerCapture(event.pointerId)) {
            this.gpu.canvas.releasePointerCapture(event.pointerId);
        }

        this.activePointerId = null;
        this.pointerMode = null;
        this.pointerCurrentUv = null;
        this.pointerPreviousUv = null;
        this.panPreviousCanvasUv = null;
        this.flow.clearDyeBrush();
        this.updateCanvasCursor();
    }

    private handleAuxClick(event: MouseEvent): void {
        if (event.button === 1) {
            event.preventDefault();
        }
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Control') {
            this.ctrlPressed = true;
            this.updateCanvasCursor();
        } else if (event.key === 'Shift') {
            this.shiftPressed = true;
            this.updateCanvasCursor();
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        if (event.key === 'Control') {
            this.ctrlPressed = false;
            this.updateCanvasCursor();
        } else if (event.key === 'Shift') {
            this.shiftPressed = false;
            this.updateCanvasCursor();
        }
    }

    private handleWindowBlur(): void {
        this.ctrlPressed = false;
        this.shiftPressed = false;
        this.updateCanvasCursor();
    }

    private handleWheel(event: WheelEvent): void {
        event.preventDefault();

        const canvasUv = this.getCanvasUv(event);
        const domainUvBeforeZoom = this.canvasUvToDomainUvUnclamped(canvasUv);
        const zoomFactor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);
        const nextZoomRaw = this.camera.zoom * zoomFactor;
        const nextZoom = Number.isFinite(nextZoomRaw)
            ? Math.max(nextZoomRaw, MIN_CAMERA_ZOOM)
            : this.camera.zoom;

        if (Math.abs(nextZoom - this.camera.zoom) < 1e-5) {
            return;
        }

        this.camera.zoom = nextZoom;

        const visibleDomainSize = this.getVisibleDomainSize();
        this.camera.centerX = domainUvBeforeZoom.x - (canvasUv.x - 0.5) * visibleDomainSize.x;
        this.camera.centerY = domainUvBeforeZoom.y - (canvasUv.y - 0.5) * visibleDomainSize.y;
        this.updateResetViewButton();
    }

    private frame(nowMs: number): void {
        const nowSeconds = nowMs * 0.001;

        const dt =
            this.lastTimeSeconds === null
                ? 1 / 60
                : Math.min(1 / 30, nowSeconds - this.lastTimeSeconds);

        this.lastTimeSeconds = nowSeconds;

        if (this.pointerMode === 'dye' && this.pointerCurrentUv && this.pointerPreviousUv) {
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
            this.simulationParams.heaterTemperature,
            this.flow.getDomainAspectRatio(),
            this.camera.centerX,
            this.camera.centerY,
            this.camera.zoom
        );

        requestAnimationFrame(this.frame);
    }

    private getPointerUv(event: PointerEvent): Point | null {
        return this.canvasUvToDomainUv(this.getCanvasUv(event));
    }

    private getCanvasUv(event: MouseEvent): Point {
        const rect = this.gpu.canvas.getBoundingClientRect();
        return {
            x: clamp((event.clientX - rect.left) / rect.width, 0.0, 1.0),
            y: clamp((event.clientY - rect.top) / rect.height, 0.0, 1.0)
        };
    }

    private canvasUvToDomainUv(canvasUv: Point): Point | null {
        const domainUv = this.canvasUvToDomainUvUnclamped(canvasUv);

        if (!this.isInsideDomain(domainUv)) {
            return null;
        }

        return domainUv;
    }

    private canvasUvToDomainUvUnclamped(canvasUv: Point): Point {
        const visibleDomainSize = this.getVisibleDomainSize();

        return {
            x: this.camera.centerX + (canvasUv.x - 0.5) * visibleDomainSize.x,
            y: this.camera.centerY + (canvasUv.y - 0.5) * visibleDomainSize.y
        };
    }

    private getVisibleDomainSize(): Point {
        const viewportAspectRatio = this.getViewportAspectRatio();
        const domainAspectRatio = this.flow.getDomainAspectRatio();
        const zoom = Math.max(MIN_CAMERA_ZOOM, this.camera.zoom);

        if (viewportAspectRatio > domainAspectRatio) {
            return {
                x: viewportAspectRatio / domainAspectRatio / zoom,
                y: 1.0 / zoom
            };
        }

        return {
            x: 1.0 / zoom,
            y: domainAspectRatio / viewportAspectRatio / zoom
        };
    }

    private getViewportAspectRatio(): number {
        const rect = this.gpu.canvas.getBoundingClientRect();
        return Math.max(rect.width / Math.max(rect.height, 1.0), 1e-5);
    }

    private isInsideDomain(point: Point): boolean {
        return point.x >= 0.0 && point.x <= 1.0 && point.y >= 0.0 && point.y <= 1.0;
    }

    private updateCanvasCursor(): void {
        if (this.activePointerId !== null && this.pointerMode === 'pan') {
            this.gpu.canvas.style.cursor = 'grabbing';
            return;
        }

        if (this.activePointerId === null && (this.ctrlPressed || this.shiftPressed)) {
            this.gpu.canvas.style.cursor = 'grab';
            return;
        }

        this.gpu.canvas.style.cursor = '';
    }

    private resetCamera(): void {
        this.camera.centerX = DEFAULT_CAMERA_CENTER;
        this.camera.centerY = DEFAULT_CAMERA_CENTER;
        this.camera.zoom = DEFAULT_CAMERA_ZOOM;
        this.updateResetViewButton();
    }

    private updateResetViewButton(): void {
        this.resetViewButton.classList.toggle(
            'simulation-view-reset--hidden',
            this.isCameraAtDefault()
        );
    }

    private isCameraAtDefault(): boolean {
        return (
            Math.abs(this.camera.centerX - DEFAULT_CAMERA_CENTER) <= CAMERA_RESET_EPSILON &&
            Math.abs(this.camera.centerY - DEFAULT_CAMERA_CENTER) <= CAMERA_RESET_EPSILON &&
            Math.abs(this.camera.zoom - DEFAULT_CAMERA_ZOOM) <= CAMERA_RESET_EPSILON
        );
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
