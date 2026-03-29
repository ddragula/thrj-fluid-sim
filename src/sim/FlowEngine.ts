import { PingPongTexture } from './PingPongTexture';
import advectDyeShader from '../shaders/advect-dye.wgsl?raw';
import advectTemperatureShader from '../shaders/advect-temperature.wgsl?raw';
import advectVelocityShader from '../shaders/advect-velocity.wgsl?raw';
import applyBuoyancyShader from '../shaders/apply-buoyancy.wgsl?raw';
import computeDivergenceShader from '../shaders/compute-divergence.wgsl?raw';
import projectVelocityShader from '../shaders/project-velocity.wgsl?raw';
import solvePressureShader from '../shaders/solve-pressure.wgsl?raw';

export class FlowEngine {
    private readonly device: GPUDevice;
    private readonly width: number;
    private readonly height: number;
    private readonly pressureIterations = 32;

    private readonly dye: PingPongTexture;
    private readonly temperature: PingPongTexture;
    private readonly velocity: PingPongTexture;
    private readonly pressure: PingPongTexture;
    private readonly divergenceTexture: GPUTexture;
    private readonly divergenceView: GPUTextureView;

    private readonly paramsBuffer: GPUBuffer;

    private readonly advectVelocityPipeline: GPUComputePipeline;
    private readonly buoyancyPipeline: GPUComputePipeline;
    private readonly divergencePipeline: GPUComputePipeline;
    private readonly pressurePipeline: GPUComputePipeline;
    private readonly projectVelocityPipeline: GPUComputePipeline;
    private readonly dyePipeline: GPUComputePipeline;
    private readonly temperaturePipeline: GPUComputePipeline;

    constructor(
        device: GPUDevice,
        width = 512,
        height = 512
    ) {
        this.device = device;
        this.width = width;
        this.height = height;

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
            'rgba8unorm',
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
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.advectVelocityPipeline = this.createComputePipeline(advectVelocityShader);
        this.buoyancyPipeline = this.createComputePipeline(applyBuoyancyShader);
        this.divergencePipeline = this.createComputePipeline(computeDivergenceShader);
        this.pressurePipeline = this.createComputePipeline(solvePressureShader);
        this.projectVelocityPipeline = this.createComputePipeline(projectVelocityShader);
        this.temperaturePipeline = this.createComputePipeline(advectTemperatureShader);
        this.dyePipeline = this.createComputePipeline(advectDyeShader);

        this.clearField(this.dye, 4);
        this.clearField(this.temperature, 16);
        this.clearField(this.velocity, 16);
        this.clearField(this.pressure, 16);
        this.clearTexture(this.divergenceTexture, 16);
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

    step(timeSeconds: number, dtSeconds: number): void {
        this.writeSimulationParams(timeSeconds, dtSeconds);

        const workgroupsX = Math.ceil(this.width / 8);
        const workgroupsY = Math.ceil(this.height / 8);
        const encoder = this.device.createCommandEncoder();

        this.encodeComputePass(
            encoder,
            this.advectVelocityPipeline,
            [
                { binding: 0, resource: this.velocity.readView },
                { binding: 1, resource: this.velocity.writeView },
                { binding: 2, resource: { buffer: this.paramsBuffer } }
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
                { binding: 3, resource: { buffer: this.paramsBuffer } }
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
                { binding: 2, resource: { buffer: this.paramsBuffer } }
            ],
            workgroupsX,
            workgroupsY
        );

        for (let i = 0; i < this.pressureIterations; i += 1) {
            this.encodeComputePass(
                encoder,
                this.pressurePipeline,
                [
                    { binding: 0, resource: this.pressure.readView },
                    { binding: 1, resource: this.divergenceView },
                    { binding: 2, resource: this.pressure.writeView },
                    { binding: 3, resource: { buffer: this.paramsBuffer } }
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
                { binding: 3, resource: { buffer: this.paramsBuffer } }
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
                { binding: 3, resource: { buffer: this.paramsBuffer } }
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
                { binding: 3, resource: { buffer: this.paramsBuffer } }
            ],
            workgroupsX,
            workgroupsY
        );
        this.dye.swap();

        this.device.queue.submit([encoder.finish()]);
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

    private writeSimulationParams(timeSeconds: number, dtSeconds: number): void {
        this.device.queue.writeBuffer(
            this.paramsBuffer,
            0,
            new Float32Array([
                timeSeconds,
                dtSeconds,
                this.width,
                this.height,
                1 / this.width,
                1 / this.height,
                0.0,
                80.0,
                9.81,
                1 / 293.15,
                1.56e-5,
                2.2e-5,
                0.24,
                0.85,
                0.055,
                0.020
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
        this.clearTexture(field.readTexture, bytesPerTexel);
        this.clearTexture(field.writeTexture, bytesPerTexel);
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
}
