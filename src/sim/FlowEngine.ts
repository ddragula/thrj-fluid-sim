import { PingPongTexture } from './PingPongTexture';
import velocityFieldShader from '../shaders/velocity-field.wgsl?raw';
import advectDensityShader from '../shaders/advect-density.wgsl?raw';

export class FlowEngine {
    private readonly device: GPUDevice;
    private readonly width: number;
    private readonly height: number;

    private readonly density: PingPongTexture;
    private readonly velocityTexture: GPUTexture;
    private readonly velocityView: GPUTextureView;

    private readonly paramsBuffer: GPUBuffer;

    private readonly velocityPipeline: GPUComputePipeline;
    private readonly densityPipeline: GPUComputePipeline;

    constructor(
        device: GPUDevice,
        width = 512,
        height = 512
    ) {
        this.device = device;
        this.width = width;
        this.height = height;

        this.density = new PingPongTexture(
            device,
            width,
            height,
            'rgba8unorm',
            GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
        );

        this.velocityTexture = device.createTexture({
            size: { width, height },
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        });

        this.velocityView = this.velocityTexture.createView();

        this.paramsBuffer = device.createBuffer({
            size: 4 * 4, // 4 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.velocityPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: device.createShaderModule({ code: velocityFieldShader }),
                entryPoint: 'main',
            },
        });

        this.densityPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: device.createShaderModule({ code: advectDensityShader }),
                entryPoint: 'main',
            }
        });

        this.clearDensity();
    }

    getDensityView(): GPUTextureView {
        return this.density.readView;
    }

    step(timeSeconds: number, dtSeconds: number) {
        this.device.queue.writeBuffer(
            this.paramsBuffer,
            0,
            new Float32Array([timeSeconds, dtSeconds, this.width, this.height])
        );

        const encoder = this.device.createCommandEncoder();

        {
            const bindGroup = this.device.createBindGroup({
                layout: this.velocityPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.velocityView },
                    { binding: 1, resource: { buffer: this.paramsBuffer } },
                ],
            });

            const pass = encoder.beginComputePass();
            pass.setPipeline(this.velocityPipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(
                Math.ceil(this.width / 8),
                Math.ceil(this.height / 8)
            );
            pass.end();
        }

        {
            const bindGroup = this.device.createBindGroup({
                layout: this.densityPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.density.readView },
                    { binding: 1, resource: this.velocityView },
                    { binding: 2, resource: this.density.writeView },
                    { binding: 3, resource: { buffer: this.paramsBuffer } },
                ],
            });

            const pass = encoder.beginComputePass();
            pass.setPipeline(this.densityPipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(
                Math.ceil(this.width / 8),
                Math.ceil(this.height / 8)
            );
            pass.end();
        }

        this.device.queue.submit([encoder.finish()]);
        this.density.swap();
    }

    private clearDensity() {
        const zero = new Uint8Array(this.width * this.height * 4); // RGBA8

        this.device.queue.writeTexture(
            { texture: this.density.readTexture },
            zero,
            { bytesPerRow: this.width * 4, rowsPerImage: this.height },
            { width: this.width, height: this.height, depthOrArrayLayers: 1 }
        );

        this.device.queue.writeTexture(
            { texture: this.density.writeTexture },
            zero,
            { bytesPerRow: this.width * 4, rowsPerImage: this.height },
            { width: this.width, height: this.height, depthOrArrayLayers: 1 }
        );
    }
}