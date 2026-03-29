import { GpuContext } from '../gpu/GpuContext';
import { FieldRenderer } from '../render/FieldRenderer';
import { RenderMode } from '../render/RenderMode';
import { type DomainEditMode } from '../sim/DomainElement';
import { FlowEngine } from '../sim/FlowEngine';
import { FlowSimulationParams } from '../sim/FlowSimulationParams';
import { DomainToolsPanel } from '../ui/DomainToolsPanel';
import { SimulationControlPanel } from '../ui/SimulationControlPanel';

type Point = {
    x: number;
    y: number;
};

type PointerInteractionMode = 'dye' | 'pan' | 'ambientWall';

const MIN_CAMERA_ZOOM = 1e-4;
const ZOOM_SENSITIVITY = 0.0015;
const DEFAULT_CAMERA_CENTER = 0.5;
const DEFAULT_CAMERA_ZOOM = 1.0;
const CAMERA_RESET_EPSILON = 1e-4;
const HOVER_PROBE_INTERVAL_SECONDS = 0.08;

export class App {
    private readonly gpu: GpuContext;

    private readonly renderer: FieldRenderer;
    private readonly flow: FlowEngine;
    private readonly controls: SimulationControlPanel;
    private readonly domainTools: DomainToolsPanel;
    private readonly resetViewButton: HTMLButtonElement;
    private readonly hoverReadout: HTMLDivElement;
    private readonly hoverReadoutCoords: HTMLDivElement;
    private readonly hoverReadoutValue: HTMLDivElement;
    readonly simulationParams: FlowSimulationParams;

