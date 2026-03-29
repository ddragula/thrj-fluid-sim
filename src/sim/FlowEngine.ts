import { PingPongTexture } from './PingPongTexture';
import { FlowSimulationParams } from './FlowSimulationParams';
import advectDyeShader from '../shaders/advect-dye.wgsl?raw';
import advectTemperatureShader from '../shaders/advect-temperature.wgsl?raw';
import advectVelocityShader from '../shaders/advect-velocity.wgsl?raw';
import applyBuoyancyShader from '../shaders/apply-buoyancy.wgsl?raw';
import composeVelocityShader from '../shaders/compose-velocity.wgsl?raw';
import computeDivergenceShader from '../shaders/compute-divergence.wgsl?raw';
import projectVelocityShader from '../shaders/project-velocity.wgsl?raw';
import solvePressureShader from '../shaders/solve-pressure.wgsl?raw';

const DOMAIN_WIDTH_METERS = 0.24;
const DOMAIN_HEIGHT_METERS = 0.40;
const HEATER_DIAMETER_METERS = 0.015;
const HEATER_RADIUS_METERS = HEATER_DIAMETER_METERS * 0.5;
const HEATER_CENTER_X_METERS = DOMAIN_WIDTH_METERS * 0.5;
const HEATER_CENTER_Y_METERS = DOMAIN_HEIGHT_METERS * 0.86;
const MAX_SUBSTEPS_PER_FRAME = 16;
const DIFFUSION_STABILITY_FACTOR = 0.24;
const BUOYANCY_STABILITY_FACTOR = 0.5;
const DYE_BRUSH_RADIUS_METERS = 0.005;
const DYE_BRUSH_STRENGTH = 2.0;

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
    private readonly velocityX: PingPongTexture;
    private readonly velocityY: PingPongTexture;
    private readonly pressure: PingPongTexture;
    private readonly divergenceTexture: GPUTexture;
    private readonly divergenceView: GPUTextureView;
    private readonly velocityTexture: GPUTexture;
    private readonly velocityView: GPUTextureView;

    private readonly paramsBuffer: GPUBuffer;

    private readonly advectVelocityPipeline: GPUComputePipeline;
    private readonly buoyancyPipeline: GPUComputePipeline;
    private readonly composeVelocityPipeline: GPUComputePipeline;
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

        const scalarUsage =
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST;

        const vectorUsage =
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST;

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

        this.velocityX = new PingPongTexture(
            device,
            width + 1,
            height,
            'rgba32float',
            vectorUsage
        );

        this.velocityY = new PingPongTexture(
            device,
            width,
            height + 1,
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

        this.velocityTexture = device.createTexture({
            size: { width, height },
            format: 'rgba32float',
            usage: vectorUsage
        });

        this.velocityView = this.velocityTexture.createView();

        this.paramsBuffer = device.createBuffer({
            size: 96,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.advectVelocityPipeline = this.createComputePipeline(advectVelocityShader);
        this.buoyancyPipeline = this.createComputePipeline(applyBuoyancyShader);
        this.composeVelocityPipeline = this.createComputePipeline(composeVelocityShader);
        this.divergencePipeline = this.createComputePipeline(computeDivergenceShader);
        this.pressurePipeline = this.createComputePipeline(solvePressureShader);
        this.projectVelocityPipeline = this.createComputePipeline(projectVelocityShader);
        this.temperaturePipeline = this.createComputePipeline(advectTemperatureShader);
        this.dyePipeline = this.createComputePipeline(advectDyeShader);

        this.clearField(this.dye, 16);
        this.clearField(this.velocityX, 16);
        this.clearField(this.velocityY, 16);
        this.clearField(this.pressure, 16);
        this.clearTexture(this.divergenceTexture, this.width, this.height, 16);
        this.clearTexture(this.velocityTexture, this.width, this.height, 16);
        this.initializeTemperatureField();
    }

    getDyeView(): GPUTextureView {
        return this.dye.readView;
    }

    getTemperatureView(): GPUTextureView {
        return this.temperature.readView;
    }

    getVelocityView(): GPUTextureView {
        return this.velocityView;
    }

    getDomainAspectRatio(): number {
        return DOMAIN_WIDTH_METERS / DOMAIN_HEIGHT_METERS;
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

        for (let substepIndex = 0; substepIndex < substepCount; substepIndex += 1) {
            const substepTime =
                timeSeconds - dtSeconds + substepDt * (substepIndex + 1);

            this.writeSimulationParams(substepTime, substepDt, settings);

            const scalarWorkgroupsX = Math.ceil(this.width / 8);
            const scalarWorkgroupsY = Math.ceil(this.height / 8);
            const velocityWorkgroupsX = Math.ceil((this.width + 1) / 8);
            const velocityWorkgroupsY = Math.ceil((this.height + 1) / 8);
            const verticalVelocityWorkgroupsX = Math.ceil(this.width / 8);
            const verticalVelocityWorkgroupsY = Math.ceil((this.height + 1) / 8);
            const encoder = this.device.createCommandEncoder();

            this.encodeComputePass(
                encoder,
                this.advectVelocityPipeline,
                [
                    { binding: 0, resource: this.velocityX.readView },
                    { binding: 1, resource: this.velocityY.readView },
                    { binding: 2, resource: this.velocityX.writeView },
                    { binding: 3, resource: this.velocityY.writeView },
                    { binding: 4, resource: { buffer: this.paramsBuffer } }
                ],
                velocityWorkgroupsX,
                velocityWorkgroupsY
            );
            this.velocityX.swap();
            this.velocityY.swap();

            this.encodeComputePass(
                encoder,
                this.buoyancyPipeline,
                [
                    { binding: 0, resource: this.temperature.readView },
                    { binding: 1, resource: this.velocityY.readView },
                    { binding: 2, resource: this.velocityY.writeView },
                    { binding: 3, resource: { buffer: this.paramsBuffer } }
                ],
                verticalVelocityWorkgroupsX,
                verticalVelocityWorkgroupsY
            );
            this.velocityY.swap();

            this.encodeComputePass(
                encoder,
                this.divergencePipeline,
                [
                    { binding: 0, resource: this.velocityX.readView },
                    { binding: 1, resource: this.velocityY.readView },
                    { binding: 2, resource: this.divergenceView },
                    { binding: 3, resource: { buffer: this.paramsBuffer } }
                ],
                scalarWorkgroupsX,
                scalarWorkgroupsY
            );

            for (let i = 0; i < settings.pressureIterations; i += 1) {
                this.encodeComputePass(
                    encoder,
                    this.pressurePipeline,
                    [
                        { binding: 0, resource: this.pressure.readView },
                        { binding: 1, resource: this.divergenceView },
                        { binding: 2, resource: this.pressure.writeView },
                        { binding: 3, resource: { buffer: this.paramsBuffer } }
                    ],
                    scalarWorkgroupsX,
                    scalarWorkgroupsY
                );
                this.pressure.swap();
            }

            this.encodeComputePass(
                encoder,
                this.projectVelocityPipeline,
                [
                    { binding: 0, resource: this.pressure.readView },
                    { binding: 1, resource: this.velocityX.readView },
                    { binding: 2, resource: this.velocityY.readView },
                    { binding: 3, resource: this.velocityX.writeView },
                    { binding: 4, resource: this.velocityY.writeView },
                    { binding: 5, resource: { buffer: this.paramsBuffer } }
                ],
                velocityWorkgroupsX,
                velocityWorkgroupsY
            );
            this.velocityX.swap();
            this.velocityY.swap();

            this.encodeComputePass(
                encoder,
                this.temperaturePipeline,
                [
                    { binding: 0, resource: this.temperature.readView },
                    { binding: 1, resource: this.velocityX.readView },
                    { binding: 2, resource: this.velocityY.readView },
                    { binding: 3, resource: this.temperature.writeView },
                    { binding: 4, resource: { buffer: this.paramsBuffer } }
                ],
                scalarWorkgroupsX,
                scalarWorkgroupsY
            );
            this.temperature.swap();

            this.encodeComputePass(
                encoder,
                this.dyePipeline,
                [
                    { binding: 0, resource: this.dye.readView },
                    { binding: 1, resource: this.velocityX.readView },
                    { binding: 2, resource: this.velocityY.readView },
                    { binding: 3, resource: this.dye.writeView },
                    { binding: 4, resource: { buffer: this.paramsBuffer } }
                ],
                scalarWorkgroupsX,
                scalarWorkgroupsY
            );
            this.dye.swap();

            this.device.queue.submit([encoder.finish()]);
        }

        const composeEncoder = this.device.createCommandEncoder();
        this.encodeComputePass(
            composeEncoder,
            this.composeVelocityPipeline,
            [
                { binding: 0, resource: this.velocityX.readView },
                { binding: 1, resource: this.velocityY.readView },
                { binding: 2, resource: this.velocityView },
                { binding: 3, resource: { buffer: this.paramsBuffer } }
            ],
            Math.ceil(this.width / 8),
            Math.ceil(this.height / 8)
        );
        this.device.queue.submit([composeEncoder.finish()]);
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
                HEATER_CENTER_X_METERS,
                HEATER_CENTER_Y_METERS,
                HEATER_RADIUS_METERS,
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

    private clearField(field: PingPongTexture, bytesPerTexel: number): void {
        this.clearTexture(field.readTexture, field.width, field.height, bytesPerTexel);
        this.clearTexture(field.writeTexture, field.width, field.height, bytesPerTexel);
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
        const inverseGridScale =
            1.0 / (dx * dx) +
            1.0 / (dy * dy);
        const minGridScale = Math.min(dx, dy);
        const maxDiffusion =
            Math.max(settings.kinematicViscosity, settings.thermalDiffusivity);
        const buoyancyAcceleration =
            settings.gravity *
            settings.thermalExpansionCoefficient *
            Math.max(settings.heaterTemperature - settings.ambientTemperature, 0.0);

        const stableDt =
            maxDiffusion > 0.0
                ? DIFFUSION_STABILITY_FACTOR /
                    (maxDiffusion * inverseGridScale)
                : Number.POSITIVE_INFINITY;
        const buoyancyStableDt =
            buoyancyAcceleration > 0.0
                ? Math.sqrt(
                    (BUOYANCY_STABILITY_FACTOR * minGridScale) /
                        buoyancyAcceleration
                )
                : Number.POSITIVE_INFINITY;
        const limitedDt = Math.min(stableDt, buoyancyStableDt);

        if (!Number.isFinite(limitedDt) || limitedDt <= 0.0) {
            return 1;
        }

        return Math.max(
            1,
            Math.min(
                MAX_SUBSTEPS_PER_FRAME,
                Math.ceil(dtSeconds / limitedDt)
            )
        );
    }

    private initializeTemperatureTexture(texture: GPUTexture): void {
        const dx = DOMAIN_WIDTH_METERS / this.width;
        const dy = DOMAIN_HEIGHT_METERS / this.height;
        const data = new Float32Array(this.width * this.height * 4);

        for (let y = 0; y < this.height; y += 1) {
            for (let x = 0; x < this.width; x += 1) {
                const index = (y * this.width + x) * 4;
                const px = (x + 0.5) * dx;
                const py = (y + 0.5) * dy;
                const isHeater =
                    (px - HEATER_CENTER_X_METERS) * (px - HEATER_CENTER_X_METERS) +
                        (py - HEATER_CENTER_Y_METERS) * (py - HEATER_CENTER_Y_METERS) <=
                    HEATER_RADIUS_METERS * HEATER_RADIUS_METERS;
                const temperature = isHeater
                    ? this.simulationParams.heaterTemperature
                    : this.simulationParams.ambientTemperature;

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

    private clearTexture(
        texture: GPUTexture,
        width: number,
        height: number,
        bytesPerTexel: number
    ): void {
        const zero = new Uint8Array(width * height * bytesPerTexel);

        this.device.queue.writeTexture(
            { texture },
            zero,
            { bytesPerRow: width * bytesPerTexel, rowsPerImage: height },
            { width, height, depthOrArrayLayers: 1 }
        );
    }
}

function clampUv(point: Point): Point {
    return {
        x: clamp(point.x, 0.0, 1.0),
        y: clamp(point.y, 0.0, 1.0)
    };
}

function uvToDomainPoint(point: Point): Point {
    return {
        x: point.x * DOMAIN_WIDTH_METERS,
        y: point.y * DOMAIN_HEIGHT_METERS
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
