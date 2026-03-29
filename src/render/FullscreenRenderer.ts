import { GpuContext } from '../gpu/GpuContext';
import shaderSource from '../shaders/fullscreen.wgsl?raw';

export class FullscreenRenderer {
    private readonly gpu: GpuContext;
    private readonly pipeline: GPURenderPipeline;
    private readonly globalsBuffer: GPUBuffer;
    private readonly bindGroup: GPUBindGroup;

    constructor(gpu: GpuContext) {
        this.gpu = gpu;

        const shaderModule = gpu.device.createShaderModule({
            code: shaderSource
        });

        this.pipeline = gpu.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs'
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs',
                targets: [{ format: gpu.format }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        this.globalsBuffer = gpu.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.bindGroup = gpu.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.globalsBuffer }
            }]
        });
    }

    render(timeSeconds: number): void {
        const { device, context, canvas } = this.gpu;

        device.queue.writeBuffer(
            this.globalsBuffer,
            0,
            new Float32Array([timeSeconds, canvas.width, canvas.height, 0])
        );

        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.02, g: 0.03, b: 0.04, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(3);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }
}
