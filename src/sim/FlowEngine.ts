import {
    type DomainElement,
    MAX_DOMAIN_ELEMENTS
} from './DomainElement';
import { PingPongTexture } from './PingPongTexture';
import { FlowSimulationParams } from './FlowSimulationParams';
import advectDyeShader from '../shaders/advect-dye.wgsl?raw';
import advectTemperatureShader from '../shaders/advect-temperature.wgsl?raw';
import advectVelocityShader from '../shaders/advect-velocity.wgsl?raw';
import applyBuoyancyShader from '../shaders/apply-buoyancy.wgsl?raw';
import computeDivergenceShader from '../shaders/compute-divergence.wgsl?raw';
import projectVelocityShader from '../shaders/project-velocity.wgsl?raw';
import solvePressureShader from '../shaders/solve-pressure.wgsl?raw';

const DOMAIN_WIDTH_METERS = 1;
const DOMAIN_HEIGHT_METERS = 1.2;
const HEATER_DIAMETER_METERS = 0.015;
const HEATER_RADIUS_METERS = HEATER_DIAMETER_METERS * 0.5;
const AMBIENT_WALL_THICKNESS_METERS = 0.008;
const MIN_AMBIENT_WALL_LENGTH_METERS = 0.002;
const WL352_CHANNEL_WALL_THICKNESS_METERS = 0.004;
const WL352_CHANNEL_WIDTH_METERS = 0.12;
const WL352_CHANNEL_HEIGHT_METERS = 1.0;
const WL352_CHANNEL_CENTER_X_METERS = DOMAIN_WIDTH_METERS * 0.5;
const WL352_CHANNEL_LEFT_WALL_X_METERS =
    WL352_CHANNEL_CENTER_X_METERS - 0.5 * WL352_CHANNEL_WIDTH_METERS;
const WL352_CHANNEL_RIGHT_WALL_X_METERS =
    WL352_CHANNEL_CENTER_X_METERS + 0.5 * WL352_CHANNEL_WIDTH_METERS;
const WL352_CHANNEL_BOTTOM_Y_METERS =
    0.5 * (DOMAIN_HEIGHT_METERS - WL352_CHANNEL_HEIGHT_METERS);
const WL352_CHANNEL_TOP_Y_METERS =
    WL352_CHANNEL_BOTTOM_Y_METERS + WL352_CHANNEL_HEIGHT_METERS;
const WL352_BUNDLE_CENTER_X_METERS = WL352_CHANNEL_CENTER_X_METERS;
const WL352_BUNDLE_CENTER_Y_METERS = DOMAIN_HEIGHT_METERS * 0.80 - 0.20;
const WL352_ROD_HORIZONTAL_PITCH_METERS = 0.03;
const WL352_ROD_VERTICAL_PITCH_METERS = 0.02;
const MAX_SUBSTEPS_PER_FRAME = 24;
const SUBSTEP_SAFETY_FACTOR = 0.05;
const BUOYANCY_DISPLACEMENT_FRACTION = 0.35;
const MIN_PRESSURE_ITERATIONS_PER_SUBSTEP = 6;
const DYE_BRUSH_RADIUS_METERS = 0.006;
const DYE_BRUSH_STRENGTH = 3.0;
const DOMAIN_ELEMENT_STRIDE_BYTES = 48;
const DOMAIN_ELEMENT_TYPE_NONE = 0;
const DOMAIN_ELEMENT_TYPE_AMBIENT_WALL = 1;
const DOMAIN_ELEMENT_TYPE_HOT_CIRCLE = 2;
const DOMAIN_ELEMENT_DYNAMIC_TEMPERATURE_SENTINEL = -1e30;

type Point = {
    x: number;
    y: number;
};

type DyeBrushState = {
    active: boolean;
    fromUv: Point;
    toUv: Point;
};

export class FlowEngine {
    private readonly device: GPUDevice;
    private readonly width: number;
    private readonly height: number;
    readonly simulationParams: FlowSimulationParams;

    private readonly dye: PingPongTexture;
    private readonly temperature: PingPongTexture;
    private readonly velocity: PingPongTexture;
    private readonly pressure: PingPongTexture;
    private readonly divergenceTexture: GPUTexture;
    private readonly divergenceView: GPUTextureView;

