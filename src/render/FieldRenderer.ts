import { GpuContext } from '../gpu/GpuContext';
import { RenderMode } from './RenderMode';
import presentFieldsShader from '../shaders/present-fields.wgsl?raw';

export class FieldRenderer {
    private readonly renderParamsBuffer: GPUBuffer;
    private readonly pipeline: GPURenderPipeline;

    constructor(private readonly gpu: GpuContext) {
        this.renderParamsBuffer = gpu.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const module = gpu.device.createShaderModule({
            code: presentFieldsShader
        });

        this.pipeline = gpu.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module,
                entryPoint: 'vs'
            },
            fragment: {
                module,
                entryPoint: 'fs',
                targets: [{ format: gpu.format }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });
    }

    render(
        dyeView: GPUTextureView,
        temperatureView: GPUTextureView,
        velocityView: GPUTextureView,
        mode: RenderMode
    ): void {
        const { device, context } = this.gpu;

        device.queue.writeBuffer(
            this.renderParamsBuffer,
            0,
            new Uint32Array([mode, 0, 0, 0])
        );

        const bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: dyeView },
                { binding: 1, resource: temperatureView },
                { binding: 2, resource: velocityView },
                { binding: 3, resource: { buffer: this.renderParamsBuffer } }
            ]
        });

        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.02, g: 0.025, b: 0.035, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }
}