    private lastTimeSeconds: number | null = null;
    private renderMode = RenderMode.Temperature;
    private domainEditMode: DomainEditMode = 'navigate';
    private activePointerId: number | null = null;
    private pointerMode: PointerInteractionMode | null = null;
    private pointerCurrentUv: Point | null = null;
    private pointerPreviousUv: Point | null = null;
    private wallDraftStartUv: Point | null = null;
    private wallDraftCurrentUv: Point | null = null;
    private panPreviousCanvasUv: Point | null = null;
    private hoverUv: Point | null = null;
    private ctrlPressed = false;
    private shiftPressed = false;
    private hoverProbeRequestId = 0;
    private hoverProbeInFlight = false;
    private hoverProbeLastRequestTime = Number.NEGATIVE_INFINITY;
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
                this.invalidateHoverProbe(true);
            }
        );
        this.domainTools = new DomainToolsPanel(
            this.domainEditMode,
            this.flow.getDomainElements().length,
            (mode) => {
                this.domainEditMode = mode;
                this.updateCanvasCursor();
            },
            () => {
                this.flow.clearDomainElements();
                this.domainTools.refresh(this.flow.getDomainElements().length);
                this.invalidateHoverProbe(true);
            },
            () => {
                this.flow.resetDomainElements();
                this.domainTools.refresh(this.flow.getDomainElements().length);
                this.invalidateHoverProbe(true);
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
        document.querySelector('.simulation-readout')?.remove();
        this.hoverReadout = document.createElement('div');
        this.hoverReadout.className = 'simulation-readout simulation-readout--hidden';
        this.hoverReadoutCoords = document.createElement('div');
        this.hoverReadoutCoords.className = 'simulation-readout__coords';
        this.hoverReadoutValue = document.createElement('div');
        this.hoverReadoutValue.className = 'simulation-readout__value';
        this.hoverReadout.appendChild(this.hoverReadoutCoords);
        this.hoverReadout.appendChild(this.hoverReadoutValue);
        document.body.appendChild(this.hoverReadout);

        this.handleResize = this.handleResize.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handlePointerLeave = this.handlePointerLeave.bind(this);
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
        this.gpu.canvas.addEventListener('pointerleave', this.handlePointerLeave);
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

        if (event.button === 1 || event.ctrlKey || event.shiftKey) {
            this.activePointerId = event.pointerId;
            this.pointerMode = 'pan';
            this.panPreviousCanvasUv = this.getCanvasUv(event);
            this.pointerCurrentUv = null;
            this.pointerPreviousUv = null;
            this.wallDraftStartUv = null;
            this.wallDraftCurrentUv = null;
            this.gpu.canvas.setPointerCapture(event.pointerId);
            this.updateCanvasCursor();
            event.preventDefault();
            return;
        }

        if (this.domainEditMode === 'hotCircle') {
            const uv = this.getPointerUv(event);
            if (!uv) {
                return;
            }

            if (this.flow.addHotCircleAtUv(uv)) {
                this.domainTools.refresh(this.flow.getDomainElements().length);
                this.invalidateHoverProbe(true);
            }
            event.preventDefault();
            return;
        }

        if (this.domainEditMode === 'ambientWall') {
            this.activePointerId = event.pointerId;
            this.pointerMode = 'ambientWall';
            this.wallDraftStartUv = this.getClampedPointerUv(event);
            this.wallDraftCurrentUv = this.wallDraftStartUv;
            this.pointerCurrentUv = null;
            this.pointerPreviousUv = null;
            this.panPreviousCanvasUv = null;
            this.gpu.canvas.setPointerCapture(event.pointerId);
            this.updateCanvasCursor();
            event.preventDefault();
            return;
        }

        this.activePointerId = event.pointerId;
        this.pointerMode = 'dye';
        const uv = this.getPointerUv(event);
        if (!uv) {
            this.activePointerId = null;
            this.pointerMode = null;
            return;
        }

        this.pointerCurrentUv = uv;
        this.pointerPreviousUv = uv;
        this.panPreviousCanvasUv = null;
        this.wallDraftStartUv = null;
        this.wallDraftCurrentUv = null;
        this.gpu.canvas.setPointerCapture(event.pointerId);
        this.updateCanvasCursor();
        event.preventDefault();
    }

    private handlePointerMove(event: PointerEvent): void {
        this.hoverUv = this.canvasUvToDomainUv(this.getCanvasUv(event));
        this.updateHoverReadoutCoordinates();
        this.updateHoverReadoutVisibility();

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

        if (this.pointerMode === 'ambientWall') {
            this.wallDraftCurrentUv = this.getClampedPointerUv(event);
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

        if (
            this.pointerMode === 'ambientWall' &&
            this.wallDraftStartUv &&
            this.wallDraftCurrentUv
        ) {
            if (this.flow.addAmbientWallAtUv(this.wallDraftStartUv, this.wallDraftCurrentUv)) {
                this.domainTools.refresh(this.flow.getDomainElements().length);
                this.invalidateHoverProbe(true);
            }
        }

        if (this.gpu.canvas.hasPointerCapture(event.pointerId)) {
            this.gpu.canvas.releasePointerCapture(event.pointerId);
        }

        this.activePointerId = null;
        this.pointerMode = null;
        this.pointerCurrentUv = null;
        this.pointerPreviousUv = null;
        this.wallDraftStartUv = null;
        this.wallDraftCurrentUv = null;
        this.panPreviousCanvasUv = null;
        this.flow.clearDyeBrush();
        this.updateCanvasCursor();
    }

    private handlePointerLeave(): void {
        this.hoverUv = null;
        this.invalidateHoverProbe(true);
        this.updateHoverReadoutVisibility();
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
            this.flow.getPressureView(),
            this.flow.getDomainElementsBuffer(),
            this.renderMode,
            this.simulationParams.ambientTemperature,
            this.simulationParams.heaterTemperature,
            this.simulationParams.gravity,
            this.simulationParams.thermalExpansionCoefficient,
            this.flow.getDomainAspectRatio(),
            this.flow.getDomainWidthMeters(),
            this.flow.getDomainHeightMeters(),
            this.camera.centerX,
            this.camera.centerY,
            this.camera.zoom
        );
        this.scheduleHoverProbe(nowSeconds);

        requestAnimationFrame(this.frame);
    }

    private getPointerUv(event: PointerEvent): Point | null {
        return this.canvasUvToDomainUv(this.getCanvasUv(event));
    }

    private getClampedPointerUv(event: MouseEvent): Point {
        const uv = this.canvasUvToDomainUvUnclamped(this.getCanvasUv(event));

        return {
            x: clamp(uv.x, 0.0, 1.0),
            y: clamp(uv.y, 0.0, 1.0)
        };
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

        if (this.domainEditMode !== 'navigate') {
            this.gpu.canvas.style.cursor = 'crosshair';
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

    private scheduleHoverProbe(nowSeconds: number): void {
        if (!this.hoverUv) {
            this.updateHoverReadoutVisibility();
            return;
        }

        if (this.hoverProbeInFlight) {
            return;
        }

        if (nowSeconds - this.hoverProbeLastRequestTime < HOVER_PROBE_INTERVAL_SECONDS) {
            return;
        }

        const requestId = this.hoverProbeRequestId;
        const uv = { ...this.hoverUv };
        const mode = this.renderMode;

        this.hoverProbeInFlight = true;
        this.hoverProbeLastRequestTime = nowSeconds;

        void this.requestHoverProbe(requestId, uv, mode);
    }

    private async requestHoverProbe(
        requestId: number,
        uv: Point,
        mode: RenderMode
    ): Promise<void> {
        try {
            let valueText = '';

            if (mode === RenderMode.Dye) {
                const value = await this.flow.sampleDyeAtUv(uv);
                valueText = `Dye ${value.toFixed(3)}`;
            } else if (mode === RenderMode.Temperature) {
                const value = await this.flow.sampleTemperatureAtUv(uv);
                valueText = `Temperature ${value.toFixed(2)} °C`;
            } else if (mode === RenderMode.Velocity) {
                const value = await this.flow.sampleVelocityAtUv(uv);
                valueText =
                    `Speed ${value.magnitude.toFixed(3)} m/s | ` +
                    `vx ${value.x.toFixed(3)} | vy ${value.y.toFixed(3)}`;
            } else {
                const value = await this.flow.samplePressureAtUv(uv);
                valueText = `Projection pressure q ${value.toExponential(3)} m^2/s`;
            }

            if (requestId !== this.hoverProbeRequestId || !this.hoverUv) {
                return;
            }

            this.updateHoverReadoutValue(valueText);
        } finally {
            this.hoverProbeInFlight = false;
        }
    }

    private updateHoverReadoutCoordinates(): void {
        if (!this.hoverUv) {
            return;
        }

        const xMeters = this.hoverUv.x * this.flow.getDomainWidthMeters();
        const yMeters = this.hoverUv.y * this.flow.getDomainHeightMeters();

        this.hoverReadoutCoords.textContent =
            `x ${xMeters.toFixed(3)} m | y ${yMeters.toFixed(3)} m`;
    }

    private updateHoverReadoutValue(valueText: string): void {
        this.hoverReadoutValue.textContent = valueText;
        this.updateHoverReadoutVisibility();
    }

    private updateHoverReadoutVisibility(): void {
        this.hoverReadout.classList.toggle(
            'simulation-readout--hidden',
            this.hoverUv === null
        );
    }

    private invalidateHoverProbe(clearValue = false): void {
        this.hoverProbeRequestId += 1;

        if (clearValue) {
            this.hoverProbeLastRequestTime = Number.NEGATIVE_INFINITY;
        }
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