    private readonly paramsBuffer: GPUBuffer;
    private readonly domainElementsBuffer: GPUBuffer;
    private domainElements: DomainElement[];

    private readonly advectVelocityPipeline: GPUComputePipeline;
    private readonly buoyancyPipeline: GPUComputePipeline;
    private readonly divergencePipeline: GPUComputePipeline;
    private readonly pressurePipeline: GPUComputePipeline;
    private readonly projectVelocityPipeline: GPUComputePipeline;
    private readonly dyePipeline: GPUComputePipeline;
    private readonly temperaturePipeline: GPUComputePipeline;
    private readonly dyeBrush: DyeBrushState = {
        active: false,
        fromUv: { x: 0.5, y: 0.5 },
        toUv: { x: 0.5, y: 0.5 }
    };

    constructor(
        device: GPUDevice,
        width = 512,
        height = 512
    ) {
        this.device = device;
        this.width = width;
        this.height = height;
        this.simulationParams = new FlowSimulationParams();
        this.domainElements = createDefaultDomainElements();

        const scalarUsage =
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.COPY_SRC;

        const vectorUsage =
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.COPY_SRC;

        this.dye = new PingPongTexture(
            device,
            width,
            height,
            'rgba32float',
            scalarUsage
        );

        this.temperature = new PingPongTexture(
            device,
            width,
            height,
            'rgba32float',
            scalarUsage
        );

        this.velocity = new PingPongTexture(
            device,
            width,
            height,
            'rgba32float',
            vectorUsage
        );

        this.pressure = new PingPongTexture(
            device,
            width,
            height,
            'rgba32float',
            vectorUsage
        );

        this.divergenceTexture = device.createTexture({
            size: { width, height },
            format: 'rgba32float',
            usage: vectorUsage
        });

        this.divergenceView = this.divergenceTexture.createView();

        this.paramsBuffer = device.createBuffer({
            size: 96,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.domainElementsBuffer = device.createBuffer({
            size: MAX_DOMAIN_ELEMENTS * DOMAIN_ELEMENT_STRIDE_BYTES,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.advectVelocityPipeline = this.createComputePipeline(advectVelocityShader);
        this.buoyancyPipeline = this.createComputePipeline(applyBuoyancyShader);
        this.divergencePipeline = this.createComputePipeline(computeDivergenceShader);
        this.pressurePipeline = this.createComputePipeline(solvePressureShader);
        this.projectVelocityPipeline = this.createComputePipeline(projectVelocityShader);
        this.temperaturePipeline = this.createComputePipeline(advectTemperatureShader);
        this.dyePipeline = this.createComputePipeline(advectDyeShader);

        this.writeDomainElements(this.simulationParams);
        this.resetSimulationFields();
    }

    getDyeView(): GPUTextureView {
        return this.dye.readView;
    }

    getTemperatureView(): GPUTextureView {
        return this.temperature.readView;
    }

    getVelocityView(): GPUTextureView {
        return this.velocity.readView;
    }

    getDomainElementsBuffer(): GPUBuffer {
        return this.domainElementsBuffer;
    }

    getDomainElements(): readonly DomainElement[] {
        return this.domainElements;
    }

    getDomainAspectRatio(): number {
        return DOMAIN_WIDTH_METERS / DOMAIN_HEIGHT_METERS;
    }

    getDomainWidthMeters(): number {
        return DOMAIN_WIDTH_METERS;
    }

    getDomainHeightMeters(): number {
        return DOMAIN_HEIGHT_METERS;
    }

    async sampleDyeAtUv(uv: Point): Promise<number> {
        const sample = await this.readPixel(this.dye.readTexture, uv);
        return sample[0];
    }

    async sampleTemperatureAtUv(uv: Point): Promise<number> {
        const sample = await this.readPixel(this.temperature.readTexture, uv);
        return sample[0];
    }

    async sampleVelocityAtUv(uv: Point): Promise<{ x: number; y: number; magnitude: number }> {
        const sample = await this.readPixel(this.velocity.readTexture, uv);
        const x = sample[0];
        const y = sample[1];

        return {
            x,
            y,
            magnitude: Math.hypot(x, y)
        };
    }

    setDomainElements(elements: DomainElement[]): void {
        this.domainElements = normalizeDomainElements(elements);
        this.writeDomainElements(this.simulationParams);
        this.resetSimulationFields();
    }

    resetDomainElements(): void {
        this.setDomainElements(createDefaultDomainElements());
    }

    clearDomainElements(): void {
        this.setDomainElements([]);
    }

    addHotCircleAtUv(uv: Point): boolean {
        return this.addDomainElement({
            kind: 'hotCircle',
            center: uvToDomainPoint(clampUv(uv)),
            radius: HEATER_RADIUS_METERS
        });
    }

    addAmbientWallAtUv(fromUv: Point, toUv: Point): boolean {
        const start = uvToDomainPoint(clampUv(fromUv));
        const end = uvToDomainPoint(clampUv(toUv));

        if (distanceBetweenPoints(start, end) < MIN_AMBIENT_WALL_LENGTH_METERS) {
            return false;
        }

        return this.addDomainElement({
            kind: 'ambientWall',
            start,
            end,
            thickness: AMBIENT_WALL_THICKNESS_METERS
        });
    }

    setDyeBrushStroke(fromUv: Point, toUv: Point): void {
        this.dyeBrush.active = true;
        this.dyeBrush.fromUv = clampUv(fromUv);
        this.dyeBrush.toUv = clampUv(toUv);
    }

    clearDyeBrush(): void {
        this.dyeBrush.active = false;
    }

    step(timeSeconds: number, dtSeconds: number): void {
        const settings = this.simulationParams;
        const substepCount = this.getSubstepCount(dtSeconds, settings);
        const substepDt = dtSeconds / substepCount;
        const pressureIterationsPerSubstep = this.getPressureIterationsPerSubstep(
            settings,
            substepCount
        );

        this.writeDomainElements(settings);

        for (let substepIndex = 0; substepIndex < substepCount; substepIndex += 1) {
            const substepTime =
                timeSeconds - dtSeconds + substepDt * (substepIndex + 1);

            this.writeSimulationParams(substepTime, substepDt, settings);

            const workgroupsX = Math.ceil(this.width / 8);
            const workgroupsY = Math.ceil(this.height / 8);
            const encoder = this.device.createCommandEncoder();

            this.encodeComputePass(
                encoder,
                this.advectVelocityPipeline,
                [
                    { binding: 0, resource: this.velocity.readView },
                    { binding: 1, resource: this.velocity.writeView },
                    { binding: 2, resource: { buffer: this.domainElementsBuffer } },
                    { binding: 3, resource: { buffer: this.paramsBuffer } }
                ],
                workgroupsX,
                workgroupsY
            );
            this.velocity.swap();

            this.encodeComputePass(
                encoder,
                this.buoyancyPipeline,
                [
                    { binding: 0, resource: this.temperature.readView },
                    { binding: 1, resource: this.velocity.readView },
                    { binding: 2, resource: this.velocity.writeView },
                    { binding: 3, resource: { buffer: this.domainElementsBuffer } },
                    { binding: 4, resource: { buffer: this.paramsBuffer } }
                ],
                workgroupsX,
                workgroupsY
            );
            this.velocity.swap();

            this.encodeComputePass(
                encoder,
                this.divergencePipeline,
                [
                    { binding: 0, resource: this.velocity.readView },
                    { binding: 1, resource: this.divergenceView },
                    { binding: 2, resource: { buffer: this.domainElementsBuffer } },
                    { binding: 3, resource: { buffer: this.paramsBuffer } }
                ],
                workgroupsX,
                workgroupsY
            );

            for (let i = 0; i < pressureIterationsPerSubstep; i += 1) {
                this.encodeComputePass(
                    encoder,
                    this.pressurePipeline,
                    [
                        { binding: 0, resource: this.pressure.readView },
                        { binding: 1, resource: this.divergenceView },
                        { binding: 2, resource: this.pressure.writeView },
                        { binding: 3, resource: { buffer: this.domainElementsBuffer } },
                        { binding: 4, resource: { buffer: this.paramsBuffer } }
                    ],
                    workgroupsX,
                    workgroupsY
                );
                this.pressure.swap();
            }

            this.encodeComputePass(
                encoder,
                this.projectVelocityPipeline,
                [
                    { binding: 0, resource: this.velocity.readView },
                    { binding: 1, resource: this.pressure.readView },
                    { binding: 2, resource: this.velocity.writeView },
                    { binding: 3, resource: { buffer: this.domainElementsBuffer } },
                    { binding: 4, resource: { buffer: this.paramsBuffer } }
                ],
                workgroupsX,
                workgroupsY
            );
            this.velocity.swap();

            this.encodeComputePass(
                encoder,
                this.temperaturePipeline,
                [
                    { binding: 0, resource: this.temperature.readView },
                    { binding: 1, resource: this.velocity.readView },
                    { binding: 2, resource: this.temperature.writeView },
                    { binding: 3, resource: { buffer: this.domainElementsBuffer } },
                    { binding: 4, resource: { buffer: this.paramsBuffer } }
                ],
                workgroupsX,
                workgroupsY
            );
            this.temperature.swap();

            this.encodeComputePass(
                encoder,
                this.dyePipeline,
                [
                    { binding: 0, resource: this.dye.readView },
                    { binding: 1, resource: this.velocity.readView },
                    { binding: 2, resource: this.dye.writeView },
                    { binding: 3, resource: { buffer: this.domainElementsBuffer } },
                    { binding: 4, resource: { buffer: this.paramsBuffer } }
                ],
                workgroupsX,
                workgroupsY
            );
            this.dye.swap();

            this.device.queue.submit([encoder.finish()]);
        }
    }

    private addDomainElement(element: DomainElement): boolean {
        if (this.domainElements.length >= MAX_DOMAIN_ELEMENTS) {
            return false;
        }

        this.setDomainElements([
            ...this.domainElements,
            element
        ]);

        return true;
    }

    private createComputePipeline(code: string): GPUComputePipeline {
        return this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code }),
                entryPoint: 'main'
            }
        });
    }

    private writeDomainElements(settings: FlowSimulationParams): void {
        const buffer = new ArrayBuffer(MAX_DOMAIN_ELEMENTS * DOMAIN_ELEMENT_STRIDE_BYTES);
        const view = new DataView(buffer);

        for (let index = 0; index < MAX_DOMAIN_ELEMENTS; index += 1) {
            const element = this.domainElements[index];
            const baseOffset = index * DOMAIN_ELEMENT_STRIDE_BYTES;

            if (!element) {
                view.setUint32(baseOffset, DOMAIN_ELEMENT_TYPE_NONE, true);
                continue;
            }

            if (element.kind === 'ambientWall') {
                view.setUint32(baseOffset, DOMAIN_ELEMENT_TYPE_AMBIENT_WALL, true);
                view.setFloat32(baseOffset + 16, element.start.x, true);
                view.setFloat32(baseOffset + 20, element.start.y, true);
                view.setFloat32(baseOffset + 24, element.end.x, true);
                view.setFloat32(baseOffset + 28, element.end.y, true);
                view.setFloat32(baseOffset + 32, element.thickness, true);
                continue;
            }

            view.setUint32(baseOffset, DOMAIN_ELEMENT_TYPE_HOT_CIRCLE, true);
            view.setFloat32(baseOffset + 16, element.center.x, true);
            view.setFloat32(baseOffset + 20, element.center.y, true);
            view.setFloat32(baseOffset + 24, element.radius, true);
            const explicitTemperature = element.temperature;
            const serializedTemperature =
                typeof explicitTemperature === 'number' && Number.isFinite(explicitTemperature)
                    ? explicitTemperature
                    : DOMAIN_ELEMENT_DYNAMIC_TEMPERATURE_SENTINEL;
            view.setFloat32(
                baseOffset + 28,
                serializedTemperature,
                true
            );
        }

        this.device.queue.writeBuffer(this.domainElementsBuffer, 0, buffer);
    }

    private writeSimulationParams(
        timeSeconds: number,
        dtSeconds: number,
        settings: FlowSimulationParams
    ): void {
        const brushFrom = uvToDomainPoint(this.dyeBrush.fromUv);
        const brushTo = uvToDomainPoint(this.dyeBrush.toUv);

        this.device.queue.writeBuffer(
            this.paramsBuffer,
            0,
            new Float32Array([
                timeSeconds,
                dtSeconds,
                this.width,
                this.height,
                DOMAIN_WIDTH_METERS / this.width,
                DOMAIN_HEIGHT_METERS / this.height,
                settings.ambientTemperature,
                settings.gravity,
                settings.thermalExpansionCoefficient,
                settings.kinematicViscosity,
                settings.thermalDiffusivity,
                settings.dyeDecayRate,
                settings.heaterTemperature,
                0.0,
                0.0,
                0.0,
                brushFrom.x,
                brushFrom.y,
                brushTo.x,
                brushTo.y,
                DYE_BRUSH_RADIUS_METERS,
                DYE_BRUSH_STRENGTH,
                this.dyeBrush.active ? 1.0 : 0.0,
                0.0
            ])
        );
    }

    private encodeComputePass(
        encoder: GPUCommandEncoder,
        pipeline: GPUComputePipeline,
        entries: GPUBindGroupEntry[],
        workgroupsX: number,
        workgroupsY: number
    ): void {
        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries
        });

        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();
    }

    private resetSimulationFields(): void {
        this.clearField(this.dye, 16);
        this.clearField(this.velocity, 16);
        this.clearField(this.pressure, 16);
        this.clearTexture(this.divergenceTexture, 16);
        this.initializeTemperatureField();
    }

    private clearField(field: PingPongTexture, bytesPerTexel: number): void {
        this.clearTexture(field.readTexture, bytesPerTexel);
        this.clearTexture(field.writeTexture, bytesPerTexel);
    }

    private initializeTemperatureField(): void {
        this.initializeTemperatureTexture(this.temperature.readTexture);
        this.initializeTemperatureTexture(this.temperature.writeTexture);
    }

    private getSubstepCount(
        dtSeconds: number,
        settings: FlowSimulationParams
    ): number {
        const dx = DOMAIN_WIDTH_METERS / this.width;
        const dy = DOMAIN_HEIGHT_METERS / this.height;
        const minCellSize = Math.min(dx, dy);
        const inverseGridScale =
            1.0 / (dx * dx) +
            1.0 / (dy * dy);
        const maxDiffusion =
            Math.max(settings.kinematicViscosity, settings.thermalDiffusivity);
        const stableDtFromDiffusion =
            maxDiffusion > 0.0
                ? SUBSTEP_SAFETY_FACTOR /
                    (maxDiffusion * inverseGridScale)
                : Number.POSITIVE_INFINITY;
        const maxHotTemperature = this.getMaxHotTemperature(settings);
        const buoyancyAcceleration =
            settings.gravity *
            settings.thermalExpansionCoefficient *
            Math.max(maxHotTemperature - settings.ambientTemperature, 0.0);
        const stableDtFromBuoyancy =
            buoyancyAcceleration > 0.0
                ? Math.sqrt(
                    2.0 *
                    BUOYANCY_DISPLACEMENT_FRACTION *
                    minCellSize /
                    buoyancyAcceleration
                )
                : Number.POSITIVE_INFINITY;
        const stableDt = Math.min(stableDtFromDiffusion, stableDtFromBuoyancy);

        if (!Number.isFinite(stableDt) || stableDt <= 0.0) {
            return 1;
        }

        return Math.max(
            1,
            Math.min(
                MAX_SUBSTEPS_PER_FRAME,
                Math.ceil(dtSeconds / stableDt)
            )
        );
    }

    private getPressureIterationsPerSubstep(
        settings: FlowSimulationParams,
        substepCount: number
    ): number {
        if (substepCount <= 1) {
            return settings.pressureIterations;
        }

        return Math.min(
            settings.pressureIterations,
            Math.max(
                MIN_PRESSURE_ITERATIONS_PER_SUBSTEP,
                Math.ceil(settings.pressureIterations / substepCount)
            )
        );
    }

    private getMaxHotTemperature(settings: FlowSimulationParams): number {
        let maxTemperature = settings.ambientTemperature;

        for (const element of this.domainElements) {
            if (element.kind !== 'hotCircle') {
                continue;
            }

            const explicitTemperature = element.temperature;
            const resolvedTemperature =
                typeof explicitTemperature === 'number' && Number.isFinite(explicitTemperature)
                    ? explicitTemperature
                    : settings.heaterTemperature;
            maxTemperature = Math.max(
                maxTemperature,
                resolvedTemperature
            );
        }

        return maxTemperature;
    }

    private initializeTemperatureTexture(texture: GPUTexture): void {
        const dx = DOMAIN_WIDTH_METERS / this.width;
        const dy = DOMAIN_HEIGHT_METERS / this.height;
        const data = new Float32Array(this.width * this.height * 4);

        for (let y = 0; y < this.height; y += 1) {
            for (let x = 0; x < this.width; x += 1) {
                const index = (y * this.width + x) * 4;
                const position = {
                    x: (x + 0.5) * dx,
                    y: (y + 0.5) * dy
                };
                const temperature =
                    this.getSolidTemperatureAtPosition(position, this.simulationParams) ??
                    this.simulationParams.ambientTemperature;

                data[index] = temperature;
                data[index + 1] = temperature;
                data[index + 2] = temperature;
                data[index + 3] = 1.0;
            }
        }

        this.device.queue.writeTexture(
            { texture },
            data,
            { bytesPerRow: this.width * 16, rowsPerImage: this.height },
            { width: this.width, height: this.height, depthOrArrayLayers: 1 }
        );
    }

    private getSolidTemperatureAtPosition(
        position: Point,
        settings: FlowSimulationParams
    ): number | null {
        for (const element of this.domainElements) {
            if (element.kind === 'ambientWall') {
                if (
                    distanceToSegment(position, element.start, element.end) <=
                    element.thickness * 0.5
                ) {
                    return settings.ambientTemperature;
                }

                continue;
            }

            const dx = position.x - element.center.x;
            const dy = position.y - element.center.y;

            if (dx * dx + dy * dy <= element.radius * element.radius) {
                const explicitTemperature = element.temperature;
                return Number.isFinite(explicitTemperature)
                    ? explicitTemperature ?? settings.heaterTemperature
                    : settings.heaterTemperature;
            }
        }

        return null;
    }

    private clearTexture(texture: GPUTexture, bytesPerTexel: number): void {
        const zero = new Uint8Array(this.width * this.height * bytesPerTexel);

        this.device.queue.writeTexture(
            { texture },
            zero,
            { bytesPerRow: this.width * bytesPerTexel, rowsPerImage: this.height },
            { width: this.width, height: this.height, depthOrArrayLayers: 1 }
        );
    }

    private async readPixel(texture: GPUTexture, uv: Point): Promise<Float32Array> {
        const { x, y } = this.getTexelCoordinates(uv);
        const bytesPerRow = 256;
        const buffer = this.device.createBuffer({
            size: bytesPerRow,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        const encoder = this.device.createCommandEncoder();

        encoder.copyTextureToBuffer(
            {
                texture,
                origin: { x, y, z: 0 }
            },
            {
                buffer,
                bytesPerRow,
                rowsPerImage: 1
            },
            {
                width: 1,
                height: 1,
                depthOrArrayLayers: 1
            }
        );

        this.device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ);

        const mapped = buffer.getMappedRange();
        const result = new Float32Array(4);
        result.set(new Float32Array(mapped, 0, 4));

        buffer.unmap();
        buffer.destroy();

        return result;
    }

    private getTexelCoordinates(uv: Point): { x: number; y: number } {
        return {
            x: clamp(Math.floor(uv.x * this.width), 0, this.width - 1),
            y: clamp(Math.floor(uv.y * this.height), 0, this.height - 1)
        };
    }
}

function createDefaultDomainElements(): DomainElement[] {
    const elements: DomainElement[] = [
        {
            kind: 'ambientWall',
            start: {
                x: WL352_CHANNEL_LEFT_WALL_X_METERS,
                y: WL352_CHANNEL_BOTTOM_Y_METERS
            },
            end: {
                x: WL352_CHANNEL_LEFT_WALL_X_METERS,
                y: WL352_CHANNEL_TOP_Y_METERS
            },
            thickness: WL352_CHANNEL_WALL_THICKNESS_METERS
        },
        {
            kind: 'ambientWall',
            start: {
                x: WL352_CHANNEL_RIGHT_WALL_X_METERS,
                y: WL352_CHANNEL_BOTTOM_Y_METERS
            },
            end: {
                x: WL352_CHANNEL_RIGHT_WALL_X_METERS,
                y: WL352_CHANNEL_TOP_Y_METERS
            },
            thickness: WL352_CHANNEL_WALL_THICKNESS_METERS
        }
    ];

    const rowCenterOffsets = [
        -2 * WL352_ROD_VERTICAL_PITCH_METERS,
        -1 * WL352_ROD_VERTICAL_PITCH_METERS,
        0.0,
        1 * WL352_ROD_VERTICAL_PITCH_METERS,
        2 * WL352_ROD_VERTICAL_PITCH_METERS
    ];
    const halfPitchX = 0.5 * WL352_ROD_HORIZONTAL_PITCH_METERS;
    const fullPitchX = WL352_ROD_HORIZONTAL_PITCH_METERS;
    const rowXOffsets = [
        [-fullPitchX, 0.0, fullPitchX],
        [-1.5 * fullPitchX, -halfPitchX, halfPitchX, 1.5 * fullPitchX],
        [-fullPitchX, 0.0, fullPitchX],
        [-1.5 * fullPitchX, -halfPitchX, halfPitchX, 1.5 * fullPitchX],
        [-fullPitchX, 0.0, fullPitchX]
    ];

    for (let rowIndex = 0; rowIndex < rowCenterOffsets.length; rowIndex += 1) {
        for (const xOffset of rowXOffsets[rowIndex]) {
            elements.push({
                kind: 'hotCircle',
                center: {
                    x: WL352_BUNDLE_CENTER_X_METERS + xOffset,
                    y: WL352_BUNDLE_CENTER_Y_METERS + rowCenterOffsets[rowIndex]
                },
                radius: HEATER_RADIUS_METERS
            });
        }
    }

    return elements;
}

function normalizeDomainElements(elements: DomainElement[]): DomainElement[] {
    const normalized: DomainElement[] = [];

    for (const element of elements) {
        if (normalized.length >= MAX_DOMAIN_ELEMENTS) {
            break;
        }

        if (element.kind === 'ambientWall') {
            const start = clampDomainPoint(element.start);
            const end = clampDomainPoint(element.end);
            const thickness = clamp(element.thickness, 1e-4, Math.max(DOMAIN_WIDTH_METERS, DOMAIN_HEIGHT_METERS));

            if (distanceBetweenPoints(start, end) < 1e-5) {
                continue;
            }

            normalized.push({
                kind: 'ambientWall',
                start,
                end,
                thickness
            });
            continue;
        }

        const center = clampDomainPoint(element.center);
        const radius = clamp(element.radius, 1e-4, Math.max(DOMAIN_WIDTH_METERS, DOMAIN_HEIGHT_METERS));
        const temperature = Number.isFinite(element.temperature)
            ? element.temperature
            : undefined;

        normalized.push({
            kind: 'hotCircle',
            center,
            radius,
            temperature
        });
    }

    return normalized;
}

function clampUv(point: Point): Point {
    return {
        x: clamp(point.x, 0.0, 1.0),
        y: clamp(point.y, 0.0, 1.0)
    };
}

function clampDomainPoint(point: Point): Point {
    return {
        x: clamp(point.x, 0.0, DOMAIN_WIDTH_METERS),
        y: clamp(point.y, 0.0, DOMAIN_HEIGHT_METERS)
    };
}

function uvToDomainPoint(point: Point): Point {
    return {
        x: point.x * DOMAIN_WIDTH_METERS,
        y: point.y * DOMAIN_HEIGHT_METERS
    };
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
    const abx = end.x - start.x;
    const aby = end.y - start.y;
    const lengthSquared = Math.max(abx * abx + aby * aby, 1e-12);
    const t = clamp(
        ((point.x - start.x) * abx + (point.y - start.y) * aby) / lengthSquared,
        0.0,
        1.0
    );
    const closestX = start.x + abx * t;
    const closestY = start.y + aby * t;

    return Math.hypot(point.x - closestX, point.y - closestY);
}

function distanceBetweenPoints(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
